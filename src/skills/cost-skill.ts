/**
 * 成本法测算 Skill
 * 对应 GB/T 50291-2015 第4.4节
 *
 * 4.4.7条：建筑物折旧 = 物质折旧 + 功能折旧 + 外部折旧
 * 4.4.9条：折旧求取方法（市场提取法、分解法、直线法）
 */

import { BaseSkill } from './base-skill';
import {
  EstimationContext,
  CostResult,
} from '../types';

export class CostSkill extends BaseSkill {
  readonly name = 'cost-method';
  readonly 规范References = [
    '4.4', '4.4.1', '4.4.2', '4.4.3', '4.4.4', '4.4.5',
    '4.4.6', '4.4.7', '4.4.8', '4.4.9', '4.4.10',
    '4.4.11', '4.4.12', '4.4.13', '4.4.14', '4.4.15', '4.4.16', '4.4.17',
  ];

  execute(context: EstimationContext): EstimationContext {
    const data = context.collectedData;
    if (!data || !data.costData) {
      throw new Error('成本法测算需要成本数据（4.4.5条）');
    }

    // 4.4.2条：优先选择房地合估路径
    const path: CostResult['path'] = 'combined';

    // 4.4.4条：测算土地重置成本
    const landCost = this.calculateLandReplacementCost(context, data);

    // 4.4.5条：测算建筑物重置成本及必要支出、应得利润
    const buildingCost = this.calculateBuildingReplacementCost(context, data);

    // 4.4.7条：测算建筑物折旧
    const depreciation = this.calculateDepreciation(context, buildingCost);

    // 4.4.15条：成本价值 = 土地重置成本 + 建筑物重置成本 - 建筑物折旧
    const finalValue = landCost + buildingCost - depreciation;

    // 4.4.7条：折旧分解为物质+功能+外部折旧（首期按 40/40/20 比例估算）
    const result: CostResult = {
      method: 'cost',
      landReplacementCost: landCost,
      buildingReplacementCost: buildingCost,
      buildingDepreciation: depreciation,
      physicalDepreciation: depreciation * 0.4,
      functionalDepreciation: depreciation * 0.4,
      externalDepreciation: depreciation * 0.2,
      finalValue,
      path,
      details: [
        { item: '土地重置成本', amount: landCost, description: '4.4.4条' },
        { item: '建筑物重置成本', amount: buildingCost, description: '4.4.5条' },
        { item: '建筑物折旧', amount: depreciation, description: '4.4.7条（物质+功能+外部）' },
      ],
    };

    return {
      ...context,
      calculationResults: [...(context.calculationResults ?? []), result],
    };
  }

  /**
   * 4.4.4条：测算土地重置成本
   * 可采用基准地价法或比较法
   */
  private calculateLandReplacementCost(
    context: EstimationContext,
    data: NonNullable<EstimationContext['collectedData']>,
  ): number {
    // 4.4.4条第3款：土地状况应为价值时点的状况
    if (data.benchmarkLand) {
      return data.benchmarkLand.unitPrice * (context.estObject.area.landArea ?? context.estObject.area.constructionArea);
    }
    // TODO: 后续使用比较法测算土地成本
    // 占位：按建筑面积×单价估算
    return context.estObject.area.constructionArea * 3000;
  }

  /**
   * 4.4.5条：测算建筑物重置成本
   * 采用单位比较法，含必要支出及应得利润
   */
  private calculateBuildingReplacementCost(
    context: EstimationContext,
    data: NonNullable<EstimationContext['collectedData']>,
  ): number {
    const costData = data.costData!;
    const costPerM2 = costData.constructionCostPerM2;
    const baseCost = costPerM2 * context.estObject.area.constructionArea;

    // 4.4.3条第2款：必要支出及应得利润
    const managementFee = baseCost * costData.managementFeeRate;
    const salesFee = baseCost * costData.salesFeeRate;
    const interest = baseCost * costData.interestRate;
    const profit = baseCost * costData.profitMargin;

    return baseCost + managementFee + salesFee + interest + profit;
  }

  /**
   * 4.4.7~4.4.11条：测算建筑物折旧
   * 4.4.7条：折旧 = 物质折旧 + 功能折旧 + 外部折旧
   * 4.4.9条：折旧求取方法（市场提取法、分解法、直线法）
   * 4.4.10条：建筑物有效年龄
   * 4.4.11条：建筑物经济寿命
   */
  private calculateDepreciation(
    context: EstimationContext,
    buildingReplacementCost: number,
  ): number {
    const obj = context.estObject;
    const valueDate = context.demand.valueDatePoint.date;

    // 4.4.10条：建筑物实际年龄
    const actualAge = valueDate.getFullYear() - obj.physical.yearBuilt;

    // 4.4.10条：根据维护状况调整得到有效年龄
    const effectiveAge = this.calculateEffectiveAge(obj, actualAge);

    // 4.4.11条：建筑物经济寿命
    const economicLife = this.getEconomicLife(obj);
    if (economicLife <= 0) return 0;

    // 4.4.9条第1款：直线法
    // V = C × (1 - t/N)，折旧 = C × (t/N)
    // t = 有效年龄，N = 经济寿命，C = 重置成本
    const depreciationRate = Math.min(effectiveAge / economicLife, 1);

    return Math.round(buildingReplacementCost * depreciationRate);
  }

  /**
   * 4.4.10条：计算建筑物有效年龄
   * 根据维护保养状况调整实际年龄
   */
  private calculateEffectiveAge(obj: EstimationContext['estObject'], actualAge: number): number {
    let effectiveAge = actualAge;
    if (obj.physical.condition === '完好') effectiveAge = actualAge * 0.8;
    else if (obj.physical.condition === '基本完好') effectiveAge = actualAge * 0.9;
    else if (obj.physical.condition === '差' || obj.physical.condition === '危险') effectiveAge = actualAge * 1.3;
    return Math.round(effectiveAge);
  }

  /**
   * 4.4.11条：获取建筑物经济寿命
   * 根据建筑结构类型确定
   */
  private getEconomicLife(obj: EstimationContext['estObject']): number {
    const baseLife: Record<string, number> = {
      '钢结构': 100,
      '钢筋混凝土': 80,
      '砖混': 60,
      '砖木': 40,
    };
    return baseLife[obj.physical.structure] ?? 50;
  }
}
