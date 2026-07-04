/**
 * 模板加载器
 * 支持内置模板和用户自定义模板
 */

import * as fs from 'fs';
import * as path from 'path';

export class TemplateLoader {
  private builtinDir: string;
  private customDir?: string;

  constructor(builtinDir?: string, customDir?: string) {
    this.builtinDir = builtinDir ?? path.join(__dirname, 'templates');
    this.customDir = customDir;
  }

  /**
   * 加载指定风格和部分的模板
   */
  load(style: 'narrative' | 'tabular', section: string): string {
    // 优先加载自定义模板
    if (this.customDir) {
      try {
        const customPath = path.join(this.customDir, style, `${section}.mustache`);
        if (fs.existsSync(customPath)) {
          return fs.readFileSync(customPath, 'utf-8');
        }
      } catch {
        // Fall through to builtin
      }
    }

    // 加载内置模板
    const builtinPath = path.join(this.builtinDir, style, `${section}.mustache`);
    if (fs.existsSync(builtinPath)) {
      return fs.readFileSync(builtinPath, 'utf-8');
    }

    // 如果 mustache 文件不存在，返回空字符串（使用 engine 内嵌模板）
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
