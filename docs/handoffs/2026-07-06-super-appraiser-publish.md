---
name: super-appraiser-0.1.1-release-handoff
description: 超级评估师 v0.1.1 发布会话交接 — 完成 handoff TODO #2-#5 + currency formatter 修复 + npm publish
created: 2026-07-06
---

# Super-Appraiser v0.1.1 发布会话交接文档

## 本次会话完成的工作

### 1. CLI 入口（TODO #2）
- **新增** `src/cli/dev.ts` — 完整的 CLI 入口，三种模式：
  - `npm run dev -- --demo` — 快速演示，内置 fixture 数据
  - `npm run dev -- --purpose mortgage --city 上海` — 参数模式
  - 无参数 — 交互模式（readline 逐字段提问）
- **核心抽象** `buildPipelineInput(demand, obj)` — 单一函数构造 PipelineInput，三个入口共享默认值，避免三处重复字面量
- **数据源选择** `selectDataSource()` — 支持 `SUPER_APPRAISER_DATA=kimi|mock` 环境变量，自动探测 `~/.kimi-webbridge/bin/kimi-webbridge` 存在性
- **CLI 参数解析** `parseArgs()` 单次扫描 `process.argv`，返回 `{wantHelp, demo, ...}` 结构化结果，不再中途 `process.exit(0)`
- `package.json` 的 `dev` script 改为 `ts-node src/cli/dev.ts`

### 2. 报告模板全切 mustache（TODO #3）
- **`combineSections` 重构** — 依次加载 6 段 mustache 模板（cover/letter/declaration/assumptions/resultReport/technicalReport），模板缺失时回退到内嵌 markdown
- **`TemplateLoader` 内存缓存** — `Map<string, string>` 缓存 key=`style/section`，避免每 report 重复 stat + read
- **`renderNarrativeSections` 改名** — 重命名为 `renderXxxMarkdown`，仅作为模板缺失时的回退
- **修复** `format === 'pdf' ? ... : ...` 死三元（两个分支相同值）
- **修复** 4 个 markdown 回退函数携带未使用的 `context` 参数

### 3. Kimi WebBridge 集成（TODO #4）
- **`fetchViaWebBridge` 重写** — 从 throw-once 占位改为 `execFile` 调用 `~/.kimi-webbridge/bin/kimi-webbridge fetch <query>`
- **导出 `isKimiBridgeAvailable()`** — 静态探测函数，暴露给 CLI 使用
- **`data/index.ts` 重新导出** `isKimiBridgeAvailable`
- **5 个 fetch 方法统一** — 提取 `cached<T>(key, query, parse)` helper，消除 copy-paste 模式

### 4. 并行测算（TODO #5）
- **`SKILL_REGISTRY`** — `Record<string, () => BaseSkill>` 消除 parallel/serial 分支的 switch 重复
- **`stepCalculation` 并行化** — `Promise.allSettled` + 每个 skill 独立 `baseContext`（`calculationResults: []`），避免合并冲突
- **部分失败容忍** — 单个 skill 失败不影响其他，warning 日志；全部失败抛错
- **CLI 默认开启** — `parallelCalculation: true`

### 5. numberToChineseCurrency 万/亿位修复
- **旧 bug**：`unitIdx < 4` 边界卡死，5+ 位整数最高位 unit 被 `?? ''` 吞掉
  - `100000` → `"壹元整"`（应为 `拾万元整`）
  - `100000000` → `"壹元整"`（应为 `壹亿元整`）
  - 某些小数路径产生 `"...元undefined角"` 字面量
- **重写为 4-位一段标准化分段算法**：
  - 段内：低位→高位逐位提取，非首位空隙用'零'占位，末尾 0 不读
  - 段间：当前段空且前后段非空时插入'零'；首段为空不补零
  - 小数：0 分→"整"；只有分时前面写"零"占位
  - 支持到万亿（BIG_UNITS = `['', '万', '亿', '万亿']`）
- **回归测试**：28 个用例覆盖 0/边界/单 section/跨万/跨亿/跨万亿/负数/典型估价值
- **jest 测试 27→55 通过**

### 6. 工程改进
- **`.gitattributes`** — 锁定 `*.{ts,js,json,md,mustache}` 为 LF，解决 Windows CRLF diff noise
- **Simplify pass** — 4 review agents 并行审查 → dedup → 修复

## 未解决问题 / TODO
1. **`.claude/settings.json` 权限** — 仍需手动添加 `Bash(*)` wildcard（被自动分类器拦截）
2. **`numberToChineseCurrency` 亿/兆位** — 目前只支持到万亿（10^12），10^16+ 会 segment 溢出
3. **`stepReportReview` / `stepArchive`** — 仍是空 stub，无实际审计/归档逻辑
4. **`stepDataCollection` 硬编码季度** — `'2026-Q2'` 未从 `valueDatePoint` 推导
5. **`ReportConfig` 硬编码** — `stepReportGeneration` 固定 `style: 'narrative', format: 'markdown'`，不支持 tabular/PDF
6. **硬编码 `'待定'`** — `agencyName` / `appraisers` 在报告中永远显示"待定"，需从输入或配置注入
7. **`KimiBridgeAdapter.parseXxx` 全是空 stub** — 返回 `[]` / `{}`，pipeline 实际走 Mock 数据

## 潜在风险
1. **npm publish 需要 PAT** — 每次发布都需要 Personal Access Token（勾选 "Bypass two-factor authentication"），通过 `--otp <PAT>` 传入，不是 6 位 TOTP 码
2. **npm login 新流程** — 当前 npm 默认 Web-Based Browser Auth，`npm login` 会卡在浏览器跳转（`auth/cli/<UUID>`），建议用 `.npmrc` 直接写 `_authToken`
3. **Windows Git CRLF** — 已加 `.gitattributes` 缓解，但 `core.autocrlf=false` 仍需在 CI 上确认
4. **CI 无 browser 环境** — `isKimiBridgeAvailable()` 依赖 `fs.existsSync`，CI 上不会找到 bridge → 自动走 Mock
5. **CLI 入口 `dev.ts` 不在 `files` 白名单** — `package.json` 的 `files` 字段未包含 `src/cli/`，npm 发布时 CLI 代码不会被打包（但 `npm run dev` 需要源码，所以实际是开发时入口，不影响 npm 消费者）

## 后续迭代建议
1. **接入真实数据源** — Kimi WebBridge 解析器（parseComparables / parseRentalData）目前是空 stub
2. **PDF/Word 导出** — 目前只支持 Markdown
3. **假设开发法（hypothetical）** — 方法选择 + skill 尚未实现
4. **`parallelCalculation` 性能调优** — 当前并行是 `Promise.allSettled` 同步执行，如果未来 skill 有异步 I/O（如网络请求），收益会更大
5. **报告模板完善** — 目前 narrative 模板有 6 个 mustache 文件，但 tabular 模板只有 3 个（single/multi/mortgage），缺少 cover
6. **CLI 入口正式发布** — 考虑在 `package.json` 的 `bin` 字段注册 `super-appraiser` 命令，让用户 `npx super-appraiser --demo`

## 关键文件路径
```
super-appraiser/
├── src/
│   ├── cli/
│   │   └── dev.ts                 # CLI 入口（demo/参数/交互模式）
│   ├── data/
│   │   ├── index.ts               # 数据源 barrel export
│   │   ├── kimibridge-adapter.ts  # Kimi WebBridge 适配器（含 isKimiBridgeAvailable）
│   │   ├── mock-adapter.ts        # Mock 数据源
│   │   └── adapter-interface.ts   # DataSourceAdapter 接口
│   ├── report/
│   │   ├── engine.ts              # 报告生成引擎（含 numberToChineseCurrency）
│   │   ├── template-loader.ts     # 模板加载器（带缓存）
│   │   └── templates/             # mustache 模板
│   ├── scheduler/
│   │   ├── pipeline.ts            # 11步估价管道（含 SKILL_REGISTRY + 并行）
│   │   └── state-machine.ts       # 状态机
│   ├── skills/                    # 各方法 skill
│   └── types/                     # 类型定义
├── scripts/smoke-test.mjs         # 端到端 smoke test
├── tests/unit/report-engine.test.ts  # 含 28 个 currency formatter case
├── .gitattributes                 # LF 锁定
├── package.json                   # npm 包配置
└── .github/workflows/ci.yml       # CI 矩阵
```

## npm 发布命令
```bash
cd super-appraiser
npm run build
npm test
npm publish --access public --otp <64字符PAT>
```

## Git 提交历史（本次会话）
```
b21b1d8 chore: bump version to 0.1.1 and refresh README
17b96b0 fix: numberToChineseCurrency 跨万/亿位 silently demote digit
74096ac feat: ship CLI, mustache templates, kimi integration, parallel calculation
```

## 发布状态
| 渠道 | 地址 |
|---|---|
| GitHub Release | https://github.com/sunhe-8922/super-appraiser/releases/tag/v0.1.1 |
| npm 包 | https://www.npmjs.com/package/super-appraiser/v/0.1.1 |
| tarball | https://registry.npmjs.org/super-appraiser/-/super-appraiser-0.1.1.tgz |
| Tag | `v0.1.1` (annotated) |
