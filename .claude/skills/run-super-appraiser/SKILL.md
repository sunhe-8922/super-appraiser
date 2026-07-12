---
name: run-super-appraiser
description: run, build, smoke-test, and drive the Super-Appraiser real estate valuation engine
---

# Run Super-Appraiser

Super-Appraiser is a TypeScript library that performs real estate valuation following GB/T 50291-2015. It has no GUI — drive it via the `scripts/smoke-test.mjs` smoke test or by importing `EstimationPipeline`.

Paths in this skill are relative to `<unit>/` (the `super-appraiser/` directory).

## Prerequisites

```bash
npm install
```

## Build

```bash
npm run build
```

Outputs to `dist/`. Verify with `npx tsc --noEmit`.

## Run: Smoke Test (agent path)

```bash
node scripts/smoke-test.mjs
```

This runs a full end-to-end pipeline with `MockAdapter` and prints the generated Markdown report. Expect output containing:
- Report style: `narrative`
- Format: `markdown`
- Length: ~1700-2000 chars
- Contains `估价报告编号 SA-2026-*`
- Contains Chinese currency conversion (e.g. `叁柒玖玖万...`)
- Exit code 0

## Direct Invocation (agent path)

Use the compiled `dist/` via CommonJS require (ts-node ESM import fails on Node 20+ due to cycle/module resolution issues):

```bash
node -e '
const { EstimationPipeline, MockAdapter } = require("./dist/index.js");
const p = new EstimationPipeline({ dataSource: new MockAdapter() });
p.run({
  demand: { purpose: "mortgage", valueType: "marketValue", client: { name: "Test", type: "individual" }, valueDatePoint: { date: new Date(), type: "present" } },
  estObject: { propertyType: "residential", subType: "apartment", location: { city: "北京", district: "朝阳区", street: "建国路", community: "小区" }, area: { constructionArea: 89.5 }, physical: { structure: "钢筋混凝土", yearBuilt: 2015, condition: "完好", decoration: "精装", facilities: [] }, rights: { landUseType: "住宅", landUseTermEnd: new Date("2083-05-15"), ownership: "私有", restrictions: [] } },
}).then(r => console.log("Report length:", r.content.length));
'
```

Expected output: `Report length: 1802` (approx, varies with date).

## Run: Human Path

```bash
npm run dev   # runs ts-node src/index.ts (stub — no standalone CLI)
```

This is not useful headless. Use the smoke test or direct invocation instead.

## Test

```bash
npx jest
```

Expect all tests passing (68+ including meta-control / research / telemetry).

## Meta-Control & research

```bash
# telemetry API (after build)
node -e "const {EstimationPipeline,MockAdapter}=require('./dist'); new EstimationPipeline({dataSource:new MockAdapter(),enableMetaLoop:true}).runWithTelemetry({demand:{purpose:'mortgage',valueType:'marketValue',client:{name:'T',type:'individual'},valueDatePoint:{date:new Date(),type:'present'}},estObject:{propertyType:'residential',subType:'apartment',location:{city:'北京',district:'朝阳区',street:'x',community:'y'},area:{constructionArea:90},physical:{structure:'钢筋混凝土',yearBuilt:2015,condition:'完好',decoration:'精装',facilities:[]},rights:{landUseType:'住宅',landUseTermEnd:new Date('2080-01-01'),ownership:'私有',restrictions:[]}}}).then(r=>console.log(r.logger.getEvents().length,r.research?.needsMoreSearch,r.meta?.diagnosis.status))"
```

Skills: `meta-control`, `research-web-parallel`, updated `data-collection`.

## Gotchas

- **`ts-node` direct import does not work on Node 20+** — `npx ts-node -e 'import ... from "./src"'` produces no output (silent failure due to ESM/CommonJS interop). Use `require("./dist/index.js")` instead.
- **`MockAdapter` not in barrel export by default** — if importing from `dist/index.js`, the export is there. If using `ts-node` from source, ensure you import from `"./src"` not `"./src/index"` (the latter may not re-export data adapters depending on the build state).
- **`parallelCalculation` flag is ignored** — the pipeline currently runs all methods sequentially regardless of this flag (known limitation, tracked as TODO).
- **Report content starts with `## 致…函`** — the cover mustache template renders but the narrative cover section is empty in the final output because the cover template has no `{{#narrative}}` guard. The report is still valid; the cover table is embedded in the letter section.
- **Chinese text in files** — Windows Git may convert LF→CRLF. This does not affect runtime but may cause diff noise.
- **`npm run dev` is a dead end** — it runs `ts-node src/index.ts` which has no standalone CLI logic (just a stub). Use the smoke test or direct invocation instead.
