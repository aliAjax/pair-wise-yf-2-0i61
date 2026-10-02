import { migrateArchive } from '../src/utils/migration';
import { mergeArchives } from '../src/utils/merge';
import type { Bench } from '../src/types';

let passed = 0;
let failed = 0;

function assert(cond: boolean, message: string) {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error('  ✗ ' + message);
  }
}

function makeBench(overrides: Partial<Bench> & { code: string }): Bench {
  return {
    id: 'id-' + overrides.code,
    name: '长椅 ' + overrides.code,
    location: '原地',
    lat: 31.23,
    lng: 121.47,
    material: 'wood',
    orientation: 'south',
    hasBackrest: true,
    shadeLevel: 'full',
    noiseLevel: 'quiet',
    stayDuration: 'medium',
    rating: 4,
    review: '',
    experiences: [],
    experiencesConfirmed: true,
    pendingReviews: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function archiveWith(benches: Bench[]) {
  const archive = migrateArchive(benches);
  return archive;
}

// 1. 旧格式（裸数组）迁移
{
  const legacy = [
    { id: 'x1', name: '旧长椅', location: 'a', material: 'stone', shadeLevel: 'none' },
  ];
  const migrated = migrateArchive(legacy);
  assert(migrated.format === 'bench-archive-v2', '迁移后为 v2 格式');
  assert(migrated.benches[0].code === 'x1', '旧数据用 id 作为编号兜底');
  assert(migrated.benches[0].experiencesConfirmed === true, '历史数据体验视为已确认');
  assert(migrated.base.benches.length === 1, '迁移后基线包含长椅');
  const wrapped = migrateArchive({ benches: legacy });
  assert(wrapped.benches.length === 1, '支持 {benches:[]} 包裹格式迁移');
}

// 2. 新增 / 只在一边动过 → 直接并入
{
  const base = [makeBench({ code: 'B0001', name: '共享', updatedAt: '2024-01-01T00:00:00Z' })];
  const localA = archiveWith(base);
  // 对方新增 B0002，且改了 B0001 的名字（只它一边改）
  const incomingBenches = [
    makeBench({ code: 'B0001', name: '共享-改名', updatedAt: '2024-02-01T00:00:00Z' }),
    makeBench({ code: 'B0002', name: '对方新增' }),
  ];
  const incoming = archiveWith(incomingBenches);
  incoming.base = migrateArchive(base).base;
  const { archive, report } = mergeArchives(localA, incoming);
  assert(report.added === 1, '对端新增的长椅计入 added');
  assert(archive.benches.some((b) => b.code === 'B0002'), '新增的长椅并入');
  const b1 = archive.benches.find((b) => b.code === 'B0001')!;
  assert(b1.name === '共享-改名', '只有一边改的字段直接取改动值');
  assert(b1.pendingReviews.length === 0, '单边改动不产生待复核');
}

// 3. 两边都改同一字段 → 晚的生效，早的挂待复核
{
  const baseBench = makeBench({ code: 'B0001', name: '原名', rating: 3 });
  const base = migrateArchive([baseBench]);
  const local = migrateArchive([
    makeBench({ code: 'B0001', name: '本机改', rating: 5, updatedAt: '2024-03-01T00:00:00Z' }),
  ]);
  local.base = base.base;
  const incoming = migrateArchive([
    makeBench({ code: 'B0001', name: '对方改', rating: 2, updatedAt: '2024-02-01T00:00:00Z' }),
  ]);
  incoming.base = base.base;
  const { archive, report } = mergeArchives(local, incoming);
  const b1 = archive.benches.find((b) => b.code === 'B0001')!;
  assert(b1.name === '本机改', '两边改名：保留时间晚的值');
  assert(b1.rating === 5, '评分也保留晚的值');
  assert(b1.pendingReviews.length === 2, '两个冲突字段各产生一条待复核');
  const nameReview = b1.pendingReviews.find((r) => r.field === 'name')!;
  assert(nameReview && nameReview.otherValue === '对方改', '早的值挂为待复核');
  assert(nameReview.otherSource === 'incoming', '标记旧值来源');
  assert(report.conflicts === 1 && report.pendingReviews === 2, '报告统计冲突');
}

// 4. 两边改不同字段 → 自动合并，无待复核
{
  const baseBench = makeBench({ code: 'B0001', name: '原名', review: '' });
  const base = migrateArchive([baseBench]);
  const local = migrateArchive([
    makeBench({ code: 'B0001', name: '本机改名', review: '', updatedAt: '2024-03-01T00:00:00Z' }),
  ]);
  local.base = base.base;
  const incoming = migrateArchive([
    makeBench({ code: 'B0001', name: '原名', review: '对方写的评价', updatedAt: '2024-02-01T00:00:00Z' }),
  ]);
  incoming.base = base.base;
  const { archive } = mergeArchives(local, incoming);
  const b1 = archive.benches.find((b) => b.code === 'B0001')!;
  assert(b1.name === '本机改名' && b1.review === '对方写的评价', '不同字段两边改动自动合到一起');
  assert(b1.pendingReviews.length === 0, '不同字段无冲突');
}

// 5. 一边删除、另一边没改 → 尊重删除
{
  const baseBench = makeBench({ code: 'B0001' });
  const base = migrateArchive([baseBench]);
  // 本机留着未改的长椅
  const local = migrateArchive([makeBench({ code: 'B0001', updatedAt: '2024-01-01T00:00:00Z' })]);
  local.base = base.base;
  // 对方删了它
  const incoming = migrateArchive([] as Bench[]);
  incoming.base = base.base;
  incoming.tombstones = [{ code: 'B0001', deletedAt: '2024-03-05T00:00:00Z' }];
  const { archive, report } = mergeArchives(local, incoming);
  assert(!archive.benches.some((b) => b.code === 'B0001'), '未改过的一边尊重删除');
  assert(archive.tombstones.some((t) => t.code === 'B0001'), '删除保留墓碑');
  assert(report.removed === 1, '本机长椅被对端删除计入 removed');
}

// 6. 一边删除、另一边又改过 → 隔离
{
  const baseBench = makeBench({ code: 'B0001', name: '原名' });
  const base = migrateArchive([baseBench]);
  const local = migrateArchive([] as Bench[]);
  local.base = base.base;
  local.tombstones = [{ code: 'B0001', deletedAt: '2024-03-05T00:00:00Z' }];
  const incoming = migrateArchive([
    makeBench({ code: 'B0001', name: '对方改名了', updatedAt: '2024-03-01T00:00:00Z' }),
  ]);
  incoming.base = base.base;
  const { archive, report } = mergeArchives(local, incoming);
  assert(!archive.benches.some((b) => b.code === 'B0001'), '删除 vs 修改不直接并入');
  assert(archive.quarantined.length === 1, '被隔离出来');
  assert(archive.quarantined[0].bench.name === '对方改名了', '隔离的是改过的一版');
  assert(archive.quarantined[0].deleteSource === 'local', '记录删除来自本机');
  assert(report.quarantined === 1, '报告统计隔离');
}

// 7. 材质变化 → 分时段体验需重新确认
{
  const baseBench = makeBench({ code: 'B0001', material: 'wood' });
  const base = migrateArchive([baseBench]);
  const local = migrateArchive([
    makeBench({ code: 'B0001', material: 'wood', updatedAt: '2024-01-01T00:00:00Z' }),
  ]);
  local.base = base.base;
  const incoming = migrateArchive([
    makeBench({ code: 'B0001', material: 'metal', updatedAt: '2024-03-01T00:00:00Z' }),
  ]);
  incoming.base = base.base;
  const { archive } = mergeArchives(local, incoming);
  const b1 = archive.benches.find((b) => b.code === 'B0001')!;
  assert(b1.material === 'metal', '材质取较晚值');
  assert(b1.experiencesConfirmed === false, '材质变化后体验标记为未确认');
}

// 8. 遮阴单边变化 → 同样未确认
{
  const baseBench = makeBench({ code: 'B0001', shadeLevel: 'full' });
  const base = migrateArchive([baseBench]);
  const local = migrateArchive([
    makeBench({ code: 'B0001', shadeLevel: 'full', updatedAt: '2024-01-01T00:00:00Z' }),
  ]);
  local.base = base.base;
  const incoming = migrateArchive([
    makeBench({ code: 'B0001', shadeLevel: 'none', updatedAt: '2024-03-01T00:00:00Z' }),
  ]);
  incoming.base = base.base;
  const { archive } = mergeArchives(local, incoming);
  assert(archive.benches[0].experiencesConfirmed === false, '遮阴单边变化也需重新确认');
}

// 9. 体验字段两边都改 → 晚值生效 + 待复核
{
  const baseBench = makeBench({
    code: 'B0001',
    experiences: [
      { id: 'e1', benchId: 'x', timePeriod: 'morning', notes: '基线备注', rating: 3, updatedAt: '2024-01-01T00:00:00Z' },
    ],
  });
  const base = migrateArchive([baseBench]);
  const local = migrateArchive([
    makeBench({
      code: 'B0001',
      updatedAt: '2024-03-01T00:00:00Z',
      experiences: [
        { id: 'e1', benchId: 'x', timePeriod: 'morning', notes: '本机备注', rating: 5, updatedAt: '2024-03-01T00:00:00Z' },
      ],
    }),
  ]);
  local.base = base.base;
  const incoming = migrateArchive([
    makeBench({
      code: 'B0001',
      updatedAt: '2024-02-01T00:00:00Z',
      experiences: [
        { id: 'e1', benchId: 'x', timePeriod: 'morning', notes: '对方备注', rating: 1, updatedAt: '2024-02-01T00:00:00Z' },
      ],
    }),
  ]);
  incoming.base = base.base;
  const { archive } = mergeArchives(local, incoming);
  const exp = archive.benches[0].experiences[0];
  assert(exp.notes === '本机备注' && exp.rating === 5, '体验取时间晚的值');
  const expReviews = archive.benches[0].pendingReviews.filter((r) => r.scope === 'experience');
  assert(expReviews.length === 2, '体验冲突挂待复核');
}

// 10. 连续两次合并：第二次用第一次的基线，旧冲突不会反复出现
{
  const baseBench = makeBench({ code: 'B0001', name: '原名' });
  const base = migrateArchive([baseBench]);
  const local = migrateArchive([
    makeBench({ code: 'B0001', name: '本机改', updatedAt: '2024-03-01T00:00:00Z' }),
  ]);
  local.base = base.base;
  const friend1 = migrateArchive([
    makeBench({ code: 'B0001', name: '原名', review: '队友一评价', updatedAt: '2024-02-01T00:00:00Z' }),
  ]);
  friend1.base = base.base;
  const first = mergeArchives(local, friend1).archive;
  // 再合并同一份（基线已更新），不应新增冲突 / 不应重复
  const second = mergeArchives(first, friend1);
  assert(second.archive.benches.length === 1, '重复合并不产生重复长椅');
  assert(second.report.conflicts === 0, '基线更新后旧改动不再算冲突');
  assert(second.archive.benches[0].review === '队友一评价', '第一次的合并结果保留');
}

// 11. 隔离项恢复与放弃
{
  const baseBench = makeBench({ code: 'B0001', name: '原名' });
  const base = migrateArchive([baseBench]);
  const local = migrateArchive([] as Bench[]);
  local.base = base.base;
  local.tombstones = [{ code: 'B0001', deletedAt: '2024-03-05T00:00:00Z' }];
  const incoming = migrateArchive([
    makeBench({ code: 'B0001', name: '改名', updatedAt: '2024-03-01T00:00:00Z' }),
  ]);
  incoming.base = base.base;
  const merged = mergeArchives(local, incoming).archive;
  assert(merged.quarantined.length === 1, '先进入隔离区');
  // 模拟恢复：把隔离项放回
  const restored = migrateArchive([merged.quarantined[0].bench]);
  restored.tombstones = merged.tombstones.filter((t) => t.code !== 'B0001');
  restored.quarantined = [];
  restored.base = merged.base;
  assert(restored.benches.length === 1, '恢复后长椅回到档案');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
