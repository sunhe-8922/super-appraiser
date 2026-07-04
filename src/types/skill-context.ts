/**
 * Skill 间传递的上下文类型链
 * 贯穿估价程序 3.0.1 的 11 个步骤
 */

import { EstimationDemand } from './demand-type';
import { EstimationObject } from './estimation-object';
import { ReportConfig, ReportStyle } from './report-format';

/**
 * 阶段 1-2 产出：需求澄清结果
 */
export interface DemandClarityResult {
  demand: EstimationDemand;
  estObject: EstimationObject;
}

/**
 * 阶段 2 产出：估价作业方案（3.0.4条）
 */
export interface EstimationPlan {
  methods: EstimatedMethod[];
  dataRequirements: DataRequirement[];
  timeline: { start: Date; end: Date };
  /** 估价技术路线（3.0.4条第1款） */
  technicalRoute: string;
}

export interface DataRequirement {
  category: 'location' | 'physical' | 'rights' | 'transaction' | 'income' | 'cost';
  description: string;
  source: string;
}

/**
 * 阶段 3 产出：搜集的估价资料（3.0.5条）
 */
export interface CollectedData {
  comparables: ComparableInstance[];    // 可比实例（4.2.2条）
  rentalData: RentalData[];             // 租金数据
  marketIndex: MarketIndex;             // 价格指数
  benchmarkLand?: BenchmarkPrice;       // 基准地价
  costData?: CostData;                  // 成本数据
}

export interface ComparableInstance {
  id: string;
  location: string;
  propertyType: string;
  subType: string;
  area: number;
  unitPrice: number;
  totalPrice: number;
  transactionDate: Date;
  transactionType: string;
  /** 价格是否为正常价格（4.2.3条第5款） */
  priceNormalcy: 'normal' | 'abnormal';
  /** 特殊交易情况标记（4.2.4条） */
  specialCircumstances?: string[];
  /** 实物状况打分 */
  physicalScore: Record<string, number>;
  /** 区位状况打分 */
  locationScore: Record<string, number>;
  /** 权益状况打分 */
  rightsScore: Record<string, number>;
}

export interface RentalData {
  address: string;
  rentPerMonth: number;
  area: number;
  unitRent: number;  // 元/m²/天
  vacancyRate: number;
  leaseTerm: number;
  contractRentVsMarket?: 'above' | 'below' | 'equal';
}

export interface MarketIndex {
  location: string;
  period: string;
  /** 环比变化率 % */
  monthOverMonthChange: number;
  /** 同比变化率 % */
  yearOverYearChange: number;
  source: string;
}

export interface BenchmarkPrice {
  zone: string;
  landUseType: string;
  unitPrice: number;
  baseDate: Date;
  adjustmentFactors: Record<string, number>;
}

export interface CostData {
  constructionCostPerM2: number;
  managementFeeRate: number;
  salesFeeRate: number;
  interestRate: number;
  profitMargin: number;
}

/**
 * 阶段 4 产出：实地查勘记录（3.0.7条）
 */
export interface SiteInspectionRecord {
  locationCondition: string;
  physicalCondition: string;
  rightsCondition: string;
  photos: string[];
  inspectionDate: Date;
  inspector: string;
  /** 异常项（3.0.7条第3款） */
  issues?: string[];
}

/**
 * 估价方法（4.1.1条）
 */
export type EstimatedMethod = 'comparable' | 'income' | 'cost' | 'hypothetical';

/**
 * 比较法测算结果（4.2）
 */
export interface ComparableResult {
  method: 'comparable';
  /** 各可比实例修正后价格 */
  adjustedValues: number[];
  /** 比较价值 */
  finalValue: number;
  /** 权重（4.2.16条） */
  weight?: number[];
  /** 详细修正过程 */
  details: ComparableDetail[];
}

export interface ComparableDetail {
  instanceId: string;
  originalPrice: number;
  /** 交易情况修正系数 */
  situationAdjustment: number;
  /** 市场状况调整系数 */
  marketAdjustment: number;
  /** 区位状况调整系数 */
  locationAdjustment: number;
  /** 实物状况调整系数 */
  physicalAdjustment: number;
  /** 权益状况调整系数 */
  rightsAdjustment: number;
  adjustedPrice: number;
}

/**
 * 收益法测算结果（4.3）
 */
export interface IncomeResult {
  method: 'income';
  grossIncome: number;
  operatingExpenses: number;
  netOperatingIncome: number;
  capitalizationRate: number;
  /** 收益价值 */
  finalValue: number;
  /** 估价模型（4.3.2条） */
  model: 'fullLife' | 'holdAndResell' | 'directCap';
  /** 收益期（年）（4.3.6条） */
  incomePeriod: number;
  details: IncomeDetail[];
}

export interface IncomeDetail {
  year: number;
  effectiveGrossIncome: number;
  operatingExpense: number;
  netOperatingIncome: number;
}

/**
 * 成本法测算结果（4.4）
 */
export interface CostResult {
  method: 'cost';
  /** 土地重置成本 */
  landReplacementCost: number;
  /** 建筑物重置成本 */
  buildingReplacementCost: number;
  /** 建筑物折旧（4.4.7条） */
  buildingDepreciation: number;
  /** 物质折旧 */
  physicalDepreciation: number;
  /** 功能折旧 */
  functionalDepreciation: number;
  /** 外部折旧 */
  externalDepreciation: number;
  /** 成本价值 */
  finalValue: number;
  /** 估价路径（4.4.2条） */
  path: 'combined' | 'separate';
  details: CostDetail[];
}

export interface CostDetail {
  item: string;
  amount: number;
  description: string;
}

/**
 * 各方法测算结果的联合类型
 */
export type CalculationResults = ComparableResult | IncomeResult | CostResult;

/**
 * 阶段 9 产出：最终估价结果（6.0条）
 */
export interface FinalEstimationResult {
  /** 各方法测算结果 */
  methodResults: CalculationResults[];
  /** 综合方法（6.0.5条） */
  combinationMethod: 'simpleAverage' | 'weightedAverage';
  /** 权重（加权时用） */
  weights?: number[];
  /** 综合测算结果 */
  comprehensiveResult: number;
  /** 最终评估价值（6.0.6条） */
  finalValue: number;
  /** 调整理由（6.0.6条第1款） */
  adjustmentReason?: string;
}

/**
 * 阶段 10 产出：估价报告（7.0条）
 */
export interface EstimationReport {
  style: ReportStyle;
  content: string;
  config: ReportConfig;
}

/**
 * 贯穿所有阶段的完整上下文
 */
export interface EstimationContext {
  demand: EstimationDemand;
  estObject: EstimationObject;
  plan?: EstimationPlan;
  collectedData?: CollectedData;
  inspectionRecord?: SiteInspectionRecord;
  calculationResults?: CalculationResults[];
  finalResult?: FinalEstimationResult;
  report?: EstimationReport;
}
