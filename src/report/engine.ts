/**
 * 报告生成引擎
 * 对应 GB/T 50291-2015 第7章
 */

import mustache from 'mustache';
import {
  EstimationContext,
  EstimationReport,
  ReportConfig,
  ReportStyle,
  ComparableResult,
  IncomeResult,
  CostResult,
} from '../types';
import { TemplateLoader } from './template-loader';

// Module-level label maps — shared across methods to avoid re-creation per call
const PURPOSE_LABELS: Record<string, string> = {
  mortgage: '房地产抵押估价（5.1）',
  tax: '房地产税收估价（5.2）',
  expropriation: '房地产征收估价（5.3）',
  auction: '房地产拍卖估价（5.4）',
  transfer: '房地产转让估价（5.8）',
  lease: '房地产租赁估价（5.9）',
  damage: '房地产损害赔偿估价（5.6）',
  insurance: '房地产保险估价（5.7）',
  fund: '房地产投资基金物业估价（5.11）',
  'financial-report': '为财务报告服务的房地产估价（5.12）',
  'corporate-activity': '企业各种经济活动涉及的房地产估价（5.13）',
  dispute: '房地产纠纷估价（5.14）',
  other: '其他目的估价（5.15）',
};

const VALUE_TYPE_LABELS: Record<string, string> = {
  marketValue: '市场价值（2.0.1）',
  mortgageValue: '抵押价值（2.0.2）',
  mortgageNetValue: '抵押净值（2.0.2）',
  investmentValue: '投资价值（2.0.3）',
  currentValue: '现状价值（2.0.3）',
  liquidationValue: '清算价值',
  rentalValue: '租金价值',
  other: '其他价值',
};

const METHOD_LABELS: Record<string, string> = {
  comparable: '比较法',
  income: '收益法',
  cost: '成本法',
  hypothetical: '假设开发法',
};

export class ReportEngine {
  private templateLoader: TemplateLoader;

  constructor(templateLoader?: TemplateLoader) {
    this.templateLoader = templateLoader ?? new TemplateLoader();
  }

  /**
   * 生成估价报告
   * 7.0.1: 报告应采取书面形式，真实、客观、准确、完整、清晰、规范
   */
  generate(context: EstimationContext, config: ReportConfig): EstimationReport {
    const sections = this.renderSections(context, config.style);
    const content = this.combineSections(sections, config.style, config.format);

    return {
      style: config.style,
      content,
      config,
    };
  }

  /**
   * 渲染报告各部分
   */
  private renderSections(
    context: EstimationContext,
    style: ReportStyle,
  ): Record<string, string> {
    const finalValueNum = context.finalResult?.finalValue ?? 0;
    const base = {
      reportNumber: this.generateReportNumber(),
      projectName: `${context.estObject.location.city}${context.estObject.location.district}房地产估价`,
      clientName: context.demand.client.name,
      agencyName: '待定',
      appraisers: '待定',
      issueDate: new Date().toISOString().split('T')[0],
      purpose: this.getPurposeLabel(context.demand.purpose),
      objectType: this.getObjectTypeLabel(context.estObject),
      valueDate: context.demand.valueDatePoint.date.toISOString().split('T')[0],
      valueType: this.getValueTypeLabel(context.demand.valueType),
      methods: this.getMethodLabels(context),
      finalValue: finalValueNum > 0 ? `${finalValueNum.toFixed(2)} 元` : '待定',
      finalValueCNY: finalValueNum > 0 ? this.numberToChineseCurrency(finalValueNum) : '零元整',
      // Extra fields for templates
      inspectionPeriod: '待定',
      workingPeriod: '待定',
      locationDescription: this.renderLocationDescription(context),
      structure: context.estObject.physical.structure,
      yearBuilt: String(context.estObject.physical.yearBuilt),
      constructionArea: String(context.estObject.area.constructionArea),
      decoration: context.estObject.physical.decoration ?? '待定',
      landUseType: context.estObject.rights.landUseType,
      landUseTermEnd: context.estObject.rights.landUseTermEnd.toISOString().split('T')[0],
      ownership: context.estObject.rights.ownership,
      marketBackground: '待定',
      highestBestUse: '待定',
      methodApplicability: this.renderMethodApplicability(context),
      calculationProcess: this.renderCalculationProcess(context),
      resultDetermination: this.renderResultDetermination(context),
    };

    if (style === 'narrative') {
      return {
        ...base,
        ...this.renderNarrativeSections(context, base),
      };
    }

    // tabular
    return {
      ...base,
      ...this.renderTabularSections(context, base),
    };
  }

  /**
   * 叙述式报告各部分 — 返回 mustache 模板渲染出的 markdown 字符串。
   * 实际渲染由 combineSections 从模板文件加载，本方法仅在模板缺失时作为回退。
   */
  private renderNarrativeSections(
    context: EstimationContext,
    base: Record<string, string>,
  ): Record<string, string> {
    return {
      letter: this.renderLetterMarkdown(base),
      declaration: this.renderDeclarationMarkdown(),
      assumptions: this.renderAssumptionsMarkdown(base),
      resultReport: this.renderResultReportMarkdown(base),
      technicalReport: this.renderTechnicalReportMarkdown(base),
    };
  }

  /**
   * 表格式报告（7.0.21条）
   */
  private renderTabularSections(
    context: EstimationContext,
    base: Record<string, string>,
  ): Record<string, string> {
    return {
      ...base,
      ...this.renderMethodComparisonTable(context),
      ...this.renderMortgageValueTable(context),
    };
  }

  /**
   * 组合各部分为最终内容
   */
  private combineSections(
    sections: Record<string, string>,
    style: ReportStyle,
    format: ReportConfig['format'],
  ): string {
    let output = '';

    if (style === 'narrative') {
      // 一次加载所有部分，避免对同一模板重复 stat
      const partKeys = ['cover', 'letter', 'declaration', 'assumptions', 'resultReport', 'technicalReport'] as const;
      for (const part of partKeys) {
        const template = this.templateLoader.load('narrative', part);
        if (template) {
          output += mustache.render(template, sections) + '\n\n';
        } else {
          // 模板缺失：回退到内嵌渲染（sections 中已准备好 markdown）
          const fallback = sections[part];
          if (fallback) output += fallback + '\n\n';
        }
      }
    } else {
      // tabular: 始终使用 single-property 模板
      const template = this.templateLoader.load('tabular', 'single-property');
      output = template ? mustache.render(template, sections) : (sections.resultReport ?? '');

      const multiTemplate = this.templateLoader.load('tabular', 'multi-property');
      if (multiTemplate) output += mustache.render(multiTemplate, sections);
      const mortgageTemplate = this.templateLoader.load('tabular', 'mortgage-value');
      if (mortgageTemplate) output += mustache.render(mortgageTemplate, sections);
    }

    return output.trim();
  }

  // --- 辅助方法 ---

  private generateReportNumber(): string {
    const year = new Date().getFullYear();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `SA-${year}-${random}`;
  }

  private getPurposeLabel(purpose: string): string { return PURPOSE_LABELS[purpose] ?? PURPOSE_LABELS.other; }

  private getObjectTypeLabel(obj: EstimationContext['estObject']): string {
    return `${obj.location.city}${obj.location.district}${obj.location.street}${obj.location.community || ''}`;
  }

  private getValueTypeLabel(type: string): string { return VALUE_TYPE_LABELS[type] ?? type; }

  private getMethodLabels(context: EstimationContext): string {
    if (!context.calculationResults?.length) return '待定';
    return context.calculationResults.map(r => METHOD_LABELS[r.method] ?? r.method).join('、');
  }

  /**
   * 大写金额转换
   * 处理边界情况：0、负数（取绝对值）、小数位
   */
  private numberToChineseCurrency(amount: number): string {
    if (amount === 0) return '零元整';

    const digits = '零壹贰叁肆伍陆柒捌玖';
    const units = ['元', '角', '分', '厘'];

    // 取绝对值处理
    const absAmount = Math.abs(amount);
    const integerPart = Math.floor(absAmount);
    const decimalPart = Math.round((absAmount - integerPart) * 100);

    // 整数部分转换
    let result = '';
    if (integerPart === 0) {
      result = '零';
    } else {
      const numStr = integerPart.toString();
      let zeroFlag = false; // 是否已在结果末尾添加过"零"
      for (let i = 0; i < numStr.length; i++) {
        const digit = parseInt(numStr[i]);
        const pos = numStr.length - 1 - i; // 从低位算起的位置
        if (digit === 0) {
          if (!zeroFlag) {
            result += '零';
            zeroFlag = true;
          }
        } else {
          result += digits[digit];
          // 添加单位（个位不加单位，由"元"代替）
          if (pos > 0) {
            const unitIdx = pos - 1;
            if (unitIdx < 4) {
              result += ['拾', '佰', '仟', '万'][unitIdx] ?? '';
            }
          }
          zeroFlag = false;
        }
      }
      // 去除末尾多余的零
      result = result.replace(/零+$/, '');
    }

    result = (result || '零') + '元';

    // 小数部分
    if (decimalPart === 0) {
      result += '整';
    } else {
      const jiao = Math.floor(decimalPart / 10);
      const fen = decimalPart % 10;
      if (jiao > 0) {
        result += digits[jiao] + '角';
      }
      if (fen > 0) {
        result += digits[fen] + '分';
      }
    }

    return result;
  }

  private renderLetterMarkdown(base: Record<string, string>): string {
    return `## 致${base.clientName}函

${base.clientName}：

受您的委托，我们对估价对象进行了估价。现将估价结果报告如下：

| 事项 | 内容 |
|------|------|
| 估价目的 | ${base.purpose} |
| 估价对象 | ${base.objectType} |
| 价值时点 | ${base.valueDate} |
| 价值类型 | ${base.valueType} |
| 估价方法 | ${base.methods} |
| 估价结果 | ${base.finalValue}（大写：${base.finalValueCNY}） |
| 致函日期 | ${base.issueDate} |

---

**${base.agencyName}**（公章）
**法定代表人/执行事务合伙人：** __________`;
  }

  private renderDeclarationMarkdown(): string {
    // 7.0.13 鉴证性估价报告的估价师声明
    return `**注册房地产估价师声明：**

1. 我们在本估价报告中对事实的说明是真实和准确的，没有虚假记载、误导性陈述和重大遗漏；
2. 估价报告中的分析、意见和结论是我们独立、客观、公正的专业分析、意见和结论，但受到估价报告中已说明的估价假设和限制条件的限制；
3. 我们与估价对象没有现实或潜在的利益，与估价委托人及估价利害关系人没有利害关系，也对估价对象、估价委托人及估价利害关系人没有偏见；
4. 我们是按照 GB/T 50291-2015《房地产估价规范》的规定进行估价工作，撰写估价报告。

---

**注册房地产估价师签名：** __________    **签名日期：** __________`;
  }

  private renderAssumptionsMarkdown(base: Record<string, string>): string {
    // 7.0.16 估价假设和限制条件
    return `## 估价假设和限制条件

### 一、估价假设

#### （一）一般假设
1. 估价所依据的估价对象的权属、面积、用途等资料已经过检查，在无理由怀疑其合法性、真实性、准确性和完整性的情况下，对其合法、真实、准确和完整的合理假定。
2. 在无理由怀疑估价对象存在安全隐患且无相应的专业机构进行鉴定、检测的情况下，对其安全的合理假定。

### 二、估价报告使用限制
1. 本报告使用期限自估价报告出具之日起计算，不宜超过一年。
2. 本报告仅供${base.purpose}使用。
3. 本报告的全部内容由${base.agencyName}负责解释。`;
  }

  private renderResultReportMarkdown(base: Record<string, string>): string {
    // 7.0.17 估价结果报告
    return `## 估价结果报告

| 序号 | 项目 | 内容 |
|------|------|------|
| 1 | 估价委托人 | ${base.clientName} |
| 2 | 房地产估价机构 | ${base.agencyName} |
| 3 | 估价目的 | ${base.purpose} |
| 4 | 估价对象 | ${base.objectType} |
| 5 | 价值时点 | ${base.valueDate} |
| 6 | 价值类型 | ${base.valueType} |
| 7 | 估价原则 | 独立、客观、公正原则；合法原则；价值时点原则；替代原则；最高最佳利用原则 |
| 8 | 估价方法 | ${base.methods} |
| 9 | 估价结果 | ${base.finalValue}（大写：${base.finalValueCNY}） |
| 10 | 注册房地产估价师 | ${base.appraisers} |
| 11 | 实地查勘期 | ${base.inspectionPeriod} |
| 12 | 估价作业期 | ${base.workingPeriod} |`;
  }

  private renderTechnicalReportMarkdown(base: Record<string, string>): string {
    // 7.0.18 估价技术报告
    return `## 估价技术报告

### 一、估价对象描述与分析

#### （一）区位状况
${base.locationDescription}

#### （二）实物状况
- 建筑结构：${base.structure}
- 建成年代：${base.yearBuilt}年
- 建筑面积：${base.constructionArea} m²
- 装修情况：${base.decoration}

#### （三）权益状况
- 用途：${base.landUseType}
- 土地使用期限：至${base.landUseTermEnd}
- 权属状况：${base.ownership}

### 二、市场背景描述与分析
${base.marketBackground}

### 三、估价对象最高最佳利用分析
${base.highestBestUse}

### 四、估价方法适用性分析
${base.methodApplicability}

### 五、估价测算过程
${base.calculationProcess}

### 六、估价结果确定
${base.resultDetermination}`;
  }

  private renderLocationDescription(_context: EstimationContext): string {
    return '待定';
  }

  private renderMethodApplicability(context: EstimationContext): string {
    if (!context.calculationResults?.length) return '待定';
    return context.calculationResults.map(r =>
      `- **${METHOD_LABELS[r.method] ?? r.method}**：已采用，测算结果 ${r.finalValue.toFixed(2)} 元`,
    ).join('\n');
  }

  private renderCalculationProcess(context: EstimationContext): string {
    if (!context.calculationResults || context.calculationResults.length === 0) {
      return '待定';
    }
    const parts: string[] = [];
    for (const result of context.calculationResults) {
      parts.push(this.renderCalculationDetail(result));
    }
    return parts.join('\n');
  }

  private renderResultDetermination(context: EstimationContext): string {
    if (!context.finalResult) return '待定';
    const method = context.finalResult.combinationMethod === 'simpleAverage'
      ? '简单算术平均'
      : '加权算术平均';
    let result = `综合方法：${method}\n综合测算结果：${context.finalResult.comprehensiveResult.toFixed(2)} 元\n最终评估价值：${context.finalResult.finalValue.toFixed(2)} 元`;
    if (context.finalResult.adjustmentReason) {
      result += `\n调整理由：${context.finalResult.adjustmentReason}`;
    }
    return result;
  }

  private renderCalculationDetail(result: ComparableResult | IncomeResult | CostResult): string {
    const label = METHOD_LABELS[result.method] ?? result.method;
    return `#### ${label}测算\n测算结果：${result.finalValue.toFixed(2)} 元`;
  }

  private renderMethodComparisonTable(context: EstimationContext): Record<string, string> {
    const result: Record<string, string> = {};

    if (!context.calculationResults || context.calculationResults.length === 0) {
      result.comparableValue = '待定';
      result.incomeValue = '待定';
      result.costValue = '待定';
      return result;
    }

    for (const r of context.calculationResults) {
      if (r.method === 'comparable') {
        result.comparableValue = r.finalValue.toFixed(2);
        result.comparableNote = '比较法说明';
      } else if (r.method === 'income') {
        result.incomeValue = r.finalValue.toFixed(2);
        result.incomeNote = '收益法说明';
      } else if (r.method === 'cost') {
        result.costValue = r.finalValue.toFixed(2);
        result.costNote = '成本法说明';
      }
    }

    return result;
  }

  private renderMortgageValueTable(context: EstimationContext): Record<string, string> {
    const result: Record<string, string> = {};
    const mortgage = context.estObject.rights.mortgage;

    result.valueWithoutMortgage = context.finalResult
      ? context.finalResult.finalValue.toFixed(2)
      : '待定';
    result.owedConstructionCost = '0.00';
    result.statutoryPriorityAmount = mortgage
      ? mortgage.amount.toFixed(2)
      : '0.00';
    result.mortgageValue = context.finalResult
      ? (context.finalResult.finalValue - (mortgage?.amount ?? 0)).toFixed(2)
      : '待定';

    return result;
  }
}
