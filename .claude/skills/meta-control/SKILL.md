---
name: meta-control
description: 读 Worker 结构化日志，检测重复错误/重复劳动/平台期；停滞则改写 skill/prompt/工作流/评估标准，沙盒测试，失败回滚
---

# Meta-Control Loop

## 职责边界
- **唯一输入**：Worker 的结构化 JSONL / `StructuredLogger.getEvents()`
- **禁止**：说「请再试一次」；禁止替代 Worker 做业务估价
- **输出**：诊断 `progressing | looping | stagnant` + 改写 + 沙盒结果 + 是否回滚

## 检测项
1. 连续相同 error signature
2. 相同 action+target 重复且无进展
3. 最近窗口失败占比高且无成功 output（平台期）

## 停滞动作
1. `PromptRewriter` 改写 skill / prompt / workflow / eval
2. `evaluateSandbox`（可注入 smoke/test 作为 extraChecks）
3. 失败 → `VersionStore.rollback` 自动回滚

## 代码

```ts
import { MetaController, StructuredLogger, findRepoRoot } from 'super-appraiser';

// 诊断 + 改写 + 沙盒；promoteToDisk=true 时写回 .claude/skills
const meta = new MetaController({
  repoRoot: findRepoRoot(),
  promoteToDisk: true,
});
const result = meta.runCycle(workerLogger.getEvents());
// result.diagnosis / rewrites / sandbox / rolled_back / promoted / disk_ops
```

Pipeline 开关（默认只诊断，**不落盘**）：

```ts
new EstimationPipeline({
  dataSource,
  enableMetaLoop: true,
  logDir: '.super-appraiser/logs',
});
```


## 日志事件类型
`decision | failure | retry | output | state_transition | sufficiency_check | meta_diagnosis | meta_rewrite | meta_sandbox | meta_rollback`
