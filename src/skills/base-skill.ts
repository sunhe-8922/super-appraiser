/**
 * Skill 抽象基类
 * 所有估价方法的 skill 都继承此类
 *
 * 对应 GB/T 50291-2015 估价技术路线
 * 强制结构化日志：decision / failure / output（禁止裸 print 当主通道）
 */

import { EstimationContext } from '../types';
import { ValidationResult } from '../validation/method-applicability';
import type { StructuredLogger } from '../observability/logger';

export abstract class BaseSkill {
  /** skill 名称 */
  abstract readonly name: string;

  /** 引用的国标条款编号列表 */
  abstract readonly 规范References: string[];

  protected logger?: StructuredLogger;

  setLogger(logger: StructuredLogger): this {
    this.logger = logger;
    return this;
  }

  /**
   * 执行 skill 的核心方法
   * @param context 输入上下文（包含前置步骤的产出）
   * @returns 更新后的上下文
   */
  abstract execute(context: EstimationContext): EstimationContext;

  /**
   * 带结构化日志的安全执行包装（pipeline 可选用）
   */
  run(context: EstimationContext): EstimationContext {
    const stage = this.name;
    try {
      this.logger?.decision(stage, {
        context: `execute skill ${this.name}`,
        alternatives: ['skip', 'execute'],
        selected: 'execute',
        tradeoffs: `规范引用: ${this.规范References.join(', ')}`,
      });
      const result = this.execute(context);
      this.logger?.output(stage, {
        artifact: this.name,
        summary: `skill ${this.name} completed`,
        metrics: {
          has_plan_methods: Boolean(result.plan?.methods?.length),
          calc_results: result.calculationResults?.length ?? 0,
        },
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const signature = `${this.name}:${message.split(':')[0].slice(0, 80)}`;
      this.logger?.failure(stage, {
        error_type: err instanceof Error ? err.name : 'Error',
        message,
        signature,
      });
      throw err;
    }
  }

  /**
   * 校验输入上下文是否满足执行条件
   * 子类可重写此方法提供前置校验
   */
  protected validate(_context: EstimationContext): ValidationResult {
    return {
      valid: true,
      errors: [],
      warnings: [],
    };
  }
}
