/**
 * 停滞时重写 prompt / skill / workflow / eval 文本。
 * 不说「请再试一次」——直接产出新版本内容。
 */

import type { MetaDiagnosis, RewriteTarget } from './detector';
import type { VersionStore } from './version-store';

export interface RewriteResult {
  target: RewriteTarget;
  version_id: string;
  previous_version_id?: string;
  content: string;
  /** 禁止出现的废话标记 */
  contains_retry_platitude: boolean;
}

const FORBIDDEN_PHRASES = [
  '请再试一次',
  '请重试',
  'try again',
  'please retry',
  '再试一次即可',
];

export class PromptRewriter {
  constructor(private readonly versions: VersionStore) {}

  /**
   * 基于诊断生成改写。优先使用已有基线；无基线则从内置模板生成。
   */
  rewrite(diagnosis: MetaDiagnosis, baselines: Map<string, string> = new Map()): RewriteResult[] {
    const results: RewriteResult[] = [];
    for (const target of diagnosis.rewrite_targets) {
      const key = `${target.kind}:${target.id}`;
      const baseline =
        baselines.get(key) ??
        this.versions.latest(target.kind, target.id)?.content ??
        defaultBaseline(target);

      const prev = this.versions.save(target.kind, target.id, baseline, 'pre-rewrite-baseline');
      const nextContent = applyRewrite(baseline, diagnosis, target);
      const snap = this.versions.save(target.kind, target.id, nextContent, 'meta-rewrite');

      results.push({
        target,
        version_id: snap.version_id,
        previous_version_id: prev.version_id,
        content: nextContent,
        contains_retry_platitude: FORBIDDEN_PHRASES.some((p) =>
          nextContent.toLowerCase().includes(p.toLowerCase()),
        ),
      });
    }
    return results;
  }
}

function defaultBaseline(target: RewriteTarget): string {
  return [
    `# ${target.kind}: ${target.id}`,
    '',
    '## Purpose',
    `Executable guidance for ${target.id}.`,
    '',
    '## Constraints',
    '- Prefer evidence over assumption',
    '- Structured logging for decisions/failures/retries/outputs',
    '- On stagnation: rewrite system, never empty retry speech',
    '',
  ].join('\n');
}

function applyRewrite(
  baseline: string,
  diagnosis: MetaDiagnosis,
  target: RewriteTarget,
): string {
  const antiLoop = [
    '',
    '## Meta-Control Patch (auto)',
    `Status: ${diagnosis.status}`,
    `Reasons: ${diagnosis.reasons.join('; ')}`,
    `Rationale: ${target.rationale}`,
    '',
    '### Hard rules after patch',
    '1. Do not emit empty retry speech. Change approach, inputs, or evaluation criteria instead of re-running blindly.',
    '2. On repeated error signature: change strategy, data source, or validation before re-executing.',
    '3. Log every decision/failure/retry/output as structured events.',
    '4. Prefer first-party sources; if data incomplete, run sufficiency check and expand collection.',
    '',
    '### Detection evidence',
    ...diagnosis.evidence.map((e) => `- [${e.kind}] ${e.detail}`),
    '',
  ].join('\n');

  // 避免无限堆叠同一补丁
  const marker = '## Meta-Control Patch (auto)';
  if (baseline.includes(marker)) {
    return baseline.replace(/## Meta-Control Patch \(auto\)[\s\S]*$/m, antiLoop.trimStart());
  }
  return `${baseline.trimEnd()}\n${antiLoop}`;
}
