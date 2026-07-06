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

  // 通过 any-cast 访问 private 方法做单元测试，避免为测试重构 API。
  const fmt = (n: number) => (engine as unknown as { numberToChineseCurrency: (n: number) => string }).numberToChineseCurrency(n);

  describe('numberToChineseCurrency', () => {
    const cases: Array<[number, string]> = [
      // 基础边界
      [0, '零元整'],
      [0.01, '零元零壹分'],
      [0.10, '零元壹角'],
      [0.11, '零元壹角壹分'],
      // 单 section（<1万元）
      [1, '壹元整'],
      [10, '壹拾元整'],
      [20, '贰拾元整'],
      [110, '壹佰壹拾元整'],
      [1010, '壹仟零壹拾元整'],
      [1005, '壹仟零伍元整'],
      [1500, '壹仟伍佰元整'],
      [1234, '壹仟贰佰叁拾肆元整'],
      // 跨万位（旧实现会 silently demote 到 1 元 — 这个修复即回归测试）
      [10000, '壹万元整'],
      [100000, '壹拾万元整'],
      [1000000, '壹佰万元整'],
      [12345.67, '壹万贰仟叁佰肆拾伍元陆角柒分'],
      [123000, '壹拾贰万叁仟元整'],
      [12345, '壹万贰仟叁佰肆拾伍元整'],
      // 跨亿位
      [99000000.05, '玖仟玖佰万元零伍分'],
      [100000000, '壹亿元整'],
      [100005000, '壹亿零伍仟元整'],
      [100001001, '壹亿零壹仟零壹元整'],
      [1234567890.12, '壹拾贰亿叁仟肆佰伍拾陆万柒仟捌佰玖拾元壹角贰分'],
      // 估价报告典型值
      [37997645.03, '叁仟柒佰玖拾玖万柒仟陆佰肆拾伍元零叁分'],
      // 跨万亿位（段间单位 '万亿' 测试）
      [10000000000, '壹佰亿元整'],
      [1000000000000, '壹万亿元整'],
      // 负数取绝对值
      [-123.45, '壹佰贰拾叁元肆角伍分'],
    ];

    it.each(cases)('formats %s → %s', (input, expected) => {
      expect(fmt(input)).toBe(expected);
    });

    it('should never produce literal "undefined" or "NaN" anywhere', () => {
      // 旧 bug 在某些小数路径下输出 "...元undefined角"。
      // 兜底检查：任何输入都不应在结果里出现字符串 "undefined" / "NaN"。
      for (const n of [0, 0.01, 0.1, 1, 1234, 10000, 100000, 1234567, 99999999.99, 1234567890.5]) {
        const out = fmt(n);
        expect(out).not.toMatch(/undefined/);
        expect(out).not.toMatch(/NaN/);
      }
    });
  });

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
