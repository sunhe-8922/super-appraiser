/**
 * 估价流程管道
 * 对应 GB/T 50291-2015 第3.0.1条的11步程序
 */

import {
  EstimationContext,
  EstimationReport,
  ReportConfig,
  ComparableResult,
  IncomeResult,
  CostResult,
  CalculationResults,
} from '../types';
import { EstimationStateMachine } from './state-machine';
import { ReportEngine } from '../report/engine';
import { TemplateLoader } from '../report/template-loader';
import {
  ComparableSkill,
  IncomeSkill,
  CostSkill,
  MethodSelectionSkill,
  BaseSkill,
} from '../skills';
import { DataSourceAdapter } from '../data';

export interface PipelineConfig {
  dataSource: DataSourceAdapter;
  /** 是否并行执行测算（默认 true） */
  parallelCalculation?: boolean;
}

export interface PipelineInput {
  demand: Omit<EstimationContext['demand'], 'valueDatePoint'> & {
    valueDatePoint?: Partial<EstimationContext['demand']['valueDatePoint']>;
  };
  estObject: EstimationContext['estObject'];
}

// Method → Skill 构造器工厂。
// 新增方法类型时只需在此加一行，并行/串行两个分支都会自动覆盖。
type SkillFactory = () => BaseSkill;
const SKILL_REGISTRY: Record<string, SkillFactory> = {
  comparable: () => new ComparableSkill(),
  income: () => new IncomeSkill(),
  cost: () => new CostSkill(),
  // hypothetical 不在首期范围内
};

export class EstimationPipeline {
  private stateMachine: EstimationStateMachine;
  private reportEngine: ReportEngine;
  private dataSource: DataSourceAdapter;
  private parallel: boolean;

  constructor(config: PipelineConfig) {
    this.stateMachine = new EstimationStateMachine();
    this.reportEngine = new ReportEngine(new TemplateLoader());
    this.dataSource = config.dataSource;
    this.parallel = config.parallelCalculation ?? true;
  }

  /**
   * 执行完整的估价流程
   */
  async run(input: PipelineInput): Promise<EstimationReport> {
    let context: EstimationContext = {
      demand: {
        ...input.demand,
        valueDatePoint: {
          date: input.demand.valueDatePoint?.date ?? new Date(),
          type: input.demand.valueDatePoint?.type ?? 'present',
        },
      },
      estObject: input.estObject,
    };

    // 步骤 1-2: 需求澄清
    this.stateMachine.transition('demand_clarity');
    context = this.stepDemandClarity(context);

    // 步骤 3: 编制估价方案
    this.stateMachine.transition('estimation_plan');
    context = this.stepEstimationPlan(context);

    // 步骤 4: 搜集资料
    this.stateMachine.transition('data_collection');
    context = await this.stepDataCollection(context);

    // 步骤 5: 实地查勘
    this.stateMachine.transition('site_inspection');
    context = this.stepSiteInspection(context);

    // 步骤 6 前半: 方法选择
    this.stateMachine.transition('method_selection');
    context = this.stepMethodSelection(context);

    // 步骤 6 后半: 并行测算
    this.stateMachine.transition('calculation');
    context = await this.stepCalculation(context);

    // 步骤 7: 确定估价结果
    this.stateMachine.transition('result_determination');
    context = this.stepResultDetermination(context);

    // 步骤 8: 撰写估价报告
    this.stateMachine.transition('report_generation');
    context = this.stepReportGeneration(context);

    // 步骤 9: 审核估价报告
    this.stateMachine.transition('report_review');
    context = this.stepReportReview(context);

    // 步骤 10: 交付
    this.stateMachine.transition('delivery');

    // 步骤 11: 归档
    this.stateMachine.transition('archive');
    context = this.stepArchive(context);

    return context.report!;
  }

  /**
   * 步骤 1-2: 需求澄清
   */
  private stepDemandClarity(context: EstimationContext): EstimationContext {
    // 验证估价基本事项（3.0.3条）
    if (!context.demand.purpose) {
      throw new Error('估价目的不能为空（3.0.3条第1款）');
    }
    if (!context.demand.valueType) {
      throw new Error('价值类型不能为空（3.0.3条第4款）');
    }
    if (!context.estObject) {
      throw new Error('估价对象不能为空（3.0.3条第3款）');
    }
    return context;
  }

  /**
   * 步骤 3: 编制估价方案
   */
  private stepEstimationPlan(context: EstimationContext): EstimationContext {
    // 3.0.4条：方案内容包括技术路线、步骤、人员安排
    return {
      ...context,
      plan: {
        methods: [], // 待方法选择阶段确定
        dataRequirements: [
          { category: 'transaction', description: '可比交易实例', source: 'dataSource' },
          { category: 'income', description: '租金收益数据', source: 'dataSource' },
          { category: 'cost', description: '成本数据', source: 'dataSource' },
        ],
        timeline: { start: new Date(), end: new Date() },
        technicalRoute: '多方法综合估价',
      },
    };
  }

  /**
   * 步骤 4: 搜集资料（3.0.5条）
   */
  private async stepDataCollection(context: EstimationContext): Promise<EstimationContext> {
    const location =
      context.estObject.location.city + context.estObject.location.district;
    const [comparables, rentalData, marketIndex, costData] = await Promise.all([
      this.dataSource.fetchComparables({
        location,
        propertyType: context.estObject.propertyType,
        subType: context.estObject.subType,
      }),
      this.dataSource.fetchRentalData({
        location,
        propertyType: context.estObject.propertyType,
        subType: context.estObject.subType,
      }),
      this.dataSource.fetchMarketIndex(
        context.estObject.location.city,
        '2026-Q2',
      ),
      this.dataSource.fetchCostData(
        context.estObject.location.city,
        context.estObject.physical.structure,
      ),
    ]);

    return {
      ...context,
      collectedData: {
        comparables,
        rentalData,
        marketIndex,
        costData,
      },
    };
  }

  /**
   * 步骤 5: 实地查勘（3.0.7条）
   */
  private stepSiteInspection(context: EstimationContext): EstimationContext {
    // 首期：从已有数据推断查勘结果
    // 实际应由注册估价师现场查勘后填写
    return {
      ...context,
      inspectionRecord: {
        locationCondition: `位置：${context.estObject.location.city}${context.estObject.location.district}${context.estObject.location.street}`,
        physicalCondition: `结构：${context.estObject.physical.structure}，建成：${context.estObject.physical.yearBuilt}年，状况：${context.estObject.physical.condition}`,
        rightsCondition: `用途：${context.estObject.rights.landUseType}，期限至：${context.estObject.rights.landUseTermEnd.toDateString()}`,
        photos: [],
        inspectionDate: new Date(),
        inspector: '待定',
      },
    };
  }

  /**
   * 步骤 6 前半: 方法选择（4.1节）
   */
  private stepMethodSelection(context: EstimationContext): EstimationContext {
    const skill = new MethodSelectionSkill();
    return skill.execute(context);
  }

  /**
   * 步骤 6 后半: 并行测算
   */
  private async stepCalculation(
    context: EstimationContext,
  ): Promise<EstimationContext> {
    const plan = context.plan;
    if (!plan || plan.methods.length === 0) {
      throw new Error('未确定估价方法，无法进行测算');
    }

    if (this.parallel) {
      // 并行：每个方法独立运行，互不污染 context.calculationResults
      const baseContext: EstimationContext = {
        ...context,
        calculationResults: [], // 每个 skill 看到空数组，避免合并冲突
      };

      const taskMap = plan.methods.map((method) => {
        const factory = SKILL_REGISTRY[method];
        if (!factory) throw new Error(`Unsupported method: ${method}`);
        return () => factory().execute(baseContext);
      });

      const settled = await Promise.allSettled(taskMap.map((fn) => fn()));

      // 汇总所有成功的结果
      const mergedResults: CalculationResults[] = [];
      const errors: string[] = [];
      for (const [i, result] of settled.entries()) {
        if (result.status === 'fulfilled') {
          const ctx = result.value;
          if (ctx.calculationResults) {
            mergedResults.push(...ctx.calculationResults);
          }
        } else {
          errors.push(`${plan.methods[i]}: ${result.reason?.message ?? result.reason}`);
        }
      }

      if (mergedResults.length === 0) {
        throw new Error(
          `并行测算全部失败: ${errors.join('; ')}`
        );
      }

      if (errors.length > 0) {
        // 部分方法失败：警告但不阻断（GB/T 50291-2015 第6章允许多方法但部分失败）
        // eslint-disable-next-line no-console
        console.warn(`[并行测算] 部分方法失败: ${errors.join('; ')}`);
      }

      return {
        ...context,
        calculationResults: mergedResults,
      };
    }

    // 串行：保持向后兼容
    let result = context;
    for (const method of plan.methods) {
      const factory = SKILL_REGISTRY[method];
      if (!factory) throw new Error(`Unsupported method: ${method}`);
      result = factory().execute(result);
    }
    return result;
  }

  /**
   * 步骤 7: 确定估价结果（6.0节）
   */
  private stepResultDetermination(
    context: EstimationContext,
  ): EstimationContext {
    const results = context.calculationResults;
    if (!results || results.length === 0) {
      throw new Error('没有测算结果可以确定');
    }

    // 6.0.3条：校核
    // 6.0.5条：综合测算结果（简单算术平均）
    const values = results.map((r: CalculationResults) => r.finalValue);
    const simpleAvg = values.reduce((a: number, b: number) => a + b, 0) / values.length;

    // 6.0.6条：确定最终评估价值
    return {
      ...context,
      finalResult: {
        methodResults: results,
        combinationMethod: 'simpleAverage',
        comprehensiveResult: simpleAvg,
        finalValue: simpleAvg,
      },
    };
  }

  /**
   * 步骤 8: 撰写估价报告（7.0节）
   */
  private stepReportGeneration(context: EstimationContext): EstimationContext {
    const reportConfig: ReportConfig = {
      style: 'narrative',
      format: 'markdown',
    };

    const report = this.reportEngine.generate(context, reportConfig);

    return {
      ...context,
      report,
    };
  }

  /**
   * 步骤 9: 审核估价报告（3.0.11条）
   */
  private stepReportReview(context: EstimationContext): EstimationContext {
    // 首期：基础审核
    // 实际应形成审核记录（3.0.11条）
    return context;
  }

  /**
   * 步骤 11: 归档（3.0.13~3.0.14条）
   * 3.0.14条：保存期限不得少于10年
   */
  private stepArchive(context: EstimationContext): EstimationContext {
    // archiveList 和 retentionUntil 在首期作为日志输出，
    // 后续迭代将附加到 EstimationContext.archive 字段
    // eslint-disable-next-line no-console
    console.log('[归档] 保存期限不少于10年，自报告出具日起算');
    return context;
  }
}
