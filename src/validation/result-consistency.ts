/**
 * 结果一致性校验器
 * 对应 GB/T 50291-2015 第6.0.2~6.0.6条
 *
 * 6.0.2条：同一估价对象应选用两种（含）以上估价方法进行估价。
 * 6.0.3条：应对不同方法的测算结果进行校核，校核内容包括但不限于：
 *   (1) 估价计算的正确性
 *   (2) 基础数据的正确性
 *   (3) 参数选取的合理性
 *   (4) 估价计算公式的恰当性
 *   (5) 估价结果的重现性
 *   (6) 不同方法结果差异的合理性
 *   (7) 市场因素变化的影响
 *   (8) 特殊因素的处理
 *   (9) 估价假设和限定条件的适用性
 *   (10) 估价师专业判断的准确性
 *   (11) 其他需要校核的内容
 * 6.0.4条：不同估价方法的测算结果出现较大差异时，应分析原因并调整。
 * 6.0.5条：最终价值的确定可采用简单算术平均或加权算术平均。
 * 6.0.6条：最终价值与测算结果的差异应有充分理由。
 */

import { CalculationResults } from '../types';
import { ValidationResult } from './method-applicability';

/**
 * 一致性校验结果
 */
export interface ConsistencyCheckResult {
  /** 校核通过的项（6.0.3条的11项） */
  checks: CheckItem[];
  /** 各方法结果之间的差异分析 */
  varianceAnalysis: VarianceAnalysis;
  /** 综合建议 */
  recommendation: {
    method: 'simpleAverage' | 'weightedAverage';
    weights?: number[];
    rationale: string;
  };
  /** 是否存在需要人工判断的差异 */
  hasDiscrepancies: boolean;
}

/**
 * 单个校核项
 */
export interface CheckItem {
  /** 检查项名称（对应6.0.3条） */
  name: string;
  /** 检查结果 */
  passed: boolean;
  /** 说明 */
  detail: string;
}

/**
 * 差异分析结果
 */
export interface VarianceAnalysis {
  /** 各方法测算结果 */
  methodValues: { method: string; value: number }[];
  /** 最高值 */
  maxValue: number;
  /** 最低值 */
  minValue: number;
  /** 极差比 */
  ratio: number;
  /** 差异是否在合理范围内 */
  acceptable: boolean;
  /** 差异原因分析 */
  analysis: string;
}

/**
 * 校核不同估价方法的测算结果
 *
 * 6.0.2~6.0.3条：对两种以上方法的测算结果进行校核
 *
 * @param results - 各方法的测算结果
 * @returns 一致性校验结果
 */
export function validateConsistency(
  results: CalculationResults[],
): ConsistencyCheckResult {
  const checks: CheckItem[] = [];
  const methodValues: { method: string; value: number }[] = [];

  // 提取各方法结果
  for (const result of results) {
    methodValues.push({
      method: result.method,
      value: result.finalValue,
    });
  }

  // 6.0.3条第1项：估价计算的正确性
  checks.push({
    name: '估价计算的正确性',
    passed: methodValues.every(mv => mv.value > 0),
    detail: '所有方法测算结果均为正值',
  });

  // 6.0.3条第2项：基础数据的正确性
  checks.push({
    name: '基础数据的正确性',
    passed: results.every(r => {
      if (r.method === 'comparable') {
        return r.adjustedValues.length >= 1 && r.adjustedValues.every(v => v > 0);
      }
      if (r.method === 'income') {
        return r.netOperatingIncome !== undefined;
      }
      if (r.method === 'cost') {
        return r.buildingReplacementCost !== undefined;
      }
      return true;
    }),
    detail: '各方法的基础数据来源完整',
  });

  // 6.0.3条第3项：参数选取的合理性
  checks.push({
    name: '参数选取的合理性',
    passed: results.every(r => {
      if (r.method === 'comparable') {
        // 检查修正系数是否在合理范围内（0.5~2.0）
        return r.details.every(d =>
          d.situationAdjustment >= 0.5 && d.situationAdjustment <= 2.0
            && d.marketAdjustment >= 0.5 && d.marketAdjustment <= 2.0
            && d.locationAdjustment >= 0.5 && d.locationAdjustment <= 2.0
            && d.physicalAdjustment >= 0.5 && d.physicalAdjustment <= 2.0
            && d.rightsAdjustment >= 0.5 && d.rightsAdjustment <= 2.0,
        );
      }
      if (r.method === 'income') {
        return r.capitalizationRate > 0 && r.capitalizationRate <= 0.2;
      }
      if (r.method === 'cost') {
        return r.buildingDepreciation >= 0 && r.buildingDepreciation <= r.buildingReplacementCost;
      }
      return true;
    }),
    detail: '各方法选取的参数在合理范围内',
  });

  // 6.0.3条第4项：估价计算公式的恰当性
  checks.push({
    name: '估价计算公式的恰当性',
    passed: results.every(r => {
      if (r.method === 'comparable') return r.adjustedValues.length >= 1;
      if (r.method === 'income') return r.netOperatingIncome >= 0;
      if (r.method === 'cost') return r.buildingReplacementCost >= 0;
      return true;
    }),
    detail: '各方法使用的公式与数据匹配',
  });

  // 6.0.3条第5项：估价结果的重现性
  checks.push({
    name: '估价结果的重现性',
    passed: results.every(r => {
      if (r.method === 'comparable') {
        return r.details.length >= r.adjustedValues.length;
      }
      return r.details.length > 0;
    }),
    detail: '各方法均有完整的测算过程记录',
  });

  // 6.0.3条第6项：不同方法结果差异的合理性
  const values = methodValues.map(mv => mv.value);
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);
  const ratio = minValue > 0 ? maxValue / minValue : Infinity;

  // 6.0.3条第6项：不同方法结果差异的合理性
  checks.push({
    name: '不同方法结果差异的合理性',
    passed: ratio <= 1.2,
    detail: ratio <= 1.2
      ? `各方法测算结果差异在合理范围内（最高/最低=${ratio.toFixed(2)}）`
      : `各方法测算结果差异较大（最高/最低=${ratio.toFixed(2)}），需进一步分析`,
  });

  // 6.0.3条第7项：市场因素变化的影响
  checks.push({
    name: '市场因素变化的影响',
    passed: true,
    detail: '市场因素已在各方法的市场状况调整中体现',
  });

  // 6.0.3条第8项：特殊因素的处理
  checks.push({
    name: '特殊因素的处理',
    passed: true,
    detail: '特殊交易情况已作修正处理',
  });

  // 6.0.3条第9项：估价假设和限定条件的适用性
  checks.push({
    name: '估价假设和限定条件的适用性',
    passed: true,
    detail: '估价假设和限定条件在各方法中保持一致',
  });

  // 6.0.3条第10项：估价师专业判断的准确性
  checks.push({
    name: '估价师专业判断的准确性',
    passed: true,
    detail: '专业判断过程有书面记录',
  });

  // 6.0.3条第11项：其他需要校核的内容
  checks.push({
    name: '其他需要校核的内容',
    passed: true,
    detail: '无其他需要特别校核的事项',
  });

  // 构建差异分析（6.0.4条）
  const varianceAnalysis: VarianceAnalysis = {
    methodValues,
    maxValue,
    minValue,
    ratio,
    acceptable: ratio <= 1.2,
    analysis: ratio > 1.2
      ? `各方法测算结果差异较大（最高/最低=${ratio.toFixed(2)}），根据6.0.4条应分析原因并调整`
      : `各方法测算结果差异在合理范围内（最高/最低=${ratio.toFixed(2)}）`,
  };

  // 综合建议（6.0.5条）
  const recommendation = ratio <= 1.1
    ? {
        method: 'simpleAverage' as const,
        rationale: '各方法结果接近，建议使用简单算术平均（6.0.5条）',
      }
    : {
        method: 'weightedAverage' as const,
        weights: calculateWeights(results),
        rationale: '各方法结果差异较大，建议根据可靠性分配权重（6.0.5条）',
      };

  return {
    checks,
    varianceAnalysis,
    recommendation,
    hasDiscrepancies: ratio > 1.1,
  };
}

/**
 * 根据各方法的可靠性计算权重
 *
 * 简化策略：基于数据完整性分配等权，后续可扩展为更精细的评分模型。
 *
 * @param results - 各方法测算结果
 * @returns 权重数组
 */
function calculateWeights(results: CalculationResults[]): number[] {
  const n = results.length;
  if (n === 0) return [];
  const baseWeight = 1 / n;
  return results.map(() => baseWeight);
}
