/**
 * 并行联网信息收集方法论（可执行配置）
 * 质量完全取决于信息丰富度与准确性：必须联网，宁可多搜。
 */

export type ResearchLane = 'vertical' | 'horizontal' | 'community';

export interface SourcePriorityRule {
  infoType: string;
  primarySources: string[];
}

export interface SufficiencyCheckItem {
  id: 'vertical_story' | 'horizontal_coverage' | 'source_reliability';
  question: string;
  passed: boolean;
  gap?: string;
}

export interface ResearchPlan {
  subject: string;
  question: string;
  lanes: ResearchLane[];
  requireNetwork: true;
  preferDepthOverSpeed: true;
  arxivRequired: boolean;
}

export interface ResearchFinding {
  lane: ResearchLane;
  claim: string;
  sources: { url: string; title?: string; tier: 'primary' | 'secondary' | 'community' }[];
  confidence: 'high' | 'medium' | 'low';
}

export interface ResearchBundle {
  plan: ResearchPlan;
  findings: ResearchFinding[];
  sufficiency: SufficiencyCheckItem[];
  needsMoreSearch: boolean;
}

/** 信息来源优先级（一手 > 二手；防循环印证） */
export const SOURCE_PRIORITY: SourcePriorityRule[] = [
  {
    infoType: '产品更新/技术决策',
    primarySources: ['官方博客', 'GitHub Release Notes', '创始人/维护者声明'],
  },
  {
    infoType: '融资/商业数据',
    primarySources: ['公司官方公告', 'SEC/工商文件', '权威媒体原创'],
  },
  {
    infoType: '用户口碑',
    primarySources: ['GitHub Issues', 'Reddit', 'Twitter/X', '知乎'],
  },
  {
    infoType: '行业分析',
    primarySources: ['权威媒体原创报道（非转载）', '研究机构报告'],
  },
  {
    infoType: '学术/技术原理',
    primarySources: ['arXiv', 'Google Scholar', '学术会议论文集'],
  },
  {
    infoType: '房地产市场/可比实例',
    primarySources: [
      '中介成交/挂牌一手页面',
      '地方政府/住建公开数据',
      '估价机构/协会披露',
      '权威媒体原创（标注口径）',
    ],
  },
];

/** 子 Agent 联网指引（必须原样写入每个子 Agent prompt） */
export const SUBAGENT_NETWORK_GUIDE = `
你需要联网获取信息。使用以下工具：

WebSearch：用于搜索发现信息来源，获取摘要和关键词结果
WebFetch：当已知具体URL时，用于从页面定向提取内容
如果用户环境中安装了 web-access skill（检查路径是否存在，如 ~/.agents/skills/web-access/SKILL.md 或 /mnt/.claude/skills/web-access/SKILL.md），优先加载它并遵循其指引，它提供更强的浏览器CDP能力
搜索策略：先用WebSearch发现信息来源和线索，找到具体URL后用WebFetch深入提取
多次搜索、多个关键词组合，不要只搜一次就放弃
一手来源优于二手来源：官方博客 > 权威媒体原创报道 > 转载/聚合
学术类研究对象必查arxiv：如果研究对象涉及学术概念、算法、AI模型、技术范式等，必须通过arxiv API获取相关论文。调用方式：curl -s "https://export.arxiv.org/api/query?search_query=all:关键词1+AND+all:关键词2&max_results=10"，或用WebFetch访问同一URL。返回XML格式，包含标题、作者、摘要、发布日期、PDF链接。可按需调整关键词组合和结果数量。找到关键论文后，用WebFetch读取论文页面（https://arxiv.org/abs/论文ID）获取更多细节。
prompt要描述目标（"获取""调研""了解"），不要用暗示具体手段的动词（"搜索""爬取"），让子Agent自主判断最佳获取方式。
`.trim();

export const LANE_BRIEF: Record<ResearchLane, string> = {
  vertical:
    '纵向信息：研究对象的起源、创始人背景、发展历程、关键事件、版本迭代、融资、战略转向、危机。对估价场景：区域/小区发展史、规划变更、重大事件、价格轨迹。',
  horizontal:
    '横向信息：竞品识别、各竞品特点与用户口碑、行业对比评测、市场份额。对估价场景：可比小区/竞品盘、替代物业、同类产品租金与成交对比。',
  community:
    '补充信息（复杂对象）：创始人/主体深度背景、行业环境变化、用户社区讨论（GitHub issues、Reddit、Twitter/X、知乎等）。对估价场景：业主论坛、中介口碑、投诉与质量争议。',
};

export function buildResearchPlan(
  subject: string,
  question: string,
  opts: { complex?: boolean; academic?: boolean } = {},
): ResearchPlan {
  const lanes: ResearchLane[] = ['vertical', 'horizontal'];
  if (opts.complex) lanes.push('community');
  return {
    subject,
    question,
    lanes,
    requireNetwork: true,
    preferDepthOverSpeed: true,
    arxivRequired: !!opts.academic,
  };
}

/**
 * 为指定信息线生成子 Agent prompt（目标导向，含联网指引）。
 */
export function buildLaneAgentPrompt(plan: ResearchPlan, lane: ResearchLane): string {
  return [
    `# 调研任务（${lane}）`,
    '',
    `研究对象：${plan.subject}`,
    `研究问题：${plan.question}`,
    '',
    `## 你的唯一分工`,
    LANE_BRIEF[lane],
    '',
    '## 硬约束',
    '1. 必须联网获取信息，不能仅靠已有知识。',
    '2. 宁可多搜；信息不够会导致后续分析浮于表面。',
    '3. 一手来源优先；关键事实必须可追溯到 URL。',
    '4. 描述目标用「获取/调研/了解」，自主选择最佳获取方式。',
    plan.arxivRequired
      ? '5. 本对象含学术/技术成分：必须查 arXiv API 并阅读关键论文摘要页。'
      : '5. 若发现学术概念/算法/模型相关线索，补查 arXiv。',
    '',
    '## 联网工具指引',
    SUBAGENT_NETWORK_GUIDE,
    '',
    '## 交付',
    '返回结构化要点：主张、来源URL、来源层级(primary/secondary/community)、置信度、信息缺口。',
  ].join('\n');
}

/**
 * 信息充分性自检。任一不过 → needsMoreSearch。
 */
export function assessSufficiency(findings: ResearchFinding[]): {
  items: SufficiencyCheckItem[];
  needsMoreSearch: boolean;
} {
  const vertical = findings.filter((f) => f.lane === 'vertical');
  const horizontal = findings.filter((f) => f.lane === 'horizontal');
  const withPrimary = findings.filter((f) => f.sources.some((s) => s.tier === 'primary'));
  const multiSource = findings.filter((f) => f.sources.length >= 2);

  const items: SufficiencyCheckItem[] = [
    {
      id: 'vertical_story',
      question: '纵向：能讲出一个完整故事吗？有没有明显信息断层？',
      passed: vertical.length >= 3,
      gap: vertical.length >= 3 ? undefined : `纵向发现仅 ${vertical.length} 条，需补起源/历程/关键事件`,
    },
    {
      id: 'horizontal_coverage',
      question: '横向：竞品/可比列表完整吗？每个对象信息够对比吗？',
      passed: horizontal.length >= 3,
      gap:
        horizontal.length >= 3
          ? undefined
          : `横向发现仅 ${horizontal.length} 条，需补竞品/可比与口碑`,
    },
    {
      id: 'source_reliability',
      question: '来源：关键事实有可靠来源支撑吗？是否单源下判断？',
      passed: withPrimary.length > 0 && multiSource.length >= Math.ceil(findings.length / 2),
      gap:
        withPrimary.length > 0 && multiSource.length >= Math.ceil(findings.length / 2)
          ? undefined
          : '一手来源不足或过多单源结论，需补一手并交叉验证',
    },
  ];

  return {
    items,
    needsMoreSearch: items.some((i) => !i.passed),
  };
}

export function keywordTemplates(subject: string): Record<ResearchLane, string[]> {
  return {
    vertical: [
      `${subject} 发展历程`,
      `${subject} 规划 变更`,
      `${subject} 价格 走势`,
      `${subject} timeline`,
      `${subject} 成交`,
    ],
    horizontal: [
      `${subject} 对比 小区`,
      `${subject} 竞品`,
      `${subject} 租金 挂牌`,
      `${subject} vs`,
      `${subject} 市场占有`,
    ],
    community: [
      `${subject} 业主 评价`,
      `${subject} site:zhihu.com`,
      `${subject} site:reddit.com`,
      `${subject} 投诉`,
      `${subject} 知乎`,
    ],
  };
}
