/**
 * 模板加载器
 * 支持内置模板和用户自定义模板。
 * 已加载的模板会缓存在内存中，避免每次 report 生成都读盘。
 */

import * as fs from 'fs';
import * as path from 'path';

export class TemplateLoader {
  private builtinDir: string;
  private customDir?: string;
  private cache: Map<string, string> = new Map();

  constructor(builtinDir?: string, customDir?: string) {
    this.builtinDir = builtinDir ?? path.join(__dirname, '..', '..', 'templates');
    this.customDir = customDir;
  }

  /**
   * 加载指定风格和部分的模板。
   * 缓存键形如 `narrative/cover`，对当前 customDir 仍然透明。
   */
  load(style: 'narrative' | 'tabular', section: string): string {
    const key = `${style}/${section}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;

    // 优先加载自定义模板
    if (this.customDir) {
      try {
        const customPath = path.join(this.customDir, style, `${section}.mustache`);
        if (fs.existsSync(customPath)) {
          const content = fs.readFileSync(customPath, 'utf-8');
          this.cache.set(key, content);
          return content;
        }
      } catch {
        // Fall through to builtin
      }
    }

    // 加载内置模板
    const builtinPath = path.join(this.builtinDir, style, `${section}.mustache`);
    if (fs.existsSync(builtinPath)) {
      const content = fs.readFileSync(builtinPath, 'utf-8');
      this.cache.set(key, content);
      return content;
    }

    // 文件不存在：明确缓存空字符串，避免重复 stat
    this.cache.set(key, '');
    return '';
  }

  /**
   * 加载用户自定义模板目录中的所有模板
   */
  loadAllCustom(style: 'narrative' | 'tabular'): Record<string, string> {
    if (!this.customDir) return {};

    const result: Record<string, string> = {};
    const dir = path.join(this.customDir, style);

    if (!fs.existsSync(dir)) return result;

    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file.endsWith('.mustache')) {
        const section = file.replace('.mustache', '');
        result[section] = fs.readFileSync(path.join(dir, file), 'utf-8');
      }
    }

    return result;
  }
}
