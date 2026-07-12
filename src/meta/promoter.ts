/**
 * 沙盒通过后将改写 promote 到磁盘；失败则 restore 快照。
 */

import * as fs from 'fs';
import * as path from 'path';
import type { RewriteResult } from './rewriter';
import { SkillRegistry } from './skill-registry';

export interface PromoteRecord {
  target_key: string;
  path: string;
  action: 'promoted' | 'restored' | 'skipped';
  reason?: string;
}

export class ArtifactPromoter {
  constructor(private readonly registry: SkillRegistry) {}

  /**
   * 将通过沙盒的 rewrite 写入磁盘。
   * 写前确保父目录存在；skill 文件必须已有路径映射。
   */
  promote(rewrites: RewriteResult[]): PromoteRecord[] {
    const records: PromoteRecord[] = [];
    for (const r of rewrites) {
      const resolved = this.registry.resolve(r.target);
      const key = `${r.target.kind}:${r.target.id}`;
      if (!resolved) {
        records.push({
          target_key: key,
          path: '',
          action: 'skipped',
          reason: 'no_disk_mapping',
        });
        continue;
      }
      fs.mkdirSync(path.dirname(resolved.absolutePath), { recursive: true });
      fs.writeFileSync(resolved.absolutePath, r.content, 'utf8');
      records.push({
        target_key: key,
        path: resolved.relativePath,
        action: 'promoted',
      });
    }
    return records;
  }

  /**
   * 回滚：把 previous 内容写回磁盘（来自 VersionStore 恢复的 content）
   */
  restore(
    rewrites: RewriteResult[],
    previousContents: Map<string, string>,
  ): PromoteRecord[] {
    const records: PromoteRecord[] = [];
    for (const r of rewrites) {
      const key = `${r.target.kind}:${r.target.id}`;
      const resolved = this.registry.resolve(r.target);
      const prev = previousContents.get(key);
      if (!resolved || prev == null) {
        records.push({
          target_key: key,
          path: resolved?.relativePath ?? '',
          action: 'skipped',
          reason: !resolved ? 'no_disk_mapping' : 'no_previous_content',
        });
        continue;
      }
      fs.mkdirSync(path.dirname(resolved.absolutePath), { recursive: true });
      fs.writeFileSync(resolved.absolutePath, prev, 'utf8');
      records.push({
        target_key: key,
        path: resolved.relativePath,
        action: 'restored',
      });
    }
    return records;
  }
}
