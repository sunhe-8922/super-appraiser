# Super-Appraiser — 房地产估价引擎

[![GitHub](https://img.shields.io/badge/github-sunhe--8922%2Fsuper--appraiser-8da0cb?style=flat&logo=github)](https://github.com/sunhe-8922/super-appraiser)
[![npm version](https://img.shields.io/npm/v/super-appraiser?style=flat)](https://www.npmjs.com/package/super-appraiser)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat)](LICENSE)
[![CI](https://img.shields.io/badge/CI-passing-brightgreen?style=flat)](https://github.com/sunhe-8922/super-appraiser/actions)

基于 GB/T 50291-2015《房地产估价规范》的 AI 驱动房地产估价引擎。

## 安装

```bash
npm install super-appraiser
```

## 快速开始

### 命令行 demo

```bash
npx super-appraiser --demo
```

或开发模式：

```bash
git clone https://github.com/sunhe-8922/super-appraiser.git
cd super-appraiser
npm install
npm run dev -- --demo
```

输出完整叙述式估价报告（cover + letter + declaration + assumptions + resultReport + technicalReport 六段）。

### 程序化调用

```typescript
import { EstimationPipeline, MockAdapter } from 'super-appraiser';

const pipeline = new EstimationPipeline({
  dataSource: new MockAdapter(),
  parallelCalculation: true,   // 默认 true
});

const report = await pipeline.run({
  demand: {
    purpose: 'mortgage',
    valueType: 'marketValue',
    client: { name: '张三', type: 'individual' },
    valueDatePoint: { date: new Date(), type: 'present' },
  },
  estObject: { /* ... */ },
});

console.log(report.content);
```

### 真实数据（Kimi WebBridge）

```typescript
import { EstimationPipeline, KimiBridgeAdapter } from 'super-appraiser';

const pipeline = new EstimationPipeline({
  dataSource: new KimiBridgeAdapter(),   // 自动探测 ~/.kimi-webbridge
});
```

CLI 环境变量：`SUPER_APPRAISER_DATA=kimi|mock` 强制选择数据源。

## 特性

- **完整流程**：覆盖国标 11 步估价程序（3.0.1）
- **多方法**：比较法（4.2）、收益法（4.3）、成本法（4.4）—— `parallelCalculation: true` 并行执行
- **方法选择**：自动判断（4.1），无需手动指定
- **结果确定**：简单算术平均综合多方法结果（6.0.5）
- **多格式报告**：叙述式（7.0.2~7.0.18）+ 表格式，单 component template 文件即改即用
- **多数据源**：Kimi WebBridge（实时） + Mock（演示），可插拔 `DataSourceAdapter`
- **中文化金额**：完整 4-段式中文大写（个/拾/佰/仟 + 万/亿/万亿）

## Skill 列表

| # | Skill | 对应规范 | 说明 |
|---|-------|---------|------|
| 1 | demand-clarity | 3.0.3 | 需求澄清 |
| 2 | estimation-plan | 3.0.4 | 估价方案 |
| 3 | data-collection | 3.0.5~3.0.6 | 资料搜集 |
| 4 | site-inspection | 3.0.7~3.0.10 | 实地查勘 |
| 5 | method-selection | 4.1 | 方法选择 |
| 6 | comparable-method | 4.2 | 比较法 |
| 7 | income-method | 4.3 | 收益法 |
| 8 | cost-method | 4.4 | 成本法 |
| 9 | result-determination | 6.0 | 结果确定 |
| 10 | report-generation | 7.0 | 报告生成 |
| 11 | report-review | 3.0.11 | 报告审核 |
| 12 | archive | 3.0.13~3.0.14 | 资料归档 |

## CLI 选项

```
npx super-appraiser [flags]

  --demo                 使用内置 fixture 数据快速演示
  --purpose <type>       估价目的（mortgage/tax/expropriation/...）
  --value-type <type>    价值类型（marketValue/mortgageValue/...）
  --city <name>          城市（默认: 北京）
  --district <name>      区域（默认: 朝阳区）
  --area <number>        建筑面积 m²（默认: 89.5）
  --help, -h             显示帮助
```

无参数时进入交互模式（API 极简）。

## 配置

通过环境变量 / pipeline config 控制：

```typescript
new EstimationPipeline({
  dataSource: new KimiBridgeAdapter(),
  parallelCalculation: true,        // 多方法并行测算
  // templateLoader: new TemplateLoader(customDir),  // 自定义 mustache 模板覆盖
});
```

## 扩展

### 自定义报告模板

复制 `templates/narrative/*.mustache` 到本地目录，传入 `TemplateLoader(customDir)`：

```typescript
import { TemplateLoader } from 'super-appraiser';

const pipeline = new EstimationPipeline({
  dataSource: new MockAdapter(),
  templateLoader: new TemplateLoader(undefined, './my-templates'),
});
```

### 添加数据源

实现 `DataSourceAdapter` 接口（5 个 fetch 方法）并注册到 Pipeline：

```typescript
import type { DataSourceAdapter } from 'super-appraiser';

class MyAdapter implements DataSourceAdapter { /* ... */ }

new EstimationPipeline({ dataSource: new MyAdapter() });
```

## 规范引用

本系统严格遵循 GB/T 50291-2015《房地产估价规范》。

## License

MIT
