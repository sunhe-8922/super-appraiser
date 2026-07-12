/**
 * Super-Appraiser 入口
 * 房地产估价插件系统 - 基于 GB/T 50291-2015
 */

export { EstimationPipeline } from './scheduler/pipeline';
export type {
  PipelineConfig,
  PipelineInput,
  PipelineRunResult,
} from './scheduler/pipeline';
export { EstimationStateMachine } from './scheduler/state-machine';
export type { EstimationStage, StateTransition } from './scheduler/state-machine';
export { ReportEngine } from './report/engine';
export { BaseSkill, MethodSelectionSkill, ComparableSkill, IncomeSkill, CostSkill } from './skills';

// Meta-Control Loop + structured logging
export {
  StructuredLogger,
  type AgentEvent,
  type AgentEventType,
  type DecisionPayload,
  type FailurePayload,
} from './observability';
export {
  MetaController,
  PlateauDetector,
  PromptRewriter,
  VersionStore,
  SkillRegistry,
  ArtifactPromoter,
  evaluateSandbox,
  findRepoRoot,
  type MetaDiagnosis,
  type MetaCycleResult,
  type PromoteRecord,
} from './meta';

// Parallel web research methodology
export {
  SOURCE_PRIORITY,
  SUBAGENT_NETWORK_GUIDE,
  buildResearchPlan,
  buildLaneAgentPrompt,
  assessSufficiency,
  keywordTemplates,
  type ResearchPlan,
  type ResearchBundle,
  type ResearchFinding,
  type ResearchLane,
} from './research';

export type {
  EstimationContext,
  EstimationDemand,
  EstimationPlan,
  EstimationPurpose,
  EstimationReport,
} from './types';

export type {
  PropertyType,
  ResidentialSubType,
  CommercialSubType,
  EstimationObject,
  MortgageInfo,
  LeaseInfo,
} from './types';

export type {
  ValueType,
  ValueDatePoint,
} from './types';

export type {
  ReportStyle,
  OutputFormat,
  ReportConfig,
} from './types';

export type {
  ComparableResult,
  IncomeResult,
  CostResult,
  CalculationResults,
  FinalEstimationResult,
  ComparableDetail,
  IncomeDetail,
  CostDetail,
  ComparableInstance,
  RentalData,
  MarketIndex,
  BenchmarkPrice,
  CostData,
  SiteInspectionRecord,
  CollectedData,
  DataRequirement,
} from './types';

export type {
  EstimatedMethod,
  DemandClarityResult,
} from './types';

export {
  KimiBridgeAdapter,
  MockAdapter,
  type DataSourceAdapter,
} from './data';

// Re-export all types from a single entry
export * from './types';
