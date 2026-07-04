/**
 * Kimi WebBridge 数据适配器
 * 默认数据源，通过 Kimi WebBridge skill 实时获取市场数据
 *
 * 数据来源：
 * - 链家/贝壳：可比交易案例
 * - 安居客/58同城：租金数据、市场指数
 * - 地方政府：基准地价、房价指数
 */

import { DataSourceAdapter, ComparableQuery, RentalQuery } from './adapter-interface';
import {
  ComparableInstance,
  RentalData,
  MarketIndex,
  BenchmarkPrice,
  CostData,
} from '../types';

export class KimiBridgeAdapter implements DataSourceAdapter {
  /**
   * 数据缓存 TTL（毫秒），默认 24 小时
   */
  private cacheTTL: number;
  private cache: Map<string, { data: unknown; timestamp: number }> = new Map();

  constructor(cacheTTLMs?: number) {
    this.cacheTTL = cacheTTLMs ?? 86_400_000; // 24 hours
  }

  /**
   * 通过 Kimi WebBridge skill 获取数据
   * 在 Claude Code 环境中，通过 Skill tool 调用 kimi-webbridge skill
   * 此处为接口占位实现，实际运行时由 agent 调用 WebBridge
   */
  private async fetchViaWebBridge(query: string): Promise<string> {
    // 实际实现：在 Claude Code 中通过 Skill 工具调用
    // 这里返回 Promise 占位，实际由 agent 在运行时填充
    throw new Error(
      'Kimi WebBridge not available in non-agent runtime. ' +
      'Set up the WebBridge integration or switch to mock adapter.'
    );
  }

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  private setCache(key: string, data: unknown): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  async fetchComparables(query: ComparableQuery): Promise<ComparableInstance[]> {
    const cacheKey = `comparables:${JSON.stringify(query)}`;
    const cached = this.getCached<ComparableInstance[]>(cacheKey);
    if (cached) return cached;

    // 通过 Kimi WebBridge 从链家/贝壳等平台获取
    // 首期实现返回空数组 + warning，后续迭代接入真实数据
    const rawData = await this.fetchViaWebBridge(
      `fetch real estate transaction comparables in ${query.location}, ` +
      `property type: ${query.propertyType}, subtype: ${query.subType}, ` +
      `date range: ${query.dateRange?.start.toISOString()} to ${query.dateRange?.end.toISOString()}`
    );

    // 解析 WebBridge 返回的原始数据 -> ComparableInstance[]
    const instances = this.parseComparables(rawData, query);
    this.setCache(cacheKey, instances);
    return instances;
  }

  async fetchRentalData(query: RentalQuery): Promise<RentalData[]> {
    const cacheKey = `rental:${JSON.stringify(query)}`;
    const cached = this.getCached<RentalData[]>(cacheKey);
    if (cached) return cached;

    const rawData = await this.fetchViaWebBridge(
      `fetch rental data in ${query.location}, property type: ${query.propertyType}`
    );

    const data = this.parseRentalData(rawData);
    this.setCache(cacheKey, data);
    return data;
  }

  async fetchMarketIndex(location: string, period: string): Promise<MarketIndex> {
    const cacheKey = `marketIndex:${location}:${period}`;
    const cached = this.getCached<MarketIndex>(cacheKey);
    if (cached) return cached;

    const rawData = await this.fetchViaWebBridge(
      `fetch market price index for ${location}, period: ${period}`
    );

    const index = this.parseMarketIndex(rawData, location, period);
    this.setCache(cacheKey, index);
    return index;
  }

  async fetchBenchmarkLandPrice(zone: string, landUseType: string): Promise<BenchmarkPrice> {
    const cacheKey = `benchmarkLand:${zone}:${landUseType}`;
    const cached = this.getCached<BenchmarkPrice>(cacheKey);
    if (cached) return cached;

    const rawData = await this.fetchViaWebBridge(
      `fetch benchmark land price for ${zone}, land use: ${landUseType}`
    );

    const price = this.parseBenchmarkPrice(rawData, zone, landUseType);
    this.setCache(cacheKey, price);
    return price;
  }

  async fetchCostData(region: string, buildingType: string): Promise<CostData> {
    const cacheKey = `costData:${region}:${buildingType}`;
    const cached = this.getCached<CostData>(cacheKey);
    if (cached) return cached;

    const rawData = await this.fetchViaWebBridge(
      `fetch construction cost data for ${region}, building type: ${buildingType}`
    );

    const cost = this.parseCostData(rawData, region, buildingType);
    this.setCache(cacheKey, cost);
    return cost;
  }

  // --- 解析方法（从 WebBridge 返回的原始数据到结构化数据） ---

  private parseComparables(raw: string, _query: ComparableQuery): ComparableInstance[] {
    // 解析 WebBridge 返回的交易数据
    // 首期返回空数组，等待真实数据接入
    return [];
  }

  private parseRentalData(raw: string): RentalData[] {
    return [];
  }

  private parseMarketIndex(raw: string, location: string, period: string): MarketIndex {
    return {
      location,
      period,
      monthOverMonthChange: 0,
      yearOverYearChange: 0,
      source: 'kimi-webbridge',
    };
  }

  private parseBenchmarkPrice(raw: string, zone: string, landUseType: string): BenchmarkPrice {
    return {
      zone,
      landUseType,
      unitPrice: 0,
      baseDate: new Date(),
      adjustmentFactors: {},
    };
  }

  private parseCostData(raw: string, _region: string, _buildingType: string): CostData {
    return {
      constructionCostPerM2: 0,
      managementFeeRate: 0,
      salesFeeRate: 0,
      interestRate: 0,
      profitMargin: 0,
    };
  }
}
