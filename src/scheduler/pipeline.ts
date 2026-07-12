/**
 * 估价流程管道
 * 对应 GB/T 50291-2015 第3.0.1条的11步程序
 *
 * Meta-Control：全阶段结构化日志；可选 Meta 循环（停滞→改写→沙盒→回滚）
 * 资料搜集：内嵌并行联网调研方法论（计划 + 充分性自检钩子）
 */

import {
  EstimationContext,
  EstimationReport,
  ReportConfig,
  CalculationResults,
} from '../types';
import { EstimationStateMachine, EstimationStage } from './state-machine';
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
import { StructuredLogger } from '../observability/logger';
import {
  MetaController,
  findRepoRoot,
  type MetaCycleResult,
} from '../meta/controller';
import {
  assessSufficiency,
  buildLaneAgentPrompt,
  buildResearchPlan,
  keywordTemplates,
  type ResearchBundle,
  type ResearchFinding,
} from '../research/methodology';

export interface PipelineConfig {
  dataSource: DataSourceAdapter;
  /** 是否并行执行测算（默认 true） */
  parallelCalculation?: boolean;
  /** 结构化日志；默认内存 logger */
  logger?: StructuredLogger;
  /** JSONL 落盘目录（当未传入 logger 时生效） */
  logDir?: string;
  /** 跑完后是否执行 Meta 诊断循环（默认 false，避免副作用） */
  enableMetaLoop?: boolean;
  meta?: MetaController;
  /** 自定义模板加载 */
  templateLoader?: TemplateLoader;
}

export interface PipelineInput {
  demand: Omit<EstimationContext['demand'], 'valueDatePoint'> & {
    valueDatePoint?: Partial<EstimationContext['demand']['valueDatePoint']>;
  };
  estObject: EstimationContext['estObject'];
}

export interface PipelineRunResult {
  report: EstimationReport;
  logger: StructuredLogger;
  research?: ResearchBundle;
  meta?: MetaCycleResult;
}

// Method → Skill 构造器工厂。
type SkillFactory = () => BaseSkill;
const SKILL_REGISTRY: Record<string, SkillFactory> = {
  comparable: () => new ComparableSkill(),
  income: () => new IncomeSkill(),
  cost: () => new CostSkill(),
};

export class EstimationPipeline {
  private stateMachine: EstimationStateMachine;
  private reportEngine: ReportEngine;
  private dataSource: DataSourceAdapter;
  private parallel: boolean;
  private logger: StructuredLogger;
  private enableMetaLoop: boolean;
  private meta?: MetaController;

  constructor(config: PipelineConfig) {
    this.stateMachine = new EstimationStateMachine();
    this.reportEngine = new ReportEngine(
      config.templateLoader ?? new TemplateLoader(),
    );
    this.dataSource = config.dataSource;
    this.parallel = config.parallelCalculation ?? true;
    this.logger =
      config.logger ??
      new StructuredLogger({
        agentId: 'worker',
        logDir: config.logDir,
      });
    this.enableMetaLoop = config.enableMetaLoop ?? false;
    this.meta = config.meta;
  }

  getLogger(): StructuredLogger {
    return this.logger;
  }

  /**
   * 执行完整的估价流程（兼容旧 API：只返回 report）
   */
  async run(input: PipelineInput): Promise<EstimationReport> {
    const full = await this.runWithTelemetry(input);
    return full.report;
  }

  /**
   * 执行完整流程并返回日志 / 调研计划 / Meta 结果
   */
  async runWithTelemetry(input: PipelineInput): Promise<PipelineRunResult> {
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

    let research: ResearchBundle | undefined;

    try {
      this.go('demand_clarity');
      context = this.stepDemandClarity(context);

      this.go('estimation_plan');
      context = this.stepEstimationPlan(context);

      this.go('data_collection');
      const collected = await this.stepDataCollection(context);
      context = collected.context;
      research = collected.research;

      this.go('site_inspection');
      context = this.stepSiteInspection(context);

      this.go('method_selection');
      context = this.stepMethodSelection(context);

      this.go('calculation');
      context = await this.stepCalculation(context);

      this.go('result_determination');
      context = this.stepResultDetermination(context);

      this.go('report_generation');
      context = this.stepReportGeneration(context);

      this.go('report_review');
      context = this.stepReportReview(context);

      this.go('delivery');
      this.go('archive');
      context = this.stepArchive(context);

      this.logger.output('pipeline', {
        artifact: 'estimation-report',
        summary: 'pipeline completed',
        metrics: {
          final_value: context.finalResult?.finalValue ?? 0,
          methods: context.plan?.methods?.length ?? 0,
          report_chars: context.report?.content?.length ?? 0,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.failure(this.stateMachine.getCurrentStage(), {
        error_type: err instanceof Error ? err.name : 'Error',
        message,
        signature: `pipeline:${message.slice(0, 80)}`,
      });
      throw err;
    }

    let metaResult: MetaCycleResult | undefined;
    if (this.enableMetaLoop) {
      const meta =
        this.meta ??
        new MetaController({
          logger: this.logger.child('meta'),
          repoRoot: findRepoRoot(),
          // 成功路径默认不改写真实 skill，避免 demo run 污染仓库；
          // 停滞场景由调用方显式传入 promoteToDisk:true 的 MetaController
          promoteToDisk: false,
        });
      metaResult = meta.runCycle(this.logger.getEvents());
    }

    return {
      report: context.report!,
      logger: this.logger,
      research,
      meta: metaResult,
    };
  }

  private go(to: EstimationStage): void {
    const result = this.stateMachine.transition(to);
    this.logger.stateTransition(result.from, result.to, result.allowed, result.reason);
    if (!result.allowed) {
      throw new Error(result.reason ?? `非法状态转移 → ${to}`);
    }
  }

  private stepDemandClarity(context: EstimationContext): EstimationContext {
    if (!context.demand.purpose) {
      throw new Error('估价目的不能为空（3.0.3条第1款）');
    }
    if (!context.demand.valueType) {
      throw new Error('价值类型不能为空（3.0.3条第4款）');
    }
    if (!context.estObject) {
      throw new Error('估价对象不能为空（3.0.3条第3款）');
    }
    this.logger.decision('demand_clarity', {
      context: 'validate demand basics',
      alternatives: ['reject', 'accept'],
      selected: 'accept',
      tradeoffs: `purpose=${context.demand.purpose}; valueType=${context.demand.valueType}`,
    });
    return context;
  }

  private stepEstimationPlan(context: EstimationContext): EstimationContext {
    return {
      ...context,
      plan: {
        methods: [],
        dataRequirements: [
          { category: 'transaction', description: '可比交易实例', source: 'dataSource+web-research' },
          { category: 'income', description: '租金收益数据', source: 'dataSource+web-research' },
          { category: 'cost', description: '成本数据', source: 'dataSource+web-research' },
        ],
        timeline: { start: new Date(), end: new Date() },
        technicalRoute: '多方法综合估价 + 并行联网资料校验',
      },
    };
  }

  /**
   * 步骤 4: 搜集资料（3.0.5条）
   * 嵌入并行联网调研方法论：生成三线计划与充分性自检（Agent 执行时必须联网补全）
   */
  private async stepDataCollection(
    context: EstimationContext,
  ): Promise<{ context: EstimationContext; research: ResearchBundle }> {
    const loc = context.estObject.location;
    const subject = `${loc.city}${loc.district}${loc.community ?? loc.street}`;
    const question = `为 ${context.demand.purpose} 目的收集可比成交、租金、成本与市场指数，支撑 GB/T 50291-2015 测算`;

    const plan = buildResearchPlan(subject, question, { complex: true });
    const lanePrompts = Object.fromEntries(
      plan.lanes.map((lane) => [lane, buildLaneAgentPrompt(plan, lane)]),
    ) as Record<string, string>;

    this.logger.decision('data_collection', {
      context: 'parallel web research plan',
      alternatives: ['adapter-only', 'adapter+parallel-web-research'],
      selected: 'adapter+parallel-web-research',
      tradeoffs: '资料质量取决于联网丰富度与准确性；禁止仅靠先验知识',
    });
    this.logger.output('data_collection', {
      artifact: 'research-plan',
      summary: `lanes=${plan.lanes.join(',')}`,
      metrics: {
        lane_count: plan.lanes.length,
        keywords_vertical: keywordTemplates(subject).vertical.length,
      },
    });
    // 将子 Agent prompt 写入日志，供 Agent 运行时消费（非 print）
    this.logger.log(
      'output',
      {
        artifact: 'subagent-prompts',
        summary: 'vertical/horizontal/community prompts ready',
        lanePrompts,
        networkRequired: true,
      },
      { stage: 'data_collection', outcome: 'ok' },
    );

    const location = loc.city + loc.district;
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
      this.dataSource.fetchMarketIndex(loc.city, deriveQuarter(context.demand.valueDatePoint.date)),
      this.dataSource.fetchCostData(loc.city, context.estObject.physical.structure),
    ]);

    // 将 adapter 产出映射为 research findings，跑充分性自检
    const findings: ResearchFinding[] = [];
    for (const c of comparables) {
      findings.push({
        lane: 'horizontal',
        claim: `可比实例 ${c.id} @ ${c.location} 单价 ${c.unitPrice}`,
        sources: [{ url: `adapter://comparables/${c.id}`, tier: 'secondary', title: 'DataSourceAdapter' }],
        confidence: 'medium',
      });
    }
    for (const r of rentalData) {
      findings.push({
        lane: 'horizontal',
        claim: `租金 ${r.address} ${r.unitRent} 元/m²/天`,
        sources: [{ url: `adapter://rental/${encodeURIComponent(r.address)}`, tier: 'secondary' }],
        confidence: 'medium',
      });
    }
    findings.push({
      lane: 'vertical',
      claim: `市场指数 ${marketIndex.period} 环比 ${marketIndex.monthOverMonthChange}% 来源 ${marketIndex.source}`,
      sources: [{ url: `adapter://market-index/${marketIndex.period}`, tier: 'secondary', title: marketIndex.source }],
      confidence: 'medium',
    });
    if (costData) {
      findings.push({
        lane: 'vertical',
        claim: `建安成本 ${costData.constructionCostPerM2} 元/m²`,
        sources: [{ url: 'adapter://cost', tier: 'secondary' }],
        confidence: 'medium',
      });
    }

    const { items, needsMoreSearch } = assessSufficiency(findings);
    this.logger.log(
      'sufficiency_check',
      {
        items,
        needsMoreSearch,
        guidance: needsMoreSearch
          ? '信息不足：必须继续联网补搜（纵向故事/横向可比/一手来源），禁止凑合进入测算'
          : '充分性自检通过（adapter 层）；Agent 仍应优先用一手来源加固',
      },
      {
        stage: 'data_collection',
        outcome: needsMoreSearch ? 'partial' : 'ok',
      },
    );

    const research: ResearchBundle = {
      plan,
      findings,
      sufficiency: items,
      needsMoreSearch,
    };

    return {
      context: {
        ...context,
        collectedData: {
          comparables,
          rentalData,
          marketIndex,
          costData,
        },
      },
      research,
    };
  }

  private stepSiteInspection(context: EstimationContext): EstimationContext {
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

  private stepMethodSelection(context: EstimationContext): EstimationContext {
    const skill = new MethodSelectionSkill().setLogger(this.logger);
    return skill.run(context);
  }

  private async stepCalculation(
    context: EstimationContext,
  ): Promise<EstimationContext> {
    const plan = context.plan;
    if (!plan || plan.methods.length === 0) {
      throw new Error('未确定估价方法，无法进行测算');
    }

    this.logger.decision('calculation', {
      context: 'run valuation methods',
      alternatives: plan.methods,
      selected: this.parallel ? `parallel:${plan.methods.join('+')}` : `serial:${plan.methods.join('→')}`,
      tradeoffs: this.parallel ? '并行隔离 context' : '串行累积 context',
    });

    if (this.parallel) {
      const baseContext: EstimationContext = {
        ...context,
        calculationResults: [],
      };

      const taskMap = plan.methods.map((method) => {
        const factory = SKILL_REGISTRY[method];
        if (!factory) throw new Error(`Unsupported method: ${method}`);
        return () => factory().setLogger(this.logger).run(baseContext);
      });

      const settled = await Promise.allSettled(taskMap.map((fn) => fn()));

      const mergedResults: CalculationResults[] = [];
      const errors: string[] = [];
      for (const [i, result] of settled.entries()) {
        if (result.status === 'fulfilled') {
          const ctx = result.value;
          if (ctx.calculationResults) {
            mergedResults.push(...ctx.calculationResults);
          }
        } else {
          const msg = `${plan.methods[i]}: ${result.reason?.message ?? result.reason}`;
          errors.push(msg);
          this.logger.failure('calculation', {
            error_type: 'MethodFailed',
            message: msg,
            signature: `calculation:${plan.methods[i]}`,
          });
        }
      }

      if (mergedResults.length === 0) {
        throw new Error(`并行测算全部失败: ${errors.join('; ')}`);
      }

      if (errors.length > 0) {
        this.logger.log(
          'failure',
          {
            error_type: 'PartialMethodFailure',
            message: errors.join('; '),
            signature: 'calculation:partial',
            evidence: errors.join(' | '),
          },
          { stage: 'calculation', outcome: 'partial' },
        );
      }

      return {
        ...context,
        calculationResults: mergedResults,
      };
    }

    let result = context;
    for (const method of plan.methods) {
      const factory = SKILL_REGISTRY[method];
      if (!factory) throw new Error(`Unsupported method: ${method}`);
      result = factory().setLogger(this.logger).run(result);
    }
    return result;
  }

  private stepResultDetermination(
    context: EstimationContext,
  ): EstimationContext {
    const results = context.calculationResults;
    if (!results || results.length === 0) {
      throw new Error('没有测算结果可以确定');
    }

    const values = results.map((r: CalculationResults) => r.finalValue);
    const simpleAvg = values.reduce((a: number, b: number) => a + b, 0) / values.length;

    this.logger.decision('result_determination', {
      context: 'combine method results',
      alternatives: ['simpleAverage', 'weightedAverage'],
      selected: 'simpleAverage',
      tradeoffs: '6.0.5 简单算术平均；后续可扩展权重',
    });

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

  private stepReportGeneration(context: EstimationContext): EstimationContext {
    const reportConfig: ReportConfig = {
      style: 'narrative',
      format: 'markdown',
    };
    const report = this.reportEngine.generate(context, reportConfig);
    this.logger.output('report_generation', {
      artifact: 'narrative-report',
      summary: `chars=${report.content.length}`,
      metrics: { length: report.content.length },
    });
    return {
      ...context,
      report,
    };
  }

  private stepReportReview(context: EstimationContext): EstimationContext {
    this.logger.decision('report_review', {
      context: 'stub review pass-through',
      alternatives: ['pass', 'return_to_generation'],
      selected: 'pass',
      tradeoffs: '首期基础审核；后续扩展审核记录 3.0.11',
    });
    return context;
  }

  private stepArchive(context: EstimationContext): EstimationContext {
    this.logger.output('archive', {
      artifact: 'archive-notice',
      summary: '保存期限不少于10年，自报告出具日起算（3.0.14）',
      metrics: { retention_years: 10 },
    });
    return context;
  }
}

function deriveQuarter(date: Date): string {
  const y = date.getFullYear();
  const q = Math.floor(date.getMonth() / 3) + 1;
  return `${y}-Q${q}`;
}
