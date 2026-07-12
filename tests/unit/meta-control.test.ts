import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { StructuredLogger } from '../../src/observability/logger';
import { PlateauDetector } from '../../src/meta/detector';
import { MetaController, findRepoRoot } from '../../src/meta/controller';
import { VersionStore } from '../../src/meta/version-store';
import { evaluateSandbox } from '../../src/meta/sandbox';
import { PromptRewriter } from '../../src/meta/rewriter';
import { SkillRegistry } from '../../src/meta/skill-registry';
import { ArtifactPromoter } from '../../src/meta/promoter';

describe('StructuredLogger', () => {
  it('records decision/failure/retry/output as structured events', () => {
    const logger = new StructuredLogger({ agentId: 'worker', runId: 'run-1' });
    logger.decision('method_selection', {
      context: 'choose methods',
      alternatives: ['comparable', 'income'],
      selected: 'comparable+income',
      tradeoffs: 'data available',
    });
    logger.failure('calculation', {
      error_type: 'DataError',
      message: 'missing comps',
      signature: 'calculation:missing comps',
    });
    logger.retry('calculation', { attempt: 2, trigger: 'after data fix' });
    logger.output('report_generation', {
      artifact: 'report',
      summary: 'ok',
      metrics: { length: 100 },
    });

    const events = logger.getEvents();
    expect(events).toHaveLength(4);
    expect(events.map((e) => e.event)).toEqual([
      'decision',
      'failure',
      'retry',
      'output',
    ]);
    expect(events[0].run_id).toBe('run-1');
    expect(events.every((e) => e.event_id && e.ts)).toBe(true);
  });

  it('redacts sensitive keys and can persist JSONL', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-log-'));
    const logger = new StructuredLogger({
      agentId: 'worker',
      runId: 'run-jsonl',
      logDir: dir,
    });
    logger.log('output', { api_key: 'secret-value', ok: true }, { stage: 'x' });
    const events = StructuredLogger.loadJsonl(logger.getLogPath()!);
    expect(events).toHaveLength(1);
    expect(events[0].payload.api_key).toBe('[REDACTED]');
    expect(events[0].payload.ok).toBe(true);
  });
});

describe('PlateauDetector', () => {
  it('detects repeated same error signature as looping', () => {
    const logger = new StructuredLogger({ runId: 'r2' });
    for (let i = 0; i < 3; i++) {
      logger.failure('calculation', {
        error_type: 'DataError',
        message: 'missing comps',
        signature: 'calculation:missing comps',
      });
    }
    const d = new PlateauDetector({ sameErrorThreshold: 3 }).analyze(logger.getEvents());
    expect(d.status).toBe('looping');
    expect(d.rewrite_targets.length).toBeGreaterThan(0);
    expect(d.evidence.some((e) => e.kind === 'repeated_error')).toBe(true);
  });

  it('returns progressing when healthy', () => {
    const logger = new StructuredLogger({ runId: 'r3' });
    logger.decision('x', {
      context: 'a',
      alternatives: ['1'],
      selected: '1',
      tradeoffs: 't',
    });
    logger.output('x', { artifact: 'a', summary: 'done', metrics: { v: 1 } });
    const d = new PlateauDetector().analyze(logger.getEvents());
    expect(d.status).toBe('progressing');
  });
});

describe('MetaController rewrite + sandbox + rollback', () => {
  it('rewrites on stagnation and promotes when sandbox passes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-ver-'));
    const versions = new VersionStore(dir);
    const meta = new MetaController({
      versions,
      logger: new StructuredLogger({ agentId: 'meta', runId: 'meta-1' }),
    });

    const worker = new StructuredLogger({ runId: 'w1' });
    for (let i = 0; i < 4; i++) {
      worker.failure('data_collection', {
        error_type: 'EmptyData',
        message: 'no comps',
        signature: 'data_collection:no comps',
      });
    }

    const result = meta.runCycle(worker.getEvents(), {
      baselines: new Map([
        ['skill:03-data-collection', '# data-collection\n\nGather market data.\n'],
      ]),
    });

    expect(['looping', 'stagnant']).toContain(result.diagnosis.status);
    expect(result.rewrites.length).toBeGreaterThan(0);
    expect(result.sandbox?.passed).toBe(true);
    expect(result.promoted).toBe(true);
    expect(result.rolled_back).toBe(false);
    expect(result.rewrites[0].content).toContain('Meta-Control Patch');
    expect(result.rewrites[0].contains_retry_platitude).toBe(false);
  });

  it('rolls back when sandbox fails', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-ver2-'));
    const versions = new VersionStore(dir);
    const rewriter = new PromptRewriter(versions);

    // craft rewrite that contains forbidden phrase by patching via evaluateSandbox path
    const worker = new StructuredLogger({ runId: 'w2' });
    for (let i = 0; i < 3; i++) {
      worker.failure('calculation', {
        error_type: 'X',
        message: 'boom',
        signature: 'calculation:boom',
      });
    }
    const diagnosis = new PlateauDetector().analyze(worker.getEvents());
    const rewrites = rewriter.rewrite(diagnosis);
    // force fail sandbox by injecting platitude flag
    rewrites[0].contains_retry_platitude = true;
    rewrites[0].content = '请再试一次';

    const sandbox = evaluateSandbox({ diagnosis, rewrites });
    expect(sandbox.passed).toBe(false);

    // VersionStore rollback unit
    versions.save('skill', 'test-skill', 'v1', 'good');
    versions.save('skill', 'test-skill', 'v2-bad', 'bad');
    const restored = versions.rollback('skill', 'test-skill');
    expect(restored?.content).toBe('v1');
  });
});

describe('Skill promote / disk rollback', () => {
  it('findRepoRoot locates package with .claude/skills', () => {
    const root = findRepoRoot(path.join(__dirname, '../..'));
    expect(fs.existsSync(path.join(root, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.claude', 'skills'))).toBe(true);
  });

  it('promotes rewrite to a temp skill file and restores on sandbox failure', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-repo-'));
    const skillDir = path.join(repo, '.claude', 'skills', '03-data-collection');
    fs.mkdirSync(skillDir, { recursive: true });
    const skillPath = path.join(skillDir, 'SKILL.md');
    const original = '# data-collection\n\nGather market data only.\n';
    fs.writeFileSync(skillPath, original, 'utf8');
    fs.writeFileSync(path.join(repo, 'package.json'), '{"name":"tmp"}', 'utf8');

    const versions = new VersionStore(path.join(repo, '.super-appraiser', 'versions'));
    const registry = new SkillRegistry(repo);
    const meta = new MetaController({
      versions,
      registry,
      promoter: new ArtifactPromoter(registry),
      logger: new StructuredLogger({ agentId: 'meta', runId: 'promo-1' }),
      repoRoot: repo,
      promoteToDisk: true,
    });

    const worker = new StructuredLogger({ runId: 'w-promo' });
    for (let i = 0; i < 3; i++) {
      worker.failure('data_collection', {
        error_type: 'EmptyData',
        message: 'no comps',
        signature: 'data_collection:no comps',
      });
    }

    const ok = meta.runCycle(worker.getEvents());
    expect(ok.sandbox?.passed).toBe(true);
    expect(ok.promoted).toBe(true);
    expect(ok.disk_ops.some((o) => o.action === 'promoted')).toBe(true);
    const afterPromote = fs.readFileSync(skillPath, 'utf8');
    expect(afterPromote).toContain('Meta-Control Patch');
    expect(afterPromote).not.toBe(original);

    // Force failing cycle: inject bad extra check after a clean promote path
    // Simulate sandbox fail with platitude via evaluateSandbox path + restore
    const rewrites = ok.rewrites.map((r) => ({
      ...r,
      contains_retry_platitude: true,
      content: '请再试一次',
    }));
    const failSandbox = evaluateSandbox({
      diagnosis: ok.diagnosis,
      rewrites,
    });
    expect(failSandbox.passed).toBe(false);

    const promoter = new ArtifactPromoter(registry);
    const restoredOps = promoter.restore(ok.rewrites, new Map([
      ['skill:03-data-collection', original],
    ]));
    expect(restoredOps[0]?.action).toBe('restored');
    expect(fs.readFileSync(skillPath, 'utf8')).toBe(original);
  });
});

