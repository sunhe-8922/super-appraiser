import {
  assessSufficiency,
  buildLaneAgentPrompt,
  buildResearchPlan,
  keywordTemplates,
  SOURCE_PRIORITY,
  SUBAGENT_NETWORK_GUIDE,
  type ResearchFinding,
} from '../../src/research/methodology';

describe('parallel web research methodology', () => {
  it('requires network and builds three-lane plan for complex subjects', () => {
    const plan = buildResearchPlan('望京SOHO', '收集可比与租金', {
      complex: true,
      academic: false,
    });
    expect(plan.requireNetwork).toBe(true);
    expect(plan.preferDepthOverSpeed).toBe(true);
    expect(plan.lanes).toEqual(['vertical', 'horizontal', 'community']);
  });

  it('embeds network guide and goal-oriented language in lane prompts', () => {
    const plan = buildResearchPlan('SubjectX', '了解市场结构', { complex: true });
    const prompt = buildLaneAgentPrompt(plan, 'vertical');
    expect(prompt).toContain(SUBAGENT_NETWORK_GUIDE.slice(0, 40));
    expect(prompt).toContain('必须联网');
    expect(prompt).toContain('WebSearch');
    expect(prompt).toContain('获取');
    // 不应把手段动词当作任务标题强制手段
    expect(prompt).toMatch(/调研任务/);
  });

  it('fails sufficiency when findings are thin and passes when rich', () => {
    const thin: ResearchFinding[] = [
      {
        lane: 'vertical',
        claim: 'only one fact',
        sources: [{ url: 'https://example.com', tier: 'secondary' }],
        confidence: 'low',
      },
    ];
    const thinResult = assessSufficiency(thin);
    expect(thinResult.needsMoreSearch).toBe(true);

    const rich: ResearchFinding[] = [];
    for (let i = 0; i < 3; i++) {
      rich.push({
        lane: 'vertical',
        claim: `v${i}`,
        sources: [
          { url: `https://primary.example/${i}`, tier: 'primary' },
          { url: `https://secondary.example/${i}`, tier: 'secondary' },
        ],
        confidence: 'high',
      });
      rich.push({
        lane: 'horizontal',
        claim: `h${i}`,
        sources: [
          { url: `https://primary.example/h${i}`, tier: 'primary' },
          { url: `https://secondary.example/h${i}`, tier: 'secondary' },
        ],
        confidence: 'high',
      });
    }
    const richResult = assessSufficiency(rich);
    expect(richResult.needsMoreSearch).toBe(false);
    expect(richResult.items.every((i) => i.passed)).toBe(true);
  });

  it('exposes source priority table and keyword templates', () => {
    expect(SOURCE_PRIORITY.length).toBeGreaterThanOrEqual(5);
    const kw = keywordTemplates('某小区');
    expect(kw.vertical.length).toBeGreaterThanOrEqual(3);
    expect(kw.horizontal.length).toBeGreaterThanOrEqual(3);
    expect(kw.community.length).toBeGreaterThanOrEqual(3);
  });
});
