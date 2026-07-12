/**
 * Meta Agent 核心：只读 Worker 结构化日志，判定停滞/循环/进展。
 * 禁止输出「请再试一次」类空话；只返回诊断 + 证据窗口。
 */

import type { AgentEvent } from '../observability/types';

export type DiagnosisStatus = 'progressing' | 'looping' | 'stagnant';

export interface DiagnosisEvidence {
  kind: 'repeated_error' | 'redundant_work' | 'plateau' | 'progress';
  detail: string;
  event_ids: string[];
}

export interface MetaDiagnosis {
  status: DiagnosisStatus;
  reasons: string[];
  evidence: DiagnosisEvidence[];
  /** 建议改写的目标（skill / workflow / eval） */
  rewrite_targets: RewriteTarget[];
  window: { from_event_id?: string; to_event_id?: string; event_count: number };
}

export type RewriteTargetKind = 'skill' | 'prompt' | 'workflow' | 'eval';

export interface RewriteTarget {
  kind: RewriteTargetKind;
  id: string;
  rationale: string;
}

export interface DetectorOptions {
  /** 相同 error signature 连续出现阈值 */
  sameErrorThreshold?: number;
  /** 相同 action+target 无进展重复阈值 */
  redundantWorkThreshold?: number;
  /** 最近 N 条 failure 用于平台期判断 */
  plateauWindow?: number;
  /** 窗口内 failure 占比超过此值视为平台期 */
  plateauFailureRatio?: number;
}

const DEFAULTS: Required<DetectorOptions> = {
  sameErrorThreshold: 3,
  redundantWorkThreshold: 3,
  plateauWindow: 12,
  plateauFailureRatio: 0.5,
};

export class PlateauDetector {
  private readonly opts: Required<DetectorOptions>;

  constructor(opts: DetectorOptions = {}) {
    this.opts = { ...DEFAULTS, ...opts };
  }

  /**
   * 读日志 → 诊断
   */
  analyze(events: readonly AgentEvent[]): MetaDiagnosis {
    if (events.length === 0) {
      return {
        status: 'progressing',
        reasons: ['无日志事件，视为尚未启动'],
        evidence: [],
        rewrite_targets: [],
        window: { event_count: 0 },
      };
    }

    const evidence: DiagnosisEvidence[] = [];
    const reasons: string[] = [];
    const rewrite_targets: RewriteTarget[] = [];

    // 1) 连续相同错误
    const failures = events.filter((e) => e.event === 'failure');
    const sigStreak = longestFailureSignatureStreak(failures);
    if (sigStreak.count >= this.opts.sameErrorThreshold) {
      evidence.push({
        kind: 'repeated_error',
        detail: `相同错误签名连续 ${sigStreak.count} 次: ${sigStreak.signature}`,
        event_ids: sigStreak.eventIds,
      });
      reasons.push('连续犯同样的错');
      rewrite_targets.push({
        kind: 'skill',
        id: inferSkillFromStage(sigStreak.stage),
        rationale: `错误签名 ${sigStreak.signature} 在阶段 ${sigStreak.stage ?? 'unknown'} 重复`,
      });
    }

    // 2) 重复劳动：相同 stage + action 的 decision/retry 无新 output 指标
    const redundant = detectRedundantWork(events, this.opts.redundantWorkThreshold);
    if (redundant) {
      evidence.push(redundant);
      reasons.push('重复劳动且无进展');
      rewrite_targets.push({
        kind: 'workflow',
        id: 'estimation-pipeline',
        rationale: redundant.detail,
      });
    }

    // 3) 平台期：最近窗口 failure 占比高且无新成功 output
    const plateau = detectPlateau(events, this.opts.plateauWindow, this.opts.plateauFailureRatio);
    if (plateau) {
      evidence.push(plateau);
      reasons.push('进入平台期（指标不再改善）');
      rewrite_targets.push({
        kind: 'eval',
        id: 'acceptance-criteria',
        rationale: plateau.detail,
      });
      rewrite_targets.push({
        kind: 'prompt',
        id: 'data-collection',
        rationale: '资料/方法阶段停滞时优先改写资料搜集与评估标准',
      });
    }

    let status: DiagnosisStatus = 'progressing';
    if (sigStreak.count >= this.opts.sameErrorThreshold || redundant) {
      status = 'looping';
    }
    if (plateau && status !== 'looping') {
      status = 'stagnant';
    }
    if (status === 'looping' && plateau) {
      status = 'stagnant';
      reasons.push('循环失败叠加平台期');
    }

    if (status === 'progressing') {
      evidence.push({
        kind: 'progress',
        detail: '未检测到重复错误、重复劳动或平台期',
        event_ids: events.slice(-3).map((e) => e.event_id),
      });
      reasons.push('运行正常推进');
    }

    return {
      status,
      reasons,
      evidence,
      rewrite_targets: dedupeTargets(rewrite_targets),
      window: {
        from_event_id: events[0]?.event_id,
        to_event_id: events[events.length - 1]?.event_id,
        event_count: events.length,
      },
    };
  }
}

function longestFailureSignatureStreak(failures: AgentEvent[]): {
  count: number;
  signature: string;
  stage?: string;
  eventIds: string[];
} {
  if (failures.length === 0) {
    return { count: 0, signature: '', eventIds: [] };
  }
  let best = { count: 1, signature: '', stage: undefined as string | undefined, eventIds: [] as string[] };
  let curSig = '';
  let curCount = 0;
  let curIds: string[] = [];
  let curStage: string | undefined;

  for (const f of failures) {
    const sig = String(f.payload.signature ?? f.payload.error_type ?? f.payload.message ?? 'unknown');
    if (sig === curSig) {
      curCount += 1;
      curIds.push(f.event_id);
    } else {
      curSig = sig;
      curCount = 1;
      curIds = [f.event_id];
      curStage = f.stage;
    }
    if (curCount > best.count) {
      best = { count: curCount, signature: curSig, stage: curStage ?? f.stage, eventIds: [...curIds] };
    }
  }
  return best;
}

function detectRedundantWork(
  events: readonly AgentEvent[],
  threshold: number,
): DiagnosisEvidence | null {
  const keys = new Map<string, string[]>();
  for (const e of events) {
    if (e.event !== 'decision' && e.event !== 'retry') continue;
    const action = String(e.payload.selected ?? e.payload.trigger ?? e.event);
    const target = String(e.payload.context ?? e.stage ?? '');
    const key = `${e.stage ?? ''}|${action}|${target}`;
    const list = keys.get(key) ?? [];
    list.push(e.event_id);
    keys.set(key, list);
  }

  // 若同一 key 重复且中间没有更高价值的 output metrics 变化，判冗余
  const outputs = events.filter((e) => e.event === 'output');
  for (const [key, ids] of keys) {
    if (ids.length < threshold) continue;
    const relatedOutputs = outputs.filter((o) => ids.some((id) => o.parent_event_id === id || o.stage === key.split('|')[0]));
    const metricsFingerprint = relatedOutputs
      .map((o) => JSON.stringify(o.payload.metrics ?? o.payload.summary ?? ''))
      .join('|');
    const uniqueMetrics = new Set(
      relatedOutputs.map((o) => JSON.stringify(o.payload.metrics ?? o.payload.summary ?? '')),
    );
    if (relatedOutputs.length === 0 || uniqueMetrics.size <= 1) {
      return {
        kind: 'redundant_work',
        detail: `动作重复 ${ids.length} 次且无进展: ${key}; metrics=${metricsFingerprint || 'none'}`,
        event_ids: ids,
      };
    }
  }
  return null;
}

function detectPlateau(
  events: readonly AgentEvent[],
  window: number,
  failureRatio: number,
): DiagnosisEvidence | null {
  const slice = events.slice(-window);
  if (slice.length < Math.min(6, window)) return null;
  const failures = slice.filter((e) => e.event === 'failure' || e.outcome === 'error');
  const ratio = failures.length / slice.length;
  const recentOutputs = slice.filter((e) => e.event === 'output' && e.outcome === 'ok');
  if (ratio >= failureRatio && recentOutputs.length === 0) {
    return {
      kind: 'plateau',
      detail: `最近 ${slice.length} 事件中失败占比 ${(ratio * 100).toFixed(0)}%，且无成功 output`,
      event_ids: slice.map((e) => e.event_id),
    };
  }
  return null;
}

function inferSkillFromStage(stage?: string): string {
  if (!stage) return 'unknown-skill';
  const map: Record<string, string> = {
    demand_clarity: '01-demand-clarity',
    estimation_plan: '02-estimation-plan',
    data_collection: '03-data-collection',
    site_inspection: '04-site-inspection',
    method_selection: '05-method-selection',
    calculation: 'calculation-skills',
    result_determination: '09-result-determination',
    report_generation: '10-report-generation',
    report_review: '11-report-review',
    archive: '12-archive',
  };
  return map[stage] ?? stage;
}

function dedupeTargets(targets: RewriteTarget[]): RewriteTarget[] {
  const seen = new Set<string>();
  const out: RewriteTarget[] = [];
  for (const t of targets) {
    const k = `${t.kind}:${t.id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}
