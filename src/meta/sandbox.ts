/**
 * 沙盒评估：改写后必须通过可执行检查，否则回滚。
 */

import type { RewriteResult } from './rewriter';
import type { MetaDiagnosis } from './detector';

export interface SandboxCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface SandboxReport {
  passed: boolean;
  checks: SandboxCheck[];
}

export interface SandboxEvalInput {
  diagnosis: MetaDiagnosis;
  rewrites: RewriteResult[];
  /** 可选：调用方注入的额外检查（如跑 smoke） */
  extraChecks?: SandboxCheck[];
}

/**
 * 默认可同步完成的沙盒规则（不依赖外部进程）。
 * 重量级 smoke/test 由 extraChecks 注入。
 */
export function evaluateSandbox(input: SandboxEvalInput): SandboxReport {
  const checks: SandboxCheck[] = [];

  // 1) 禁止废话
  for (const r of input.rewrites) {
    checks.push({
      name: `no-retry-platitude:${r.target.id}`,
      passed: !r.contains_retry_platitude,
      detail: r.contains_retry_platitude
        ? '改写内容包含禁止的重试空话'
        : '无重试空话',
    });
  }

  // 2) 改写非空且含 Meta patch
  for (const r of input.rewrites) {
    const hasPatch = r.content.includes('Meta-Control Patch');
    const nonEmpty = r.content.trim().length > 40;
    checks.push({
      name: `rewrite-substance:${r.target.id}`,
      passed: hasPatch && nonEmpty,
      detail: hasPatch && nonEmpty ? '改写含实质补丁' : '改写过短或缺少补丁标记',
    });
  }

  // 3) 停滞诊断必须对应至少一个 rewrite
  checks.push({
    name: 'has-rewrite-when-stagnant',
    passed:
      input.diagnosis.status === 'progressing' || input.rewrites.length > 0,
    detail:
      input.rewrites.length > 0
        ? `产生 ${input.rewrites.length} 处改写`
        : input.diagnosis.status === 'progressing'
          ? '进展中无需改写'
          : '停滞但未产生改写',
  });

  // 4) 额外检查
  if (input.extraChecks?.length) {
    checks.push(...input.extraChecks);
  }

  return {
    passed: checks.every((c) => c.passed),
    checks,
  };
}
