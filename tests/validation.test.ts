/**
 * 规范约束校验器 单元测试
 * 覆盖 amplitude-validator, method-applicability, result-consistency
 */

import {
  validateAmplitudes,
  type AmplitudeValidationResult,
} from '../src/validation/amplitude-validator';

import {
  assessMethodApplicability,
  validateMethodCount,
  type MethodAssessment,
  type ValidationResult,
} from '../src/validation/method-applicability';

import {
  validateConsistency,
  type ConsistencyCheckResult,
} from '../src/validation/result-consistency';

import type { ComparableResult, IncomeResult, CostResult, CalculationResults } from '../src/types';

// ─── amplitude-validator ──────────────────────────────────────────────

describe('validateAmplitudes', () => {
  it('should pass when all corrections are within 20%', () => {
    const result = validateAmplitudes([100, 105], [102, 107]);
    expect(result.passed).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(result.totalAmplitude).toBeLessThanOrEqual(20);
    expect(result.ratioExceeded).toBe(false);
  });

  it('should fail when any correction exceeds 20%', () => {
    const result = validateAmplitudes([100, 200], [130, 210]);
    expect(result.passed).toBe(false);
    expect(result.warnings.some(w => w.includes('4.2.15条'))).toBe(true);
  });

  it('should fail when price ratio exceeds 1.2', () => {
    const result = validateAmplitudes([100, 100], [150, 100]);
    expect(result.ratioExceeded).toBe(true);
    expect(result.passed).toBe(false);
  });

  it('should handle empty input gracefully', () => {
    const result = validateAmplitudes([], []);
    expect(result.passed).toBe(true);
    expect(result.warnings).toContain('无可比实例，跳过幅度校验');
  });

  it('should throw on mismatched lengths', () => {
    expect(() => validateAmplitudes([100], [])).toThrow(
      'originalPrices and adjustedPrices must have the same length',
    );
  });

  it('should flag total amplitude exceeding 30%', () => {
    const result = validateAmplitudes([100], [135]);
    expect(result.totalExceeded).toBe(true);
  });
});

// ─── method-applicability ────────────────────────────────────────────

describe('assessMethodApplicability', () => {
  it('should mandate comparable when >= 3 transactions', () => {
    const result = assessMethodApplicability(5, false, true, false);
    expect(result.mandatory).toContain('comparable');
  });

  it('should mandate income when rental data exists', () => {
    const result = assessMethodApplicability(0, true, false, false);
    expect(result.mandatory).toContain('income');
  });

  it('should mandate cost when no transactions and no rental', () => {
    const result = assessMethodApplicability(0, false, true, false);
    expect(result.mandatory).toContain('cost');
  });

  it('should mandate hypothetical when development potential exists', () => {
    const result = assessMethodApplicability(0, false, false, true);
    expect(result.mandatory).toContain('hypothetical');
  });

  it('should fall back to cost when no conditions are met', () => {
    const result = assessMethodApplicability(0, false, false, false);
    expect(result.mandatory).toContain('cost');
  });

  it('should combine multiple mandates', () => {
    const result = assessMethodApplicability(5, true, true, true);
    expect(result.mandatory).toEqual(expect.arrayContaining(['comparable', 'income', 'hypothetical']));
  });
});

describe('validateMethodCount', () => {
  it('should pass with 2+ methods', () => {
    const result = validateMethodCount(['comparable', 'cost']);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('should warn with 1 method', () => {
    const result = validateMethodCount(['comparable']);
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes('4.1.3条'))).toBe(true);
  });

  it('should error with 0 methods', () => {
    const result = validateMethodCount([]);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
  });
});

// ─── result-consistency ──────────────────────────────────────────────

function makeComparableResult(): ComparableResult {
  return {
    method: 'comparable',
    adjustedValues: [310000, 320000, 330000],
    finalValue: 320000,
    details: [
      {
        instanceId: 'c1',
        originalPrice: 300000,
        situationAdjustment: 1.0,
        marketAdjustment: 1.02,
        locationAdjustment: 0.98,
        physicalAdjustment: 1.01,
        rightsAdjustment: 1.0,
        adjustedPrice: 310000,
      },
      {
        instanceId: 'c2',
        originalPrice: 310000,
        situationAdjustment: 1.0,
        marketAdjustment: 1.02,
        locationAdjustment: 1.0,
        physicalAdjustment: 1.0,
        rightsAdjustment: 1.0,
        adjustedPrice: 320000,
      },
      {
        instanceId: 'c3',
        originalPrice: 320000,
        situationAdjustment: 1.0,
        marketAdjustment: 1.02,
        locationAdjustment: 1.0,
        physicalAdjustment: 1.0,
        rightsAdjustment: 1.0,
        adjustedPrice: 330000,
      },
    ],
  };
}

function makeIncomeResult(): IncomeResult {
  return {
    method: 'income',
    grossIncome: 50000,
    operatingExpenses: 15000,
    netOperatingIncome: 35000,
    capitalizationRate: 0.05,
    finalValue: 320000,
    model: 'directCap',
    incomePeriod: 50,
    details: [{ year: 1, effectiveGrossIncome: 50000, operatingExpense: 15000, netOperatingIncome: 35000 }],
  };
}

function makeCostResult(): CostResult {
  return {
    method: 'cost',
    landReplacementCost: 200000,
    buildingReplacementCost: 500000,
    buildingDepreciation: 50000,
    physicalDepreciation: 30000,
    functionalDepreciation: 15000,
    externalDepreciation: 5000,
    finalValue: 300000,
    path: 'combined',
    details: [{ item: 'land', amount: 200000, description: '土地重置成本' }],
  };
}

describe('validateConsistency', () => {
  it('should pass consistency check when methods agree closely', () => {
    const results: CalculationResults[] = [
      makeComparableResult(),
      makeIncomeResult(),
      makeCostResult(),
    ];
    const result = validateConsistency(results);

    expect(result.checks).toHaveLength(11);
    expect(result.varianceAnalysis.acceptable).toBe(true);
    expect(result.recommendation.method).toBe('simpleAverage');
    expect(result.hasDiscrepancies).toBe(false);
  });

  it('should flag discrepancies when methods disagree significantly', () => {
    const results: CalculationResults[] = [
      makeComparableResult(),
      {
        ...makeIncomeResult(),
        finalValue: 1500000,
      },
      makeCostResult(),
    ];
    const result = validateConsistency(results);

    expect(result.hasDiscrepancies).toBe(true);
    expect(result.recommendation.method).toBe('weightedAverage');
    expect(result.varianceAnalysis.ratio > 1.2).toBe(true);
  });

  it('should flag negative values', () => {
    const results: CalculationResults[] = [
      makeComparableResult(),
      {
        ...makeIncomeResult(),
        finalValue: -100,
      },
    ];
    const result = validateConsistency(results);

    const calcCorrectness = result.checks.find(c => c.name === '估价计算的正确性');
    expect(calcCorrectness?.passed).toBe(false);
  });

  it('should handle single method', () => {
    const results: CalculationResults[] = [makeComparableResult()];
    const result = validateConsistency(results);
    expect(result.checks).toHaveLength(11);
  });
});
