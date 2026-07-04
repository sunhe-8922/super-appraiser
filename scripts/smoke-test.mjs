#!/usr/bin/env node
/**
 * Super-Appraiser smoke test driver
 * Runs a full end-to-end estimation pipeline with MockAdapter and prints the report.
 * Usage: node scripts/smoke-test.mjs
 */

import { EstimationPipeline, MockAdapter } from '../dist/index.js';

async function main() {
  const pipeline = new EstimationPipeline({
    dataSource: new MockAdapter(),
    parallelCalculation: true,
  });

  const report = await pipeline.run({
    demand: {
      purpose: 'mortgage',
      valueType: 'marketValue',
      client: { name: '张三', type: 'individual' },
      valueDatePoint: { date: new Date(), type: 'present' },
    },
    estObject: {
      propertyType: 'residential',
      subType: 'apartment',
      location: {
        city: '北京',
        district: '朝阳区',
        street: '建国路88号',
        community: '现代城小区',
      },
      area: { constructionArea: 89.5 },
      physical: {
        structure: '钢筋混凝土',
        yearBuilt: 2015,
        condition: '完好',
        decoration: '中等装修',
        facilities: ['电梯', '暖气'],
      },
      rights: {
        landUseType: '住宅',
        landUseTermEnd: new Date('2083-05-15'),
        ownership: '私有',
        restrictions: [],
      },
    },
  });

  console.log('=== Report generated ===');
  console.log(`Style: ${report.style}`);
  console.log(`Format: ${report.config.format}`);
  console.log(`Length: ${report.content.length} chars`);
  console.log('--- First 800 chars ---');
  console.log(report.content.substring(0, 800));
  console.log('\n=== SUCCESS ===');
}

main().catch((err) => {
  console.error('FAIL:', err.message);
  console.error(err.stack);
  process.exit(1);
});
