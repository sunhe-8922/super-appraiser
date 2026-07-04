/**
 * 数据源统一接口
 * 适配 Kimi WebBridge（默认）和 Mock（备用）数据源
 */

import {
  ComparableInstance,
  RentalData,
  MarketIndex,
  BenchmarkPrice,
  CostData,
} from '../types';

/**
 * 可比实例查询条件
 */
export interface ComparableQuery {
  /** 城市/区域 */
  location: string;
  /** 物业类型 */
  propertyType: 'residential' | 'commercial';
  /** 子类类型 */
  subType: string;
  /** 成交日期范围，默认近2年（4.2.3条：与价值时点相差不宜超过1年，最长不超过2年） */
  dateRange?: { start: Date; end: Date };
  /** 面积范围 */
  areaRange?: { min: number; max: number };
}

/**
 * 租金数据查询条件
 */
export interface RentalQuery {
  location: string;
  propertyType: 'residential' | 'commercial';
  subType: string;
}

/**
 * 数据源统一接口（4.2.2条、4.3.8条等）
 */
export interface DataSourceAdapter {
  /**
   * 获取可比交易实例
   * 对应 4.2.2 条：交易实例信息应满足比较法运用需要
   */
  fetchComparables(query: ComparableQuery): Promise<ComparableInstance[]>;

  /**
   * 获取租金数据
   * 对应 4.3.8 条：优先通过租赁收入测算净收益
   */
  fetchRentalData(query: RentalQuery): Promise<RentalData[]>;

  /**
   * 获取市场价格指数
   * 对应 4.2.8 条：采用同类房地产的价格变动率或价格指数进行调整
   */
  fetchMarketIndex(location: string, period: string): Promise<MarketIndex>;

  /**
   * 获取基准地价
   * 对应 4.6.2 条：查找估价对象宗地所在位置的基准地价
   */
  fetchBenchmarkLandPrice(zone: string, landUseType: string): Promise<BenchmarkPrice>;

  /**
   * 获取建筑物重置价格/成本数据
   * 对应 4.4.5 条：利用政府公布的房屋重置价格
   */
  fetchCostData(region: string, buildingType: string): Promise<CostData>;
}
