/**
 * 收益法测算 Skill
 * 对应 GB/T 50291-2015 第4.3节
 *
 * 4.3.6条：收益期 = 土地使用权剩余期限与建筑物剩余经济寿命孰短
 * 4.3.14条：报酬率/资本化率的确定（市场提取法优先，累加法备选）
 */

import { BaseSkill } from './base-skill';
import {
  EstimationContext,
  IncomeResult,
  IncomeDetail,
  RentalData,
} from '../types';

export class IncomeSkill extends BaseSkill {
  readonly name = 'income-method';
  readonly 规范References = [
    '4.3', '4.3.1', '4.3.2', '4.3.3', '4.3.4', '4.3.5',
    '4.3.6', '4.3.7', '4.3.8', '4.3.9', '4.3.10',
    '4.3.11', '4.3.12', '4.3.13', '4.3.14', '4.3.15', '4.3.16', '4.3.17',
  ];

  execute(context: EstimationContext): EstimationContext {
    const data = context.collectedData;
    if (!data || data.rentalData.length === 0) {
      throw new Error('收益法测算需要租金数据（4.3.8条：优先通过租赁收入测算）');
    }

    // 4.3.2条：首期默认直接资本化法，后续根据数据质量选择模型
    // TODO: 实现模型选择逻辑（fullLife / holdAndResell / directCap）
    const model: IncomeResult['model'] = 'directCap';

    // 4.3.8条：测算有效毛收入
    const effectiveGrossIncome = this.calculateEffectiveGrossIncome(data.rentalData, context.estObject);

    // 4.3.8条第3款：测算运营费用
    const operatingExpenses = this.calculateOperatingExpenses(effectiveGrossIncome, context.estObject);

    // 4.3.8条：净收益 = 有效毛收入 - 运营费用
    const netOperatingIncome = effectiveGrossIncome - operatingExpenses;

    // 4.3.14条：确定报酬率/资本化率
    const capitalizationRate = this.determineCapitalizationRate(context, data);

    // 4.3.6条：测算收益期
    const incomePeriod = this.calculateIncomePeriod(context);

    // 4.3.5条：直接资本化法 V = NOI / R（4.3.2条：优先选用报酬资本化法，首期简化）
    const finalValue = netOperatingIncome / capitalizationRate;

    // 构建年度收益明细
    const details: IncomeDetail[] = [];
    for (let year = 1; year <= Math.min(incomePeriod, 5); year++) {
      details.push({
        year,
        effectiveGrossIncome,
        operatingExpense: operatingExpenses,
        netOperatingIncome,
      });
    }

    const result: IncomeResult = {
      method: 'income',
      grossIncome: effectiveGrossIncome,
      operatingExpenses,
      netOperatingIncome,
      capitalizationRate: capitalizationRate * 100, // 转为百分比
      finalValue,
      model,
      incomePeriod,
      details,
    };

    return {
      ...context,
      calculationResults: [...(context.calculationResults ?? []), result],
    };
  }

  /**
   * 4.3.8条：测算有效毛收入
   * 有效毛收入 = 潜在毛租金收入 - 空置和收租损失 + 其他收入
   */
  private calculateEffectiveGrossIncome(
    rentalData: NonNullable<EstimationContext['collectedData']>['rentalData'],
    estObject: EstimationContext['estObject'],
  ): number {
    if (!rentalData || rentalData.length === 0) return 0;

    // 取市场租金平均值（元/m²/月）
    const avgRent = rentalData.reduce((sum: number, r: RentalData) => sum + r.rentPerMonth, 0) / rentalData.length;

    // 4.3.8条第2款：扣除空置和收租损失
    const vacancyLoss = avgRent * (rentalData[0]?.vacancyRate ?? 0.05);
    const effectiveIncome = avgRent - vacancyLoss;

    // 乘以面积得到总有效毛收入（年）
    return effectiveIncome * 12 * estObject.area.constructionArea;
  }

  /**
   * 4.3.8条第3款：测算运营费用
   * 包括：房地产税、房屋保险费、物业服务费、管理费用、维修费等
   */
  private calculateOperatingExpenses(grossIncome: number, _estObject: EstimationContext['estObject']): number {
    // TODO: 首期按有效毛收入的 25% 估算，后续应根据实际费用类型分别计算
    const expenseRatio = 0.25;
    return grossIncome * expenseRatio;
  }

  /**
   * 4.3.14条：确定报酬率/资本化率
   * 第1款：市场提取法（优先）
   * 第2款：累加法
   */
  private determineCapitalizationRate(
    _context: EstimationContext,
    _data: NonNullable<EstimationContext['collectedData']>,
  ): number {
    // TODO: 首期使用累加法，后续应从市场数据中提取（市场提取法）
    // 安全利率（一年期国债年利率）+ 风险调整值
    const riskFreeRate = 0.025;
    const riskAdjustment = 0.03;
    return riskFreeRate + riskAdjustment;
  }

  /**
   * 4.3.6条：测算收益期
   * 第1款：持有期的预期收益期限
   * 第2款：取土地使用权剩余期限和建筑物剩余经济寿命孰短
   */
  private calculateIncomePeriod(context: EstimationContext): number {
    const estObject = context.estObject;
    const valueDate = context.demand.valueDatePoint.date;

    // 计算土地使用权剩余期限
    const landTermEnd = estObject.rights.landUseTermEnd;
    const landRemainingYears = (landTermEnd.getTime() - valueDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

    // 4.3.6条第2款：取土地使用权剩余期限和建筑物剩余经济寿命孰短
    const buildingRemainingLife = this.getBuildingEconomicLife(estObject);

    return Math.max(Math.min(Math.floor(landRemainingYears), buildingRemainingLife), 0);
  }

  /**
   * 获取建筑物剩余经济寿命
   * 根据结构和建成年代估算
   */
  private getBuildingEconomicLife(obj: EstimationContext['estObject']): number {
    return getBuildingRemainingLife(obj);
  }
}

/**
 * 共享：根据建筑结构类型获取建筑物剩余经济寿命
 * 4.4.11条 / 4.3.6条共用
 * TODO: 后续移至共享模块 building-lifecycle.ts
 */
export function getBuildingRemainingLife(obj: EstimationContext['estObject']): number {
  const baseLife: Record<string, number> = {
    '钢结构': 100,
    '钢筋混凝土': 80,
    '砖混': 60,
    '砖木': 40,
  };
  const totalLife = baseLife[obj.physical.structure] ?? 50;
  const age = new Date().getFullYear() - obj.physical.yearBuilt;
  return Math.max(totalLife - age, 0);
}
