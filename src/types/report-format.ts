/**
 * 报告格式类型定义
 * 对应 GB/T 50291-2015 第7章
 */

/**
 * 报告风格
 * - narrative: 叙述式（7.0.2）
 * - tabular: 表格式（7.0.21）
 */
export type ReportStyle = 'narrative' | 'tabular';

/**
 * 输出格式
 */
export type OutputFormat = 'markdown' | 'html' | 'pdf' | 'word' | 'dashboard';

/**
 * 报告生成配置
 */
export interface ReportConfig {
  style: ReportStyle;
  format: OutputFormat;
  /** 用户自定义模板目录 */
  customTemplateDir?: string;
}
