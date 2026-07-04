/**
 * 估价对象类型定义
 * 对应 GB/T 50291-2015 第3.0.3条第3款
 */

export type PropertyType = 'residential' | 'commercial';

export type ResidentialSubType = 'apartment' | 'villa' | 'condo';

export type CommercialSubType = 'shop' | 'office' | 'retail';

export interface EstimationObject {
  propertyType: PropertyType;
  subType: ResidentialSubType | CommercialSubType;
  location: {
    city: string;
    district: string;
    street: string;
    community?: string;       // 住宅用
    floor?: string;           // 楼幢/楼层（4.2.10条）
    orientation?: string;     // 朝向（4.2.10条）
    shopLevel?: string;       // 商业用：商铺楼层/铺位
  };
  area: {
    constructionArea: number;  // 建筑面积 m²
    interiorArea?: number;     // 套内面积
    landArea?: number;         // 土地面积
  };
  physical: {
    structure: string;         // 钢结构/钢筋混凝土/砖混/砖木
    yearBuilt: number;
    condition: string;         // 完好/基本完好/一般/差/危险
    decoration: string;        // 装修情况
    facilities: string[];      // 设施设备
  };
  rights: {
    landUseType: string;       // 住宅/商业/综合
    landUseTermEnd: Date;      // 土地使用期限截止
    ownership: string;         // 所有权类型
    mortgage?: MortgageInfo;   // 抵押信息
    lease?: LeaseInfo;         // 租赁信息
    restrictions: string[];    // 权利限制
  };
}

export interface MortgageInfo {
  lender: string;
  amount: number;
  termEnd: Date;
}

export interface LeaseInfo {
  tenant: string;
  rentPerMonth: number;
  termStart: Date;
  termEnd: Date;
  /**
   * 合同租金与市场租金比较
   * 对应 4.3.10 条
   */
  contractRentVsMarket: 'above' | 'below' | 'equal';
}
