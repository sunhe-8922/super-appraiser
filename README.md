# Super-Appraiser — 房地产估价插件系统

基于 GB/T 50291-2015《房地产估价规范》的 AI 驱动房地产估价插件系统。

## 特性

- **双架构**：`.claude/skills/` 下的 SKILL.md 文件供 Claude Code 加载 + `src/` 下的 TypeScript 代码供程序执行
- **完整流程**：12 个 skill 覆盖国标 11 步估价程序
- **多方法**：比较法、收益法、成本法，自动判断适用方法
- **多格式**：叙述式报告（7.0.2）+ 表格式报告（7.0.17），支持 Markdown/HTML/PDF/Word 输出
- **实时数据**：Kimi WebBridge 实时获取市场数据，Mock 数据备用

## 快速开始

```bash
npm install
npm run build
```

### 使用 Pipeline

```typescript
import { EstimationPipeline, MockAdapter } from 'super-appraiser';

const pipeline = new EstimationPipeline({
  dataSource: new MockAdapter(),
  reportConfig: { style: 'narrative', format: 'markdown' },
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

## 配置

编辑 `config/appraiser.config.json` 修改默认设置。

## 扩展

### 自定义报告模板

在 `templates/custom/` 下创建 mustache 模板文件，通过 `ReportConfig.customTemplateDir` 指定。

### 添加数据源

实现 `DataSourceAdapter` 接口并注册到 Pipeline。

## 规范引用

本系统严格遵循 GB/T 50291-2015《房地产估价规范》。

## License

MIT
