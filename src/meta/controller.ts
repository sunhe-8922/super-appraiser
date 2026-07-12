/**
 * Meta 控制环：
 * Worker 日志 → 诊断 →（停滞）改写 → 沙盒 → 通过则 promote 落盘 / 失败则版本+磁盘回滚
 */

import * as fs from 'fs';
import * as path from 'path';
import { StructuredLogger } from '../observability/logger';
import type { AgentEvent } from '../observability/types';
import { PlateauDetector, type MetaDiagnosis } from './detector';
import { PromptRewriter, type RewriteResult } from './rewriter';
import { evaluateSandbox, type SandboxCheck, type SandboxReport } from './sandbox';
import { VersionStore } from './version-store';
import { SkillRegistry } from './skill-registry';
import { ArtifactPromoter, type PromoteRecord } from './promoter';

export interface MetaControllerOptions {
  logger?: StructuredLogger;
  detector?: PlateauDetector;
  versions?: VersionStore;
  rewriter?: PromptRewriter;
  /** 仓库根目录；默认 process.cwd()。用于 skill 落盘 */
  repoRoot?: string;
  registry?: SkillRegistry;
  promoter?: ArtifactPromoter;
  /** 沙盒通过后是否写入磁盘（默认 false，避免误改仓库；显式 true 才 promote） */
  promoteToDisk?: boolean;
}

export interface MetaCycleResult {
  diagnosis: MetaDiagnosis;
  rewrites: RewriteResult[];
  sandbox: SandboxReport | null;
  rolled_back: boolean;
  promoted: boolean;
  disk_ops: PromoteRecord[];
}

export class MetaController {
  private readonly logger: StructuredLogger;
  private readonly detector: PlateauDetector;
  private readonly versions: VersionStore;
  private readonly rewriter: PromptRewriter;
  private readonly registry: SkillRegistry;
  private readonly promoter: ArtifactPromoter;
  private readonly promoteToDisk: boolean;

  constructor(options: MetaControllerOptions = {}) {
    this.logger = options.logger ?? new StructuredLogger({ agentId: 'meta' });
    this.detector = options.detector ?? new PlateauDetector();
    this.versions = options.versions ?? new VersionStore();
    this.rewriter = options.rewriter ?? new PromptRewriter(this.versions);
    const root = options.repoRoot ?? process.cwd();
    this.registry = options.registry ?? new SkillRegistry(root);
    this.promoter = options.promoter ?? new ArtifactPromoter(this.registry);
    this.promoteToDisk = options.promoteToDisk ?? false;
  }

  getLogger(): StructuredLogger {
    return this.logger;
  }

  getVersions(): VersionStore {
    return this.versions;
  }

  getRegistry(): SkillRegistry {
    return this.registry;
  }

  /**
   * 执行一轮 Meta 循环。
   * progressing → 只记诊断；stagnant/looping → 改写 + 沙盒 + promote 或回滚。
   */
  runCycle(
    workerEvents: readonly AgentEvent[],
    options: {
      baselines?: Map<string, string>;
      extraSandboxChecks?: SandboxCheck[];
      /** 覆盖实例级 promoteToDisk */
      promoteToDisk?: boolean;
    } = {},
  ): MetaCycleResult {
    const diagnosis = this.detector.analyze(workerEvents);
    this.logger.log(
      'meta_diagnosis',
      {
        status: diagnosis.status,
        reasons: diagnosis.reasons,
        evidence: diagnosis.evidence,
        rewrite_targets: diagnosis.rewrite_targets,
      },
      {
        outcome:
          diagnosis.status === 'progressing'
            ? 'progressing'
            : diagnosis.status === 'looping'
              ? 'partial'
              : 'stagnant',
      },
    );

    if (diagnosis.status === 'progressing') {
      return {
        diagnosis,
        rewrites: [],
        sandbox: null,
        rolled_back: false,
        promoted: false,
        disk_ops: [],
      };
    }

    // 磁盘 skill 基线优先，再合并调用方 baselines
    const diskBaselines = this.registry.loadBaselines(diagnosis.rewrite_targets);
    const baselines = new Map<string, string>([
      ...diskBaselines,
      ...(options.baselines ?? new Map()),
    ]);

    // 记录改写前磁盘内容，供失败回滚
    const preDisk = new Map<string, string>();
    for (const t of diagnosis.rewrite_targets) {
      const key = `${t.kind}:${t.id}`;
      const content = baselines.get(key) ?? this.registry.readBaseline(t);
      if (content != null) preDisk.set(key, content);
    }

    const rewrites = this.rewriter.rewrite(diagnosis, baselines);
    for (const r of rewrites) {
      this.logger.log(
        'meta_rewrite',
        {
          target: r.target,
          version_id: r.version_id,
          previous_version_id: r.previous_version_id,
          content_length: r.content.length,
        },
        { outcome: 'ok' },
      );
    }

    const sandbox = evaluateSandbox({
      diagnosis,
      rewrites,
      extraChecks: options.extraSandboxChecks,
    });
    this.logger.log(
      'meta_sandbox',
      { passed: sandbox.passed, checks: sandbox.checks },
      { outcome: sandbox.passed ? 'ok' : 'error' },
    );

    const shouldPromote = options.promoteToDisk ?? this.promoteToDisk;

    if (!sandbox.passed) {
      for (const r of rewrites) {
        const restored = this.versions.rollback(r.target.kind, r.target.id);
        this.logger.log(
          'meta_rollback',
          {
            target: r.target,
            restored_version_id: restored?.version_id ?? null,
            reason: 'sandbox_failed',
          },
          { outcome: 'ok' },
        );
      }
      // 若曾错误 promote 过不会走到这里；确保磁盘仍是 preDisk
      const disk_ops = shouldPromote
        ? this.promoter.restore(rewrites, preDisk)
        : [];
      return {
        diagnosis,
        rewrites,
        sandbox,
        rolled_back: true,
        promoted: false,
        disk_ops,
      };
    }

    let disk_ops: PromoteRecord[] = [];
    if (shouldPromote) {
      disk_ops = this.promoter.promote(rewrites);
      this.logger.log(
        'meta_rewrite',
        {
          action: 'promote_to_disk',
          ops: disk_ops,
        },
        { outcome: 'ok', stage: 'meta_promote' },
      );
    }

    return {
      diagnosis,
      rewrites,
      sandbox,
      rolled_back: false,
      promoted: rewrites.length > 0,
      disk_ops,
    };
  }
}

/** 便捷：相对当前包定位 monorepo/repo root（含 .claude/skills） */
export function findRepoRoot(startDir: string = process.cwd()): string {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 8; i++) {
    const skills = path.join(dir, '.claude', 'skills');
    const pkg = path.join(dir, 'package.json');
    if (fs.existsSync(skills) && fs.existsSync(pkg)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(startDir);
}
