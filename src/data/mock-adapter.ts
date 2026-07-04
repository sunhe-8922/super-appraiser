/**
 * Mock 数据适配器
 * 用于本地调试和无网络环境
 * 接口与 Kimi WebBridge 适配器完全一致
 */

import { DataSourceAdapter, ComparableQuery, RentalQuery } from './adapter-interface';
import {
  ComparableInstance,
  RentalData,
  MarketIndex,
  BenchmarkPrice,
  CostData,
} from '../types';

export class MockAdapter implements DataSourceAdapter {
  private seed: string;

  constructor(seed: string = 'cn-beijing-2026') {
    this.seed = seed;
  }

  async fetchComparables(query: ComparableQuery): Promise<ComparableInstance[]> {
    // 返回预设的 mock 可比实例数据
    // 首期包含北京朝阳区住宅/商业示例数据
    const baseDate = new Date();
    const oneYearAgo = new Date(baseDate);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    return [
      {
        id: 'comp-mock-001',
        location: `${query.location || '北京市朝阳区'}`,
        propertyType: query.propertyType,
        subType: query.subType,
        area: 89.5,
        unitPrice: 68000,
        totalPrice: 6086000,
        transactionDate: new Date('2025-06-15'),
        transactionType: 'sale',
        priceNormalcy: 'normal',
        physicalScore: { structure: 90, age: 85, decoration: 80 },
        locationScore: { transport: 88, amenities: 92, environment: 85 },
        rightsScore: { tenure: 95, restrictions: 100 },
      },
      {
        id: 'comp-mock-002',
        location: `${query.location || '北京市朝阳区'}`,
        propertyType: query.propertyType,
        subType: query.subType,
        area: 95.2,
        unitPrice: 66500,
        totalPrice: 6330800,
        transactionDate: new Date('2025-08-20'),
        transactionType: 'sale',
        priceNormalcy: 'normal',
        physicalScore: { structure: 88, age: 82, decoration: 78 },
        locationScore: { transport: 90, amenities: 88, environment: 87 },
        rightsScore: { tenure: 95, restrictions: 100 },
      },
      {
        id: 'comp-mock-003',
        location: `${query.location || '北京市朝阳区'}`,
        propertyType: query.propertyType,
        subType: query.subType,
        area: 82.0,
        unitPrice: 70000,
        totalPrice: 5740000,
        transactionDate: new Date('2025-03-10'),
        transactionType: 'sale',
        priceNormalcy: 'normal',
        physicalScore: { structure: 92, age: 88, decoration: 85 },
        locationScore: { transport: 85, amenities: 90, environment: 82 },
        rightsScore: { tenure: 95, restrictions: 100 },
      },
    ];
  }

  async fetchRentalData(_query: RentalQuery): Promise<RentalData[]> {
    return [
      {
        address: '北京市朝阳区示例小区',
        rentPerMonth: 8500,
        area: 89.5,
        unitRent: 3.1,
        vacancyRate: 0.05,
        leaseTerm: 24,
        contractRentVsMarket: 'equal',
      },
      {
        address: '北京市朝阳区邻近小区',
        rentPerMonth: 7800,
        area: 78.0,
        unitRent: 3.33,
        vacancyRate: 0.03,
        leaseTerm: 36,
        contractRentVsMarket: 'below',
      },
    ];
  }

  async fetchMarketIndex(location: string, period: string): Promise<MarketIndex> {
    return {
      location,
      period,
      monthOverMonthChange: 0.3,
      yearOverYearChange: 2.1,
      source: 'mock-national-bureau',
    };
  }

  async fetchBenchmarkLandPrice(zone: string, landUseType: string): Promise<BenchmarkPrice> {
    return {
      zone,
      landUseType,
      unitPrice: 12000,
      baseDate: new Date('2024-01-01'),
      adjustmentFactors: {
        distanceToCenter: 1.05,
        transportAccess: 1.08,
        commercialFacilities: 1.02,
      },
    };
  }

  async fetchCostData(_region: string, _buildingType: string): Promise<CostData> {
    return {
      constructionCostPerM2: 3500,
      managementFeeRate: 0.02,
      salesFeeRate: 0.03,
      interestRate: 0.045,
      profitMargin: 0.08,
    };
  }
}
