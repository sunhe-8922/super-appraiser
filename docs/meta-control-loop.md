# Agent Meta-Control Loop

## 原则
1. 所有 Agent **结构化日志**（decision / failure / retry / output），禁止裸 print 主通道
2. 第二 Agent **只读日志**，检测重复错误、重复劳动、平台期
3. 停滞时 **改写系统**（prompt/skill/workflow/eval）→ 沙盒 → 失败自动回滚；禁止空重试话术

## 模块
| 路径 | 职责 |
|------|------|
| `src/observability/` | JSONL logger + event schema |
| `src/meta/detector.ts` | 停滞/循环诊断 |
| `src/meta/rewriter.ts` | 自动改写 |
| `src/meta/sandbox.ts` | 沙盒规则 |
| `src/meta/version-store.ts` | 版本与回滚 |
| `src/meta/controller.ts` | 编排闭环 |

## 版本目录
默认 `.super-appraiser/versions/`（已 gitignore）

## 落盘 promote
- `SkillRegistry` 将 rewrite target 映射到 `.claude/skills/*/SKILL.md`（及 workflow/eval 工件）
- 沙盒通过 → `ArtifactPromoter.promote` 写盘
- 沙盒失败 → `VersionStore.rollback` + `ArtifactPromoter.restore` 恢复改写前内容
- `EstimationPipeline({ enableMetaLoop: true })` 默认 **不** 落盘（`promoteToDisk: false`），避免 demo 污染仓库
- 需要自动改 skill 时：

```ts
new MetaController({
  repoRoot: findRepoRoot(),
  promoteToDisk: true,
}).runCycle(events);
```

