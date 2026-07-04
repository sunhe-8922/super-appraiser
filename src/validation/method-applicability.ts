/**
 * 方法适用性判断器
 * 对应 GB/T 50291-2015 第4.1.2条、4.1.3条
 */

import { EstimatedMethod } from '../types';

/**
 * 方法适用性评估结果
 */
export interface MethodAssessment {
  /** 应选的方法（4.1.2条中的"应"） */
  mandatory: EstimatedMethod[];
  /** 宜选的方法（4.1.2条中的"宜"） */
  recommended: EstimatedMethod[];
  /** 可选的方法 */
  optional: EstimatedMethod[];
  /** 最终采用的方法列表 */
  selected: EstimatedMethod[];
}

/**
 * 校验结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 根据市场条件和估价对象状况，判断适用的估价方法。
 *
 * 4.1.2条：
 *   第1款：同类房地产有较多交易的，应选用比较法
 *   第2款：有租金等经济收入的，应选用收益法
 *   第3款：没有交易或交易很少，且没有租金等经济收入的，应选用成本法
 *   第4款：具有开发或再开发潜力的，应选用假设开发法
 *
 * @param comparableCount - 同类可比交易实例数量
 * @param hasRentalData - 是否有租金等收益数据
 * @param hasCostData - 是否有成本数据
 * @param hasDevelopmentPotential - 是否具有开发或再开发潜力
 * @returns 方法适用性评估结果
 */
export function assessMethodApplicability(
  comparableCount: number,
  hasRentalData: boolean,
  hasCostData: boolean,
  hasDevelopmentPotential: boolean,
): MethodAssessment {
  const mandatory: EstimatedMethod[] = [];
  const recommended: EstimatedMethod[] = [];
  const optional: EstimatedMethod[] = [];

  // 4.1.2条第1款：同类房地产有较多交易的，应选用比较法
  // 约定"较多"为 >= 3 个可比实例
  if (comparableCount >= 3) {
    mandatory.push('comparable');
  } else if (comparableCount > 0) {
    optional.push('comparable');
  }

  // 4.1.2条第2款：有租金等经济收入的，应选用收益法
  if (hasRentalData) {
    mandatory.push('income');
  } else {
    optional.push('income');
  }

  // 4.1.2条第3款：没有交易也没有收益的，应选用成本法
  if (comparableCount === 0 && !hasRentalData) {
    mandatory.push('cost');
  } else if (hasCostData) {
    recommended.push('cost');
  }

  // 4.1.2条第4款：具有开发或再开发潜力的，应选用假设开发法
  if (hasDevelopmentPotential) {
    mandatory.push('hypothetical');
  }

  // 兜底：如果没有任何应选方法，至少选成本法
  if (mandatory.length === 0) {
    mandatory.push('cost');
  }

  const selected = [...mandatory, ...recommended];

  return { mandatory, recommended, optional, selected };
}

/**
 * 校验方法数量
 *
 * 4.1.3条：估价结果应选取两种（含）以上方法的测算结果进行综合分析后确定。
 *   如同时适用两种以上方法，宜选用所有适用的估价方法进行估价，不得随意取舍。
 *
 * @param selected - 已选用的估价方法列表
 * @returns 校验结果
 */
export function validateMethodCount(selected: EstimatedMethod[]): ValidationResult {
  if (selected.length === 0) {
    return {
      valid: false,
      errors: ['未选择任何估价方法'],
      warnings: [],
    };
  }

  if (selected.length === 1) {
    return {
      valid: true,
      errors: [],
      warnings: [
        '仅选用了一种估价方法。根据4.1.3条，如同时适用两种以上方法，宜选用所有适用的方法。',
      ],
    };
  }

  return {
    valid: true,
    errors: [],
    warnings: [],
  };
}
