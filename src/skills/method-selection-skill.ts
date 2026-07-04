/**
 * 方法选择 Skill
 * 对应 GB/T 50291-2015 第4.1节（4.1.2条+4.1.3条）
 */

import { BaseSkill } from './base-skill';
import { EstimationContext, EstimatedMethod, CollectedData } from '../types';
import { assessMethodApplicability, validateMethodCount } from '../validation/method-applicability';

export class MethodSelectionSkill extends BaseSkill {
  readonly name = 'method-selection';
  readonly 规范References = ['4.1', '4.1.1', '4.1.2', '4.1.3'];

  execute(context: EstimationContext): EstimationContext {
    const validation = this.validate(context);
    if (!validation.valid) {
      throw new Error(`方法选择前置校验失败: ${validation.errors.join(', ')}`);
    }

    const data = context.collectedData;
    const comparableCount = data?.comparables?.length ?? 0;
    const hasRentalData = !!data?.rentalData && data.rentalData.length > 0;
    const hasCostData = !!data?.costData;
    const hasDevelopmentPotential = this.checkDevelopmentPotential(context.estObject);

    // 4.1.2条：方法适用性判断
    const assessment = assessMethodApplicability(
      comparableCount,
      hasRentalData,
      hasCostData,
      hasDevelopmentPotential,
    );

    // 4.1.3条：方法数量校验
    const countValidation = validateMethodCount(assessment.selected);
    if (!countValidation.valid) {
      throw new Error(`方法选择校验失败: ${countValidation.errors.join('; ')}`);
    }

    // 将选择的记录到上下文中
    return {
      ...context,
      plan: {
        ...context.plan!,
        methods: assessment.selected,
      },
    };
  }

  /**
   * 检查是否有开发潜力
   * 4.1.2条第4款：具有开发或再开发潜力的，应选用假设开发法
   */
  private checkDevelopmentPotential(obj: EstimationContext['estObject']): boolean {
    // 简化版：如果建筑物有效年龄 > 20 年或状况差/危险，可能有开发潜力
    const currentAge = new Date().getFullYear() - obj.physical.yearBuilt;
    return currentAge > 20 || obj.physical.condition === '差' || obj.physical.condition === '危险';
  }
}
