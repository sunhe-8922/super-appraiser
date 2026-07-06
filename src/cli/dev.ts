#!/usr/bin/env ts-node
/**
 * Super-Appraiser CLI 入口
 * 交互式估价演示：接收输入参数，运行完整估价流程，输出报告
 *
 * 用法:
 *   npm run dev                         # 交互模式
 *   npm run dev -- --purpose mortgage   # 命令行参数模式
 *   npm run dev -- --demo               # 快速演示（使用 fixture 数据）
 */

import { EstimationPipeline } from '../scheduler/pipeline';
import { MockAdapter, KimiBridgeAdapter, isKimiBridgeAvailable } from '../data';
import type { DataSourceAdapter } from '../data';
import type { PipelineInput } from '../scheduler/pipeline';

import type { EstimationObject } from '../types';

// --- PipelineInput 构造助手 ---

interface DemandOverrides {
  purpose?: PipelineInput['demand']['purpose'];
  valueType?: PipelineInput['demand']['valueType'];
  clientName?: string;
}

interface EstObjectOverrides {
  city?: string;
  district?: string;
  street?: string;
  community?: string;
  constructionArea?: number;
  interiorArea?: number;
  floor?: string;
  orientation?: string;
  structure?: string;
  yearBuilt?: number;
  facilities?: string[];
  mortgageAmount?: number;
}

/**
 * 构造 PipelineInput，共享各入口的默认字段，避免三处重复。
 * - demand 默认：抵押估值、客户为某组织
 * - estObject 默认：2015 年钢筋混凝土住宅、按揭信息由 demo 传入
 */
export function buildPipelineInput(
  demand: DemandOverrides = {},
  obj: EstObjectOverrides = {},
): PipelineInput {
  const yearBuilt = obj.yearBuilt ?? 2015;
  const purpose: PipelineInput['demand']['purpose'] = demand.purpose ?? 'mortgage';
  const valueType: PipelineInput['demand']['valueType'] = demand.valueType ?? 'mortgageValue';

  const rights: EstimationObject['rights'] = {
    landUseType: '住宅',
    landUseTermEnd: new Date(yearBuilt + 70, 0, 1),
    ownership: '商品房',
    restrictions: [],
  };
  if (obj.mortgageAmount !== undefined) {
    rights.mortgage = {
      lender: demand.clientName ?? '银行',
      amount: obj.mortgageAmount,
      termEnd: new Date(yearBuilt + 30, 5, 1),
    };
  }

  const location: EstimationObject['location'] = {
    city: obj.city ?? '北京',
    district: obj.district ?? '朝阳区',
    street: obj.street ?? '建国路',
    community: obj.community ?? '某某花园',
  };
  if (obj.floor) location.floor = obj.floor;
  if (obj.orientation) location.orientation = obj.orientation;

  const area: EstimationObject['area'] = {
    constructionArea: obj.constructionArea ?? 89.5,
  };
  if (obj.interiorArea !== undefined) area.interiorArea = obj.interiorArea;

  const physical: EstimationObject['physical'] = {
    structure: obj.structure ?? '钢筋混凝土',
    yearBuilt,
    condition: '基本完好',
    decoration: '精装修',
    facilities: obj.facilities ?? ['电梯', '暖气', '宽带'],
  };

  return {
    demand: {
      purpose,
      valueType,
      valueDatePoint: { date: new Date(), type: 'present' },
      client: {
        name: demand.clientName ?? '估价委托人',
        type: 'organization',
      },
    },
    estObject: {
      propertyType: 'residential',
      subType: 'apartment',
      location,
      area,
      physical,
      rights,
    },
  };
}

// --- CLI 参数解析 ---

interface CliArgs {
  wantHelp: boolean;
  demo: boolean;
  purpose?: string;
  valueType?: string;
  city: string;
  district: string;
  area: number;
}

function parseArgs(): CliArgs {
  const raw = process.argv.slice(2);
  const wantHelp = raw.includes('--help') || raw.includes('-h');
  const args: CliArgs = {
    wantHelp,
    demo: raw.includes('--demo'),
    city: '北京',
    district: '朝阳区',
    area: 89.5,
  };

  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i];
    if (arg === '--purpose' && raw[i + 1]) { args.purpose = raw[++i]; }
    else if (arg === '--value-type' && raw[i + 1]) { args.valueType = raw[++i]; }
    else if (arg === '--city' && raw[i + 1]) { args.city = raw[++i]; }
    else if (arg === '--district' && raw[i + 1]) { args.district = raw[++i]; }
    else if (arg === '--area' && raw[i + 1]) { args.area = parseFloat(raw[++i]); }
  }

  return args;
}

// "any param" 即与默认值不同 — 决定 demo 后走参数模式还是交互模式
function hasAnyParam(args: CliArgs): boolean {
  return Boolean(args.purpose) || Boolean(args.valueType) ||
    args.city !== '北京' || args.district !== '朝阳区' || args.area !== 89.5;
}

function printHelp(): void {
  console.log(`
Super-Appraiser CLI — 房地产估价引擎

用法:
  npm run dev                     交互模式
  npm run dev -- --demo           快速演示
  npm run dev -- --help           显示帮助

选项:
  --purpose <type>          估价目的 (mortgage/tax/expropriation/...)
  --value-type <type>       价值类型 (marketValue/mortgageValue/...)
  --city <name>             城市 (默认: 北京)
  --district <name>         区域 (默认: 朝阳区)
  --area <number>           建筑面积 m² (默认: 89.5)
  --demo                    快速演示模式，使用内置 fixture 数据
  --help, -h                显示此帮助
`);
}

// --- 交互模式 ---

async function runInteractive(): Promise<PipelineInput> {
  const readline = await import('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const ask = (q: string): Promise<string> =>
    new Promise((resolve) => rl.question(q, resolve));

  console.log('\n=== Super-Appraiser 房地产估价引擎 ===\n');

  const purpose = (await ask('估价目的 [mortgage]:') || 'mortgage') as PipelineInput['demand']['purpose'];
  const valueType = (await ask('价值类型 [marketValue]:') || 'marketValue') as PipelineInput['demand']['valueType'];
  const city = await ask('城市 [北京]:') || '北京';
  const district = await ask('区域 [朝阳区]:') || '朝阳区';
  const street = await ask('街道 [建国路]:') || '建国路';
  const community = await ask('小区 [某某花园]:') || '某某花园';
  const constructionArea = parseFloat(await ask('建筑面积 m² [89.5]:') || '89.5') || 89.5;
  const structure = await ask('建筑结构 [钢筋混凝土]:') || '钢筋混凝土';
  const yearBuilt = parseInt(await ask('建成年代 [2015]:') || '2015', 10) || 2015;

  rl.close();

  return buildPipelineInput(
    { purpose, valueType },
    { city, district, street, community, constructionArea, structure, yearBuilt },
  );
}

// --- Demo 模式 ---

function runDemo(): PipelineInput {
  return buildPipelineInput(
    { purpose: 'mortgage', valueType: 'mortgageValue', clientName: '中国工商银行北京分行' },
    {
      city: '北京',
      district: '朝阳区',
      street: '建国路',
      community: '某某花园',
      constructionArea: 89.5,
      interiorArea: 72.3,
      floor: '12/26',
      orientation: '南向',
      structure: '钢筋混凝土',
      yearBuilt: 2015,
      facilities: ['电梯', '暖气', '宽带', '中央空调'],
      mortgageAmount: 3_500_000,
    },
  );
}

// --- Adapter 选择 ---

/**
 * 选择数据源
 * - SUPER_APPRAISER_DATA=kimi 强制 KimiBridgeAdapter（失败由调用方处理）
 * - SUPER_APPRAISER_DATA=mock 强制 MockAdapter（演示/无网络模式）
 * - 默认：探测 Kimi Bridge 是否可用，可用则用 Kimi，否则回退到 Mock
 */
function selectDataSource(): DataSourceAdapter {
  const explicit = process.env.SUPER_APPRAISER_DATA?.toLowerCase();

  if (explicit === 'kimi') {
    console.log('🌐 使用 KimiBridgeAdapter（用户显式指定）');
    return new KimiBridgeAdapter();
  }

  if (explicit === 'mock' || !isKimiBridgeAvailable()) {
    if (explicit === 'mock') {
      console.log('📦 使用 MockAdapter（用户显式指定）');
    } else {
      console.log('📦 未检测到 Kimi WebBridge，回退到 MockAdapter');
    }
    return new MockAdapter('cn-beijing-2026');
  }

  console.log('🌐 检测到 Kimi WebBridge，使用 KimiBridgeAdapter');
  return new KimiBridgeAdapter();
}

// --- Main ---

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.wantHelp) {
    printHelp();
    return;
  }

  let input: PipelineInput;
  let forceMock = false;

  if (args.demo) {
    console.log('\n📋 使用 Demo 数据...\n');
    input = runDemo();
    // Demo 默认 mock，避免污染数据源连接
    forceMock = true;
  } else if (hasAnyParam(args)) {
    // 有自定义参数：直接构造，不进入交互
    input = buildPipelineInput(
      {
        purpose: (args.purpose as PipelineInput['demand']['purpose']) || 'mortgage',
        valueType: (args.valueType as PipelineInput['demand']['valueType']) || 'marketValue',
      },
      {
        city: args.city,
        district: args.district,
        constructionArea: args.area,
      },
    );
  } else {
    input = await runInteractive();
  }

  // 选数据源（Demo 强制 Mock）
  console.log('🚀 启动估价流程...\n');
  const dataSource = forceMock
    ? (() => { console.log('📦 使用 MockAdapter（演示模式）'); return new MockAdapter('cn-beijing-2026'); })()
    : selectDataSource();

  const pipeline = new EstimationPipeline({
    dataSource,
    parallelCalculation: true,
  });

  const report = await pipeline.run(input);

  // 输出报告
  console.log('═══════════════════════════════════════');
  console.log('           估 价 报 告');
  console.log('═══════════════════════════════════════\n');
  console.log(report.content);
  console.log('\n═══════════════════════════════════════');
  console.log('报告生成完毕');
}

main().catch((err) => {
  console.error('❌ 估价流程失败:', err.message);
  process.exit(1);
});
