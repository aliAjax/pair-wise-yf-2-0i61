/**
 * 端到端：模拟两名队员从同一基线分头离线记录，回来依次合并的完整流程。
 */
import { migrateArchive } from '../src/utils/migration';
import { mergeArchives } from '../src/utils/merge';
import type { Bench } from '../src/types';

let passed = 0;
let failed = 0;
function assert(cond: boolean, message: string) {
  if (cond) { passed += 1; } else { failed += 1; console.error('  ✗ ' + message); }
}

function bench(overrides: Partial<Bench> & { code: string }): Bench {
  return {
    id: 'id-' + overrides.code,
    name: overrides.code,
    location: '',
    lat: 0, lng: 0,
    material: 'wood',
    orientation: 'south',
    hasBackrest: true,
    shadeLevel: 'full',
    noiseLevel: 'quiet',
    stayDuration: 'medium',
    rating: 3,
    review: '',
    experiences: [],
    experiencesConfirmed: true,
    pendingReviews: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

// 出发前的共同档案：两张长椅
const shared = migrateArchive([
  bench({ code: 'B0001', name: '湖畔椅' }),
  bench({ code: 'B0002', name: '枫树下' }),
]);

// 甲乙各拿一份副本离线
let alice = migrateArchive(shared);
let bob = migrateArchive(shared);

// 甲：把 B0001 的名字改了，删掉 B0002（留墓碑），新增 B0003
alice.benches = [
  bench({ code: 'B0001', name: '湖畔椅（甲改名）', updatedAt: '2024-05-01T08:00:00Z' }),
  bench({ code: 'B0003', name: '甲发现的石桥椅', updatedAt: '2024-05-01T09:00:00Z' }),
];
alice.tombstones = [{ code: 'B0002', deletedAt: '2024-05-01T10:00:00Z' }];

// 乙：把 B0001 的评分改成 5，并把 B0002 的材质改成 stone（乙改过这张）
bob.benches = [
  bench({ code: 'B0001', name: '湖畔椅', rating: 5, updatedAt: '2024-05-02T08:00:00Z' }),
  bench({ code: 'B0002', name: '枫树下', material: 'stone', shadeLevel: 'partial', updatedAt: '2024-05-02T09:00:00Z' }),
];

// 甲先导入乙的档案
const merge1 = mergeArchives(alice, bob);
alice = merge1.archive;

assert(merge1.report.added === 0, '乙没有新增长椅（B0002 是共同基线里的）');
const b1 = alice.benches.find((x) => x.code === 'B0001')!;
assert(b1.name === '湖畔椅（甲改名）' && b1.rating === 5, 'B0001：甲的名字 + 乙的评分自动合并');
assert(b1.pendingReviews.length === 0, '两人改的是不同字段，无待复核');

// B0002：甲删了、乙改了 → 隔离
const q = alice.quarantined.find((x) => x.code === 'B0002');
assert(!!q, 'B0002 删除 vs 修改进入隔离区');
assert(q?.bench.material === 'stone', '隔离的是乙改过（石材）的版本');
assert(q?.deleteSource === 'local', '删除来自甲（本机）');
assert(!alice.benches.some((x) => x.code === 'B0002'), '隔离项不在正常列表');

// B0003 是甲自己新增的，合并后仍在
assert(alice.benches.some((x) => x.code === 'B0003'), '甲自己新增的 B0003 保留');

// 甲裁决：保留乙对 B0002 的改动 → 恢复
alice.benches.unshift(q!.bench);
alice.quarantined = alice.quarantined.filter((x) => x.code !== 'B0002');
alice.tombstones = alice.tombstones.filter((t) => t.code !== 'B0002');

// 现在乙再导入甲合并后的档案（模拟交换档案的反向合并）
const merge2 = mergeArchives(bob, alice);
bob = merge2.archive;
const bobB2 = bob.benches.find((x) => x.code === 'B0002');
assert(!!bobB2 && bobB2.material === 'stone', '反向合并后乙也看到被恢复的 B0002');
assert(bob.benches.some((x) => x.code === 'B0003'), '乙得到甲新增的 B0003');
assert(merge2.report.pendingReviews === 0, '基线已推进，无重复冲突');

// 乙改了 B0002 遮阴 partial，合并时材质由 wood→stone 且遮阴由 full→partial（相对基线）
assert(bobB2?.experiencesConfirmed === false, 'B0002 材质遮阴都变，体验标记为待确认');

// 乙把这张的体验确认后，不应再被排掉
bob.benches = bob.benches.map((x) => (x.code === 'B0002' ? { ...x, experiencesConfirmed: true } : x));
const confirmed = bob.benches.every((x) => x.experiencesConfirmed);
assert(confirmed, '确认后所有长椅均可进排行');

console.log(`\nE2E: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
