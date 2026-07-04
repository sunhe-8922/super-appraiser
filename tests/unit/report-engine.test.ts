import { describe, it, expect } from '@jest/globals';
import { ReportEngine } from '../../src/report/engine';
import { TemplateLoader } from '../../src/report/template-loader';
import {
  EstimationContext,
  ComparableResult,
  IncomeResult,
  CostResult,
  FinalEstimationResult,
} from '../../src/types';

function makeContext(overrides: Partial<EstimationContext> = {}): EstimationContext {
  const base: EstimationContext = {
    demand: {
      purpose: 'mortgage',
      valueType: 'marketValue',
      client: { name: '张三', type: 'individual' as const },
      valueDatePoint: { date: new Date('2026-07-04'), type: 'present' as const },
    },
    estObject: {
      propertyType: 'residential',
      subType: 'apartment',
      location: { city: '北京', district: '朝阳区', street: '建国路88号', community: '现代城小区' },
      area: { constructionArea: 89.5 },
      physical: { structure: '钢筋混凝土', yearBuilt: 2015, condition: '完好', decoration: '中等装修', facilities: ['电梯', '暖气'] },
      rights: { landUseType: '住宅', landUseTermEnd: new Date('2083-05-15'), ownership: '私有', restrictions: [] },
    },
    calculationResults: [
      {
        method: 'comparable',
        adjustedValues: [6086000, 6330800, 5740000],
        finalValue: 6052267,
        details: [],
      } as ComparableResult,
      {
        method: 'income',
        grossIncome: 102000,
        operatingExpenses: 15300,
        netOperatingIncome: 86700,
        capitalizationRate: 0.045,
        finalValue: 1926667,
        model: 'directCap',
        incomePeriod: 50,
        details: [],
      } as IncomeResult,
      {
        method: 'cost',
        landReplacementCost: 1077000,
        buildingReplacementCost: 313250,
        buildingDepreciation: 62650,
        physicalDepreciation: 31325,
        functionalDepreciation: 15662,
        externalDepreciation: 15662,
        finalValue: 3331488,
        path: 'combined',
        details: [],
      } as CostResult,
    ],
    finalResult: {
      methodResults: [],
      combinationMethod: 'simpleAverage',
      comprehensiveResult: 3436807,
      finalValue: 3436807,
    } as FinalEstimationResult,
  };
  return { ...base, ...overrides };
}

describe('ReportEngine', () => {
  const engine = new ReportEngine(new TemplateLoader());

  it('should generate narrative report', () => {
    const ctx = makeContext();
    const report = engine.generate(ctx, { style: 'narrative', format: 'markdown' });

    expect(report.style).toBe('narrative');
    expect(report.config.format).toBe('markdown');
    expect(report.content).toContain('致张三函');
    expect(report.content).toContain('房地产抵押估价');
    expect(report.content).toContain('市场价值');
    expect(report.content).toContain('北京朝阳区');
    expect(report.content).toContain('叁');
    expect(report.content).toContain('注册房地产估价师声明');
    expect(report.content).toContain('估价假设和限制条件');
    expect(report.content).toContain('估价结果报告');
    expect(report.content).toContain('估价技术报告');
    expect(report.content).toContain('GB/T 50291-2015');
    expect(report.content.length).toBeGreaterThan(500);
  });

  it('should generate tabular report', () => {
    const ctx = makeContext();
    const report = engine.generate(ctx, { style: 'tabular', format: 'markdown' });

    expect(report.style).toBe('tabular');
    expect(report.content).toContain('估价报告（表格式）');
    expect(report.content).toContain('多宗房地产估价结果对比表');
    expect(report.content).toContain('抵押价值');
    expect(report.content.length).toBeGreaterThan(500);
  });

  it('should include report number in format SA-{year}-*', () => {
    const ctx = makeContext();
    const report = engine.generate(ctx, { style: 'narrative', format: 'markdown' });

    expect(report.content).toMatch(/SA-202[0-9]-[A-Z0-9]+/);
  });

  it('should handle missing calculation results gracefully', () => {
    const ctx = makeContext({ calculationResults: undefined, finalResult: undefined });
    const report = engine.generate(ctx, { style: 'narrative', format: 'markdown' });

    expect(report.content).toContain('待定');
    expect(report.content).toContain('致张三函');
  });

  it('should use custom template when provided', () => {
    const customDir = 'd:/gujia估价/super-appraiser/templates';
    const engineWithTemplates = new ReportEngine(new TemplateLoader(undefined, customDir));
    const ctx = makeContext();
    const report = engineWithTemplates.generate(ctx, { style: 'narrative', format: 'markdown' });

    expect(report.content).toContain('估价报告（叙述式）');
  });
});
