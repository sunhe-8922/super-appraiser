import { EstimationPipeline } from '../../src/scheduler/pipeline';
import { MockAdapter } from '../../src/data/mock-adapter';

const sampleInput = {
  demand: {
    purpose: 'mortgage' as const,
    valueType: 'marketValue' as const,
    client: { name: 'Test', type: 'individual' as const },
    valueDatePoint: { date: new Date('2026-07-01'), type: 'present' as const },
  },
  estObject: {
    propertyType: 'residential' as const,
    subType: 'apartment' as const,
    location: {
      city: '北京',
      district: '朝阳区',
      street: '建国路',
      community: '测试小区',
    },
    area: { constructionArea: 89.5 },
    physical: {
      structure: '钢筋混凝土',
      yearBuilt: 2015,
      condition: '完好' as const,
      decoration: '精装',
      facilities: [] as string[],
    },
    rights: {
      landUseType: '住宅',
      landUseTermEnd: new Date('2083-05-15'),
      ownership: '私有',
      restrictions: [] as string[],
    },
  },
};

describe('EstimationPipeline telemetry', () => {
  it('emits structured state transitions and research sufficiency events', async () => {
    const pipeline = new EstimationPipeline({
      dataSource: new MockAdapter(),
      parallelCalculation: true,
    });
    const result = await pipeline.runWithTelemetry(sampleInput);

    expect(result.report.content.length).toBeGreaterThan(500);
    const events = result.logger.getEvents();
    expect(events.some((e) => e.event === 'state_transition')).toBe(true);
    expect(events.some((e) => e.event === 'decision')).toBe(true);
    expect(events.some((e) => e.event === 'output')).toBe(true);
    expect(events.some((e) => e.event === 'sufficiency_check')).toBe(true);
    expect(result.research?.plan.requireNetwork).toBe(true);
    expect(result.research?.plan.lanes).toContain('vertical');
    expect(result.research?.plan.lanes).toContain('horizontal');
  });

  it('run() remains backward compatible (returns report only)', async () => {
    const pipeline = new EstimationPipeline({
      dataSource: new MockAdapter(),
    });
    const report = await pipeline.run(sampleInput);
    expect(report.content).toContain('估价');
  });

  it('can enable meta loop after successful run (progressing)', async () => {
    const pipeline = new EstimationPipeline({
      dataSource: new MockAdapter(),
      enableMetaLoop: true,
    });
    const result = await pipeline.runWithTelemetry(sampleInput);
    expect(result.meta?.diagnosis.status).toBe('progressing');
    expect(result.meta?.promoted).toBe(false);
  });
});
