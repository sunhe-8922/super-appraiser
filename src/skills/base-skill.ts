/**
 * Skill 抽象基类
 * 所有估价方法的 skill 都继承此类
 *
 * 对应 GB/T 50291-2015 估价技术路线
 */

import { EstimationContext } from '../types';
import { ValidationResult } from '../validation/method-applicability';

export abstract class BaseSkill {
  /** skill 名称 */
  abstract readonly name: string;

  /** 引用的国标条款编号列表 */
  abstract readonly 规范References: string[];

  /**
   * 执行 skill 的核心方法
   * @param context 输入上下文（包含前置步骤的产出）
   * @returns 更新后的上下文
   */
  abstract execute(context: EstimationContext): EstimationContext;

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
