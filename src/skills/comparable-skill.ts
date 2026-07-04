/**
 * 比较法测算 Skill
 * 对应 GB/T 50291-2015 第4.2节
 *
 * 4.2.15条：各项修正幅度不宜超过20%，合计修正幅度不宜超过30%；
 *   修正后最高价与最低价之比不宜大于1.2
 */

import { BaseSkill } from './base-skill';
import {
  EstimationContext,
  ComparableResult,
  ComparableDetail,
  ComparableInstance,
} from '../types';
import { validateAmplitudes } from '../validation/amplitude-validator';

export class ComparableSkill extends BaseSkill {
  readonly name = 'comparable-method';
  readonly 规范References = [
    '4.2', '4.2.1', '4.2.2', '4.2.3', '4.2.4', '4.2.5',
    '4.2.6', '4.2.7', '4.2.8', '4.2.9', '4.2.10',
    '4.2.11', '4.2.12', '4.2.13', '4.2.14', '4.2.15', '4.2.16',
  ];

  execute(context: EstimationContext): EstimationContext {
    const data = context.collectedData;
    if (!data || data.comparables.length < 3) {
      throw new Error(
        `比较法需要不少于3个可比实例（4.2.3条），当前仅有 ${data?.comparables?.length ?? 0} 个。`
      );
    }

    const comparables = data.comparables;
    const valueDate = context.demand.valueDatePoint.date;

    // 4.2.3条第4款：成交日期距价值时点不宜超过1年、最长不超过2年
    const outdated = comparables.filter(c => {
      const yearsDiff = (valueDate.getTime() - c.transactionDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      return yearsDiff < 0 || yearsDiff > 2;
    });
    // 4.2.3条用语"不宜"，过期实例不阻断但记录 warning
    if (outdated.length > 0) {
      // TODO: 附加 warning 到 context
    }

    // 4.2.4条：排除不宜作为可比实例的特殊交易情况
    const filtered = comparables.filter(c => {
      if (c.priceNormalcy === 'abnormal' && c.specialCircumstances) {
        // 4.2.4条列出的7种不宜选为可比实例的情况
        return false;
      }
      return true;
    });

    if (filtered.length < 3) {
      throw new Error(
        `过滤特殊交易后剩余可比实例不足3个（原 ${comparables.length} 个，过滤后 ${filtered.length} 个，4.2.4条）`
      );
    }

    // 4.2.1~4.2.14 条：逐项计算修正后价格
    const details: ComparableDetail[] = [];
    const originalPrices: number[] = [];
    const adjustedPrices: number[] = [];

    for (const comp of filtered) {
      // 4.2.6条：建立比较基础
      // 4.2.8条：交易情况修正
      const situationAdjustment = this.adjustSituation(comp);

      // 4.2.8条：市场状况调整
      const marketAdjustment = this.adjustMarket(comp, valueDate);

      // 4.2.9~4.2.12条：房地产状况调整（区位+实物+权益）
      const locationAdjustment = this.adjustLocation(comp, context.estObject);
      const physicalAdjustment = this.adjustPhysical(comp, context.estObject);
      const rightsAdjustment = this.adjustRights(comp, context.estObject);

      // 4.2.14条：采用直接比较法（以可比实例价格为基准100）
      const adjustedPrice = comp.unitPrice
        * situationAdjustment
        * marketAdjustment
        * locationAdjustment
        * physicalAdjustment
        * rightsAdjustment;

      originalPrices.push(comp.unitPrice);
      adjustedPrices.push(adjustedPrice);

      details.push({
        instanceId: comp.id,
        originalPrice: comp.unitPrice,
        situationAdjustment,
        marketAdjustment,
        locationAdjustment,
        physicalAdjustment,
        rightsAdjustment,
        adjustedPrice,
      });
    }

    // 4.2.15条：幅度校验
    const amplitudeValidation = validateAmplitudes(originalPrices, adjustedPrices);
    if (!amplitudeValidation.passed) {
      // 4.2.15条第3款：超出幅度建议更换可比实例
      // TODO: 将 amplitudeValidation.warnings 附加到上下文
      // （当前通过选择加权平均降级处理）
    }

    // 4.2.16条：计算比较价值
    const finalValue = amplitudeValidation.totalExceeded
      ? this.calculateWeightedAverage(details)
      : this.calculateSimpleAverage(details);

    const result: ComparableResult = {
      method: 'comparable',
      adjustedValues: adjustedPrices,
      finalValue,
      weight: amplitudeValidation.totalExceeded ? this.calculateWeights(details) : undefined,
      details,
    };

    return {
      ...context,
      calculationResults: [...(context.calculationResults ?? []), result],
    };
  }

  /**
   * 4.2.8条：交易情况修正系数
   * 将非正常价格修正为正常价格
   */
  private adjustSituation(comp: ComparableInstance): number {
    if (comp.priceNormalcy === 'normal') return 1.0;
    // TODO: 根据 specialCircumstances 具体计算修正系数
    // 首期简化：异常价格不做修正
    return 1.0;
  }

  /**
   * 4.2.8条：市场状况调整系数
   * 采用同类房地产价格变动率或价格指数
   */
  private adjustMarket(comp: ComparableInstance, valueDate: Date): number {
    const monthsDiff = (valueDate.getTime() - comp.transactionDate.getTime()) / (30.44 * 24 * 60 * 60 * 1000);
    // TODO: 从 context.collectedData.marketIndex 获取真实价格指数
    const monthlyRate = 0.002; // 0.2%/月，占位值
    return 1 + monthlyRate * monthsDiff;
  }

  /**
   * 4.2.9~4.2.12条：房地产状况调整（区位/实物/权益共用逻辑）
   * 以可比实例得数为分母，估价对象得数为分子
   */
  private adjustScore(
    comp: ComparableInstance,
    scoreKey: 'locationScore' | 'physicalScore' | 'rightsScore',
  ): number {
    const compScore = Object.values(comp[scoreKey]).reduce((a, b) => a + b, 0);
    // TODO: 实际应从估价对象对应打分计算
    return 100 / Math.max(compScore, 1);
  }

  /**
   * 4.2.10条：区位状况调整系数
   */
  private adjustLocation(comp: ComparableInstance, _estObj: EstimationContext['estObject']): number {
    return this.adjustScore(comp, 'locationScore');
  }

  /**
   * 4.2.11条：实物状况调整系数
   */
  private adjustPhysical(comp: ComparableInstance, _estObj: EstimationContext['estObject']): number {
    return this.adjustScore(comp, 'physicalScore');
  }

  /**
   * 4.2.12条：权益状况调整系数
   */
  private adjustRights(comp: ComparableInstance, _estObj: EstimationContext['estObject']): number {
    return this.adjustScore(comp, 'rightsScore');
  }

  /**
   * 4.2.16条：简单算术平均
   */
  private calculateSimpleAverage(details: ComparableDetail[]): number {
    const sum = details.reduce((acc, d) => acc + d.adjustedPrice, 0);
    return sum / details.length;
  }

  /**
   * 4.2.16条：加权算术平均（当幅度超限时使用）
   */
  private calculateWeightedAverage(details: ComparableDetail[]): number {
    const weights = this.calculateWeights(details);
    const weightSum = weights.reduce((a, b) => a + b, 0);
    return details.reduce((acc, d, i) => acc + d.adjustedPrice * (weights[i] / weightSum), 0);
  }

  /**
   * 4.2.16条：根据差异程度、相似程度、资料可靠程度确定权重
   * 简化版：修正幅度越小权重越大
   */
  private calculateWeights(details: ComparableDetail[]): number[] {
    return details.map(d => {
      const totalAdjustment = Math.abs(d.situationAdjustment - 1)
        + Math.abs(d.marketAdjustment - 1)
        + Math.abs(d.locationAdjustment - 1)
        + Math.abs(d.physicalAdjustment - 1)
        + Math.abs(d.rightsAdjustment - 1);
      return 1 / (1 + totalAdjustment);
    });
  }
}
