/**
 * RewriteTarget → 仓库内可改写文件的映射
 * Meta promote 只写这些路径；回滚写回快照内容。
 */

import * as fs from 'fs';
import * as path from 'path';
import type { RewriteTarget, RewriteTargetKind } from './detector';

/** skill id（detector 产出）→ .claude/skills 目录名 */
const SKILL_DIR_BY_ID: Record<string, string> = {
  '01-demand-clarity': '01-demand-clarity',
  '02-estimation-plan': '02-estimation-plan',
  '03-data-collection': '03-data-collection',
  '04-site-inspection': '04-site-inspection',
  '05-method-selection': '05-method-selection',
  '06-comparable-method': '06-comparable-method',
  '07-income-method': '07-income-method',
  '08-cost-method': '08-cost-method',
  '09-result-determination': '09-result-determination',
  '10-report-generation': '10-report-generation',
  '11-report-review': '11-report-review',
  '12-archive': '12-archive',
  'data-collection': '03-data-collection',
  'method-selection': '05-method-selection',
  'calculation-skills': '05-method-selection',
  'meta-control': 'meta-control',
  'research-web-parallel': 'research-web-parallel',
  'run-super-appraiser': 'run-super-appraiser',
};

export interface ArtifactPath {
  kind: RewriteTargetKind;
  targetId: string;
  absolutePath: string;
  /** 相对 repo root，便于日志 */
  relativePath: string;
}

export class SkillRegistry {
  constructor(private readonly repoRoot: string) {}

  /**
   * 解析 target 到磁盘路径；无法映射时返回 null（仅版本库内改写，不落盘）
   */
  resolve(target: RewriteTarget): ArtifactPath | null {
    return this.resolveId(target.kind, target.id);
  }

  resolveId(kind: RewriteTargetKind, targetId: string): ArtifactPath | null {
    let relative: string | null = null;

    if (kind === 'skill' || kind === 'prompt') {
      const dir = SKILL_DIR_BY_ID[targetId] ?? tryFuzzySkillDir(this.repoRoot, targetId);
      if (dir) {
        relative = path.join('.claude', 'skills', dir, 'SKILL.md');
      }
    } else if (kind === 'workflow') {
      if (targetId === 'estimation-pipeline' || targetId === 'pipeline') {
        relative = path.join('docs', 'meta-control-loop.md');
      } else {
        relative = path.join('.super-appraiser', 'artifacts', 'workflow', `${sanitize(targetId)}.md`);
      }
    } else if (kind === 'eval') {
      relative = path.join('.super-appraiser', 'artifacts', 'eval', `${sanitize(targetId)}.md`);
    }

    if (!relative) return null;
    return {
      kind,
      targetId,
      relativePath: relative.replace(/\\/g, '/'),
      absolutePath: path.join(this.repoRoot, relative),
    };
  }

  /** 读取磁盘基线（不存在则 null） */
  readBaseline(target: RewriteTarget): string | null {
    const resolved = this.resolve(target);
    if (!resolved || !fs.existsSync(resolved.absolutePath)) return null;
    return fs.readFileSync(resolved.absolutePath, 'utf8');
  }

  /** 批量加载 detector 目标的磁盘基线 → Map key = kind:id */
  loadBaselines(targets: RewriteTarget[]): Map<string, string> {
    const map = new Map<string, string>();
    for (const t of targets) {
      const content = this.readBaseline(t);
      if (content != null) {
        map.set(`${t.kind}:${t.id}`, content);
      }
    }
    return map;
  }
}

function sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function tryFuzzySkillDir(repoRoot: string, targetId: string): string | null {
  const skillsRoot = path.join(repoRoot, '.claude', 'skills');
  if (!fs.existsSync(skillsRoot)) return null;
  const dirs = fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const exact = dirs.find((d) => d === targetId || d.endsWith(targetId) || d.includes(targetId));
  return exact ?? null;
}
