/**
 * 修正幅度校验器
 * 对应 GB/T 50291-2015 第4.2.15条
 *
 * 4.2.15条第1款：可比实例与其可比对象之间的各项条件差异不宜过大，
 *   各项修正幅度不宜超过20%，合计修正幅度不宜超过30%
 * 4.2.15条第2款：经修正后最高价与最低价之间的差额不宜过大，
 *   最高价与最低价的比值不宜大于1.2
 */

/**
 * 单项修正幅度校验结果
 */
export interface AmplitudeCheckResult {
  /** 修正前的值 */
  original: number;
  /** 修正后的值 */
  adjusted: number;
  /** 修正幅度（百分比） */
  amplitude: number;
  /** 是否超标（单项 > 20%） */
  exceeded: boolean;
}

/**
 * 整体幅度校验结果
 */
export interface AmplitudeValidationResult {
  /** 各可比实例的单项修正结果 */
  individualChecks: AmplitudeCheckResult[][];
  /** 共同修正总幅度（所有可比实例修正幅度的最大值） */
  totalAmplitude: number;
  /** 共同修正是否超标（> 30%） */
  totalExceeded: boolean;
  /** 修正后最高价/最低价比值 */
  priceRatio: number;
  /** 比值是否超标（> 1.2） */
  ratioExceeded: boolean;
  /** 是否全部通过 */
  passed: boolean;
  /** 警告信息 */
  warnings: string[];
}

/**
 * 校验可比实例的修正幅度
 *
 * 4.2.15条第1款：单项修正幅度不宜超过20%，共同修正不宜超过30%
 * 4.2.15条第2款：经修正后最高价与最低价比值不宜大于1.2
 *
 * @param originalPrices - 各可比实例修正前的价格数组
 * @param adjustedPrices - 各可比实例修正后的价格数组
 * @returns 幅度校验结果
 */
export function validateAmplitudes(
  originalPrices: number[],
  adjustedPrices: number[],
): AmplitudeValidationResult {
  const warnings: string[] = [];
  const individualChecks: AmplitudeCheckResult[][] = [];

  if (originalPrices.length !== adjustedPrices.length) {
    throw new Error('originalPrices and adjustedPrices must have the same length');
  }

  if (originalPrices.length === 0) {
    return {
      individualChecks: [],
      totalAmplitude: 0,
      totalExceeded: false,
      priceRatio: 1,
      ratioExceeded: false,
      passed: true,
      warnings: ['无可比实例，跳过幅度校验'],
    };
  }

  // 逐项检查每个可比实例的总修正幅度
  for (let i = 0; i < originalPrices.length; i++) {
    const original = originalPrices[i];
    const adjusted = adjustedPrices[i];
    const amplitude = original !== 0
      ? Math.abs((adjusted - original) / original) * 100
      : 0;

    individualChecks.push([{
      original,
      adjusted,
      amplitude,
      exceeded: amplitude > 20,
    }]);

    if (amplitude > 20) {
      warnings.push(
        `可比实例${i + 1}修正幅度 ${amplitude.toFixed(2)}% 超过4.2.15条第1款规定的单项上限 20%`
      );
    }
  }

  // 计算共同修正总幅度（所有可比实例修正幅度的最大值）
  const maxIndividualAmplitude = Math.max(
    ...individualChecks.flatMap(checks => checks.map(c => c.amplitude)),
  );
  const totalAmplitude = maxIndividualAmplitude;

  // 计算修正后最高价/最低价比值
  const maxAdjusted = Math.max(...adjustedPrices);
  const minAdjusted = Math.min(...adjustedPrices);
  const priceRatio = minAdjusted > 0 ? maxAdjusted / minAdjusted : Infinity;

  const totalExceeded = totalAmplitude > 30;
  const ratioExceeded = priceRatio > 1.2;

  if (totalExceeded) {
    warnings.push(
      `共同修正幅度 ${totalAmplitude.toFixed(2)}% 超过4.2.15条第1款规定的合计上限 30%`
    );
  }

  if (ratioExceeded) {
    warnings.push(
      `修正后最高价/最低价比值 ${priceRatio.toFixed(2)} 超过4.2.15条第2款规定的 1.2 上限`
    );
  }

  return {
    individualChecks,
    totalAmplitude,
    totalExceeded,
    priceRatio,
    ratioExceeded,
    passed: !totalExceeded && !ratioExceeded,
    warnings,
  };
}
