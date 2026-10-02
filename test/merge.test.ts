import { mergeArchives } from '../src/utils/merge';
import { migrateArchive } from '../src/utils/migrate';
import type { ArchiveFile, Bench } from '../src/types';
import { DATA_VERSION } from '../src/types';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error('FAIL:', msg);
  }
}

function makeBench(over: Partial<Bench> & { id: string }): Bench {
  return {
    name: '长椅',
    location: '某处',
    lat: 31.2,
    lng: 121.4,
    material: 'wood',
    orientation: 'south',
    hasBackrest: true,
    shadeLevel: 'partial',
    noiseLevel: 'moderate',
    stayDuration: 'medium',
    rating: 3,
    review: '',
    experiences: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    pendingReview: false,
    experiencesConfirmed: true,
    ...over,
  };
}

function archive(benches: Bench[], tombstones: { id: string; deletedAt: string }[] = []): ArchiveFile {
  return { version: DATA_VERSION, exportedAt: '2026-01-01T00:00:00.000Z', benches, tombstones };
}

// 1. 只在导入方存在 → 直接并入
{
  const local = archive([makeBench({ id: 'a' })]);
  const incoming = archive([makeBench({ id: 'a' }), makeBench({ id: 'b', name: '新长椅' })]);
  const result = mergeArchives(local, incoming);
  assert(result.benches.length === 2, '只在一边存在的长椅应直接并入');
  assert(result.benches.find((b) => b.id === 'b')?.name === '新长椅', '新长椅内容正确');
  assert(result.stats.added === 1, 'added 计数正确');
  assert(!result.benches.find((b) => b.id === 'b')?.pendingReview, '直接并入不应挂待复核');
}

// 2. 两边都动过 → 留较晚值，另一边挂待复核
{
  const local = archive([
    makeBench({ id: 'a', name: '本地改名', updatedAt: '2024-02-01T00:00:00.000Z', review: '本地评价' }),
  ]);
  const incoming = archive([
    makeBench({ id: 'a', name: '导入方改名', updatedAt: '2024-02-02T00:00:00.000Z', review: '导入方评价' }),
  ]);
  const result = mergeArchives(local, incoming);
  assert(result.benches.length === 1, '两边都动过不应产生重复长椅');
  const merged = result.benches[0];
  assert(merged.name === '导入方改名', '应保留较晚更新的值');
  assert(merged.pendingReview === true, '应挂待复核');
  assert(merged.conflict?.reason === 'both-modified', '冲突原因应为 both-modified');
  assert(merged.conflict?.otherVersion?.name === '本地改名', '应保留另一方的值');
  assert(result.stats.bothModified === 1, 'bothModified 计数正确');
}

// 3. 只有一边动过 → 直接并入，不挂待复核
{
  const base = makeBench({ id: 'a' });
  const local = archive([base]);
  const incoming = archive([
    makeBench({ id: 'a', name: '导入方改动', updatedAt: '2024-03-01T00:00:00.000Z' }),
  ]);
  const result = mergeArchives(local, incoming);
  assert(result.benches[0].name === '导入方改动', '只有一边动过应并入改动方');
  assert(!result.benches[0].pendingReview, '只有一边动过不应挂待复核');
  assert(result.stats.fastForwarded === 1, 'fastForwarded 计数正确');
}

// 4. 一边删除、另一边改过 → 保留并挂待复核
{
  const local = archive([
    makeBench({ id: 'a', name: '本地改过', updatedAt: '2024-02-01T00:00:00.000Z' }),
  ]);
  const incoming = archive([], [{ id: 'a', deletedAt: '2024-02-02T00:00:00.000Z' }]);
  const result = mergeArchives(local, incoming);
  assert(result.benches.length === 1, '一边删一边改应保留长椅');
  assert(result.benches[0].name === '本地改过', '保留改过的内容');
  assert(result.benches[0].pendingReview === true, '应挂待复核');
  assert(result.benches[0].conflict?.reason === 'deleted-vs-modified', '冲突原因应为 deleted-vs-modified');
  assert(result.stats.keptFromDeletion === 1, 'keptFromDeletion 计数正确');
}

// 5. 两边都删除 → 墓碑保留，长椅删除
{
  const local = archive([], [{ id: 'a', deletedAt: '2024-02-01T00:00:00.000Z' }]);
  const incoming = archive([], [{ id: 'a', deletedAt: '2024-02-02T00:00:00.000Z' }]);
  const result = mergeArchives(local, incoming);
  assert(result.benches.length === 0, '两边都删除不应保留长椅');
  assert(result.tombstones.length === 1, '应保留墓碑');
  assert(result.stats.deleted === 1, 'deleted 计数正确');
}

// 6. 材质/遮阴变更 → 体验需重新确认
{
  const local = archive([
    makeBench({ id: 'a', material: 'wood', shadeLevel: 'full', updatedAt: '2024-02-01T00:00:00.000Z' }),
  ]);
  const incoming = archive([
    makeBench({ id: 'a', material: 'metal', shadeLevel: 'none', updatedAt: '2024-02-02T00:00:00.000Z' }),
  ]);
  const result = mergeArchives(local, incoming);
  assert(result.benches[0].experiencesConfirmed === false, '材质/遮阴变更后体验应待确认');
}

// 7. 旧格式（裸数组）迁移
{
  const legacy = [
    {
      id: 'old-1',
      name: '旧格式长椅',
      location: '老街',
      material: 'stone',
      experiences: [{ id: 'e1', benchId: 'old-1', timePeriod: 'morning', notes: '晨', rating: 4 }],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
  ];
  const migrated = migrateArchive(legacy);
  assert(migrated.version === DATA_VERSION, '迁移后版本号正确');
  assert(migrated.benches.length === 1, '迁移后长椅数量正确');
  assert(migrated.benches[0].experiencesConfirmed === true, '历史数据体验默认已确认');
  assert(migrated.benches[0].pendingReview === false, '历史数据无待复核');
  assert(migrated.benches[0].experiences.length === 1, '体验记录保留');
  assert(Array.isArray(migrated.tombstones) && migrated.tombstones.length === 0, '墓碑为空');
}

// 8. 新格式迁移（幂等）
{
  const fresh = archive([makeBench({ id: 'a' })], [{ id: 'b', deletedAt: '2024-01-01T00:00:00.000Z' }]);
  const migrated = migrateArchive(fresh);
  assert(migrated.benches.length === 1 && migrated.tombstones.length === 1, '新格式迁移幂等');
}

// 9. 无法识别的格式应抛错
{
  let threw = false;
  try {
    migrateArchive({ foo: 'bar' });
  } catch {
    threw = true;
  }
  assert(threw, '无法识别的格式应抛错');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
