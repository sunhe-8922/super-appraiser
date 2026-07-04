/**
 * 估价需求类型定义
 * 对应 GB/T 50291-2015 第3.0.3条
 */

/**
 * 估价目的（对应第5章 5.1~5.15）
 */
export type EstimationPurpose =
  | 'mortgage'           // 5.1 房地产抵押估价
  | 'tax'                // 5.2 房地产税收估价
  | 'expropriation'      // 5.3 房地产征收、征用估价
  | 'auction'            // 5.4 房地产拍卖、变卖估价
  | 'transfer'           // 5.8 房地产转让估价
  | 'lease'              // 5.9 房地产租赁估价
  | 'damage'             // 5.6 房地产损害赔偿估价
  | 'insurance'          // 5.7 房地产保险估价
  | 'fund'               // 5.11 房地产投资基金物业估价
  | 'financial-report'   // 5.12 为财务报告服务的房地产估价
  | 'corporate-activity' // 5.13 企业各种经济活动涉及的房地产估价
  | 'dispute'            // 5.14 房地产纠纷估价
  | 'other';             // 5.15 其他目的

/**
 * 价值类型（对应 2.0.1~2.0.3）
 */
export type ValueType =
  | 'marketValue'        // 市场价值（2.0.1）
  | 'mortgageValue'      // 抵押价值（2.0.2）
  | 'mortgageNetValue'   // 抵押净值（2.0.2）
  | 'investmentValue'    // 投资价值（2.0.3）
  | 'currentValue'       // 现状价值（2.0.3）
  | 'liquidationValue'   // 清算价值
  | 'rentalValue'        // 租金价值
  | 'other';

/**
 * 价值时点（3.0.3条第2款）
 */
export interface ValueDatePoint {
  /** 宜具体到日（3.0.3条第2款） */
  date: Date;
  /** 回顾性/现状/预测性 */
  type: 'present' | 'past' | 'future';
}

/**
 * 估价委托基本信息
 */
export interface EstimationDemand {
  purpose: EstimationPurpose;
  valueType: ValueType;
  valueDatePoint: ValueDatePoint;
  client: {
    name: string;
    type: 'individual' | 'organization';
  };
}
