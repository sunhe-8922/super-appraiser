---
name: research-web-parallel
description: 并行联网信息收集方法论 — 纵向/横向/社区三线、一手来源、充分性自检；调研类任务必用
---

# 并行联网调研（Research Web Parallel）

研究报告的价值在于**深度和完整度**。信息收集阶段宁可多搜，不要因为信息不够导致后面的分析浮于表面。

## 何时使用
- 任何需要「调研 / 尽调 / 竞品 / 市场资料 / 可比盘情报」的任务
- Super-Appraiser 的 `data_collection` 阶段
- 用户要求写分析报告且依赖外部事实

## 强制要求
1. **必须联网**，不能仅靠已有知识
2. **并行三线**（复杂对象开社区线）
3. **一手优先**，防循环印证
4. **充分性自检**不通过就继续补搜
5. 子 Agent prompt **目标导向**（获取/调研/了解），勿锁死「搜索/爬取」

## 并行分工

### 子 Agent 1 — 纵向
起源、创始人/主体背景、发展历程、关键事件、版本迭代、融资、战略转向、危机。  
估价场景：小区/板块发展史、规划变更、价格轨迹。

### 子 Agent 2 — 横向
竞品识别、特点与口碑、行业对比、市场份额。  
估价场景：可比小区、替代物业、租金与成交对比。

### 子 Agent 3 — 补充（复杂对象）
社区讨论（GitHub Issues、Reddit、X、知乎）、行业环境、深度背景。

## 子 Agent 联网指引（原样粘贴）

```
你需要联网获取信息。使用以下工具：

WebSearch：用于搜索发现信息来源，获取摘要和关键词结果
WebFetch：当已知具体URL时，用于从页面定向提取内容
如果用户环境中安装了 web-access skill（检查 ~/.agents/skills/web-access/SKILL.md 或 /mnt/.claude/skills/web-access/SKILL.md），优先加载它并遵循其指引，它提供更强的浏览器CDP能力
搜索策略：先用WebSearch发现信息来源和线索，找到具体URL后用WebFetch深入提取
多次搜索、多个关键词组合，不要只搜一次就放弃
一手来源优于二手来源：官方博客 > 权威媒体原创报道 > 转载/聚合
学术类研究对象必查arxiv：curl -s "https://export.arxiv.org/api/query?search_query=all:关键词1+AND+all:关键词2&max_results=10"
找到关键论文后读取 https://arxiv.org/abs/论文ID
prompt要描述目标（"获取""调研""了解"），不要用暗示具体手段的动词（"搜索""爬取"）
```

## 代码入口

```ts
import {
  buildResearchPlan,
  buildLaneAgentPrompt,
  assessSufficiency,
  keywordTemplates,
  SOURCE_PRIORITY,
  SUBAGENT_NETWORK_GUIDE,
} from 'super-appraiser';
```

## 充分性自检
- 纵向完整故事？
- 横向主玩家覆盖且可对比？
- 关键事实多源/一手？

失败 → 补搜。不要凑合。

## 结构化交付
每条发现：`claim` + `sources[]` + `tier` + `confidence` + 信息缺口。  
全程写入 StructuredLogger，供 Meta Agent 检测停滞。
