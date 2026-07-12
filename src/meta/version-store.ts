/**
 * 可回滚的版本快照：skill / prompt / workflow / eval 文本。
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type { RewriteTargetKind } from './detector';

export interface VersionSnapshot {
  version_id: string;
  created_at: string;
  kind: RewriteTargetKind;
  target_id: string;
  content: string;
  label?: string;
}

export class VersionStore {
  private readonly root: string;
  private readonly memory = new Map<string, VersionSnapshot[]>();

  constructor(rootDir?: string) {
    this.root = rootDir ?? path.join(process.cwd(), '.super-appraiser', 'versions');
    fs.mkdirSync(this.root, { recursive: true });
  }

  private key(kind: RewriteTargetKind, targetId: string): string {
    return `${kind}::${targetId}`;
  }

  private filePath(kind: RewriteTargetKind, targetId: string): string {
    const safe = targetId.replace(/[^a-zA-Z0-9._-]/g, '_');
    return path.join(this.root, `${kind}-${safe}.json`);
  }

  /** 保存当前内容为新版本，返回 version_id */
  save(
    kind: RewriteTargetKind,
    targetId: string,
    content: string,
    label?: string,
  ): VersionSnapshot {
    const snap: VersionSnapshot = {
      version_id: randomUUID(),
      created_at: new Date().toISOString(),
      kind,
      target_id: targetId,
      content,
      label,
    };
    const k = this.key(kind, targetId);
    const list = this.memory.get(k) ?? this.loadDisk(kind, targetId);
    list.push(snap);
    this.memory.set(k, list);
    fs.writeFileSync(this.filePath(kind, targetId), JSON.stringify(list, null, 2), 'utf8');
    return snap;
  }

  latest(kind: RewriteTargetKind, targetId: string): VersionSnapshot | null {
    const list = this.memory.get(this.key(kind, targetId)) ?? this.loadDisk(kind, targetId);
    return list.length ? list[list.length - 1] : null;
  }

  /** 回滚到上一版本（去掉最新，返回恢复的内容） */
  rollback(kind: RewriteTargetKind, targetId: string): VersionSnapshot | null {
    const k = this.key(kind, targetId);
    const list = this.memory.get(k) ?? this.loadDisk(kind, targetId);
    if (list.length < 2) {
      return list[0] ?? null;
    }
    list.pop();
    this.memory.set(k, list);
    fs.writeFileSync(this.filePath(kind, targetId), JSON.stringify(list, null, 2), 'utf8');
    return list[list.length - 1];
  }

  history(kind: RewriteTargetKind, targetId: string): VersionSnapshot[] {
    return [...(this.memory.get(this.key(kind, targetId)) ?? this.loadDisk(kind, targetId))];
  }

  private loadDisk(kind: RewriteTargetKind, targetId: string): VersionSnapshot[] {
    const fp = this.filePath(kind, targetId);
    if (!fs.existsSync(fp)) return [];
    try {
      const raw = JSON.parse(fs.readFileSync(fp, 'utf8')) as VersionSnapshot[];
      this.memory.set(this.key(kind, targetId), raw);
      return raw;
    } catch {
      return [];
    }
  }
}
