/**
 * Kimi WebBridge 数据适配器
 * 默认数据源，通过 Kimi WebBridge skill 实时获取市场数据
 *
 * 数据来源：
 * - 链家/贝壳：可比交易案例
 * - 安居客/58同城：租金数据、市场指数
 * - 地方政府：基准地价、房价指数
 */

import { execFile } from 'node:child_process';
import * as path from 'node:path';
import * as os from 'node:os';
import { promisify } from 'node:util';
import { DataSourceAdapter, ComparableQuery, RentalQuery } from './adapter-interface';
import {
  ComparableInstance,
  RentalData,
  MarketIndex,
  BenchmarkPrice,
  CostData,
} from '../types';

const execFileAsync = promisify(execFile);

const DEFAULT_BRIDGE_PATH = path.join(
  os.homedir(),
  '.kimi-webbridge',
  'bin',
  'kimi-webbridge',
);

/** 暴露给 CLI 的探测函数：当前环境下是否能找到 webbridge 二进制。 */
export function isKimiBridgeAvailable(bridgePath?: string): boolean {
  const fs = require('node:fs');
  const candidates = [bridgePath ?? DEFAULT_BRIDGE_PATH];
  if (process.platform === 'win32') candidates.push(candidates[0] + '.exe');
  return candidates.some((p) => fs.existsSync(p));
}

export class KimiBridgeAdapter implements DataSourceAdapter {
  /**
   * 数据缓存 TTL（毫秒），默认 24 小时
   */
  private cacheTTL: number;
  private cache: Map<string, { data: unknown; timestamp: number }> = new Map();
  private bridgePath: string;

  constructor(cacheTTLMs?: number, bridgePath?: string) {
    this.cacheTTL = cacheTTLMs ?? 86_400_000; // 24 hours
    this.bridgePath = bridgePath ?? DEFAULT_BRIDGE_PATH;
  }

  /**
   * 通过 Kimi WebBridge skill 获取数据
   * 在 CI 环境或无 bridge 时抛错；CLI 调用方应回退到 MockAdapter
   */
  private async fetchViaWebBridge(query: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync(this.bridgePath, ['fetch', query], {
        timeout: 30_000,
        maxBuffer: 10 * 1024 * 1024,
      });
      return stdout.trim();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Kimi WebBridge fetch failed (bridgePath=${this.bridgePath}): ${message}. ` +
        'Set up the WebBridge integration or switch to mock adapter.',
      );
    }
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

  /**
   * 通用 fetch 包装：检查缓存 → 调 bridge → 解析 → 写入缓存 → 返回。
   * 5 个 fetch 方法共用此模式。
   */
  private async cached<T>(
    cacheKey: string,
    query: string,
    parse: (raw: string) => T,
  ): Promise<T> {
    const cached = this.getCached<T>(cacheKey);
    if (cached) return cached;
    const raw = await this.fetchViaWebBridge(query);
    const result = parse(raw);
    this.setCache(cacheKey, result);
    return result;
  }

  fetchComparables(query: ComparableQuery): Promise<ComparableInstance[]> {
    return this.cached(
      `comparables:${JSON.stringify(query)}`,
      `fetch real estate transaction comparables in ${query.location}, ` +
      `property type: ${query.propertyType}, subtype: ${query.subType}`,
      (raw) => this.parseComparables(raw, query),
    );
  }

  fetchRentalData(query: RentalQuery): Promise<RentalData[]> {
    return this.cached(
      `rental:${JSON.stringify(query)}`,
      `fetch rental data in ${query.location}, property type: ${query.propertyType}`,
      (raw) => this.parseRentalData(raw),
    );
  }

  fetchMarketIndex(location: string, period: string): Promise<MarketIndex> {
    return this.cached(
      `marketIndex:${location}:${period}`,
      `fetch market price index for ${location}, period: ${period}`,
      (raw) => this.parseMarketIndex(raw, location, period),
    );
  }

  fetchBenchmarkLandPrice(zone: string, landUseType: string): Promise<BenchmarkPrice> {
    return this.cached(
      `benchmarkLand:${zone}:${landUseType}`,
      `fetch benchmark land price for ${zone}, land use: ${landUseType}`,
      (raw) => this.parseBenchmarkPrice(raw, zone, landUseType),
    );
  }

  fetchCostData(region: string, buildingType: string): Promise<CostData> {
    return this.cached(
      `costData:${region}:${buildingType}`,
      `fetch construction cost data for ${region}, building type: ${buildingType}`,
      (raw) => this.parseCostData(raw, region, buildingType),
    );
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
