---
name: data-collection
description: 搜集房地产估价所需资料；强制并行联网调研，禁止仅靠已有知识
---

# 搜集估价所需资料

## 触发条件
估价方案确定后，开始搜集资料。

## 硬约束（方法论迁移 · 不可省略）
1. **必须联网**：资料搜集质量取决于信息丰富度与准确性，不能仅靠已有知识或 Mock 先验。
2. **宁可多搜**：信息不足会让后续比较法/收益法/成本法分析浮于表面；不通过充分性自检不得进入测算。
3. **一手来源优先**：官方/原始成交与权威披露 > 媒体原创 > 转载/聚合。多媒体转载同一错误会造成循环印证假象。
4. **结构化日志**：决策、失败、重试、输出写入 StructuredLogger（JSONL），禁止堆 print。

## 并行搜索策略（子 Agent）
使用子 Agent 并行提高效率：

| 子 Agent | 分工 |
|----------|------|
| 1 纵向 | 区域/小区起源与发展、规划变更、价格轨迹、关键事件、政策影响 |
| 2 横向 | 可比小区/竞品盘、成交与挂牌、租金对比、行业/板块评测 |
| 3 社区（复杂对象） | 业主论坛、中介口碑、知乎/X/Reddit、质量与维权争议 |

运行时 API（TypeScript）：

```ts
import {
  buildResearchPlan,
  buildLaneAgentPrompt,
  assessSufficiency,
  keywordTemplates,
  SUBAGENT_NETWORK_GUIDE,
} from 'super-appraiser';
```

`EstimationPipeline` 在 `data_collection` 阶段会：
- 生成 `ResearchPlan` 与三线子 Agent prompt（写入结构化日志）
- 拉取 DataSourceAdapter 数据
- 运行 `assessSufficiency`；`needsMoreSearch=true` 时日志 outcome=partial，**Agent 必须继续联网补搜**

## 每个子 Agent prompt 必须包含的联网指引

原样使用包内常量 `SUBAGENT_NETWORK_GUIDE`，或：

```
你需要联网获取信息。使用以下工具：

WebSearch：用于搜索发现信息来源，获取摘要和关键词结果
WebFetch：当已知具体URL时，用于从页面定向提取内容
如果用户环境中安装了 web-access skill，优先加载它并遵循其指引（浏览器 CDP）
搜索策略：先用WebSearch发现信息来源和线索，找到具体URL后用WebFetch深入提取
多次搜索、多个关键词组合，不要只搜一次就放弃
一手来源优于二手来源：官方博客 > 权威媒体原创报道 > 转载/聚合
学术类研究对象必查arxiv（export.arxiv.org/api/query）
prompt描述目标（"获取""调研""了解"），不要用暗示具体手段的动词（"搜索""爬取"）
```

## 信息来源优先级

| 信息类型 | 一手来源 |
|----------|----------|
| 产品/政策/规划 | 政府官网、官方公告、Release/公报 |
| 成交/挂牌 | 中介/登记一手页面、住建公开数据 |
| 用户口碑 | GitHub Issues（工具类）、业主社区、知乎、X |
| 行业分析 | 权威媒体原创（非转载） |
| 学术/模型 | arXiv、会议论文 |

## 信息充分性自检（搜完必做）
1. **纵向**：能讲出完整故事吗？有无断层？
2. **横向**：可比/竞品列表完整吗？每个对象够对比吗？
3. **来源**：关键事实有可靠来源吗？是否单源定性？

不满足 → **再补搜**，不要凑合。

## 规范约束
- 3.0.5：四类资料（对象状况、交易收益成本、地区影响因素、普遍影响因素）
- 3.0.6：检查真实性、准确性、完整性；权属证明原件核对

## 输入
- EstimationPlan 资料清单

## 输出
- CollectedData + ResearchBundle（plan/findings/sufficiency）

## 与 Meta-Control 的关系
若连续因资料不足失败，Meta Agent 将改写本 skill / 评估标准并沙盒验证，而不是说「请再试一次」。
