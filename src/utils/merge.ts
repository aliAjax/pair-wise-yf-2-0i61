import type { ArchiveFile, Bench, ConflictInfo, Tombstone } from '@/types';

export interface MergeStats {
  /** 只在导入方存在，直接并入 */
  added: number;
  /** 只在本地存在，保留 */
  unchanged: number;
  /** 两边都有且只有一边动过，直接并入 */
  fastForwarded: number;
  /** 两边都动过，留较晚值并挂起待复核 */
  bothModified: number;
  /** 一边删除、另一边改过，长椅保留待复核 */
  keptFromDeletion: number;
  /** 两边都删除（或仅一方有墓碑），确认删除 */
  deleted: number;
}

export interface MergeResult {
  benches: Bench[];
  tombstones: Tombstone[];
  stats: MergeStats;
}

const emptyStats = (): MergeStats => ({
  added: 0,
  unchanged: 0,
  fastForwarded: 0,
  bothModified: 0,
  keptFromDeletion: 0,
  deleted: 0,
});

/**
 * 按长椅编号合并两份档案。
 *
 * 规则：
 * - 只在一边存在（另一边既无记录也无墓碑）→ 直接并入；
 * - 两边都存在：
 *   - updatedAt 相同 → 视为同一版本，保留本地；
 *   - 只有一边 updatedAt !== createdAt（动过）→ 直接并入动过的版本；
 *   - 两边都动过 → 留 updatedAt 较晚的值，另一边的值挂为待复核；
 * - 一边有记录、另一边有墓碑（删除）→ 长椅保留并挂起待复核（一边删一边改，留出来）；
 * - 两边都有墓碑（或仅一方有墓碑、另一方无记录）→ 删除。
 */
export function mergeArchives(local: ArchiveFile, incoming: ArchiveFile): MergeResult {
  const localMap = new Map(local.benches.map((b) => [b.id, b]));
  const incomingMap = new Map(incoming.benches.map((b) => [b.id, b]));
  const localTombstones = new Map(local.tombstones.map((t) => [t.id, t]));
  const incomingTombstones = new Map(incoming.tombstones.map((t) => [t.id, t]));

  const resultBenches: Bench[] = [];
  const resultTombstones: Tombstone[] = [];
  const stats = emptyStats();
  const now = new Date().toISOString();

  const allIds = new Set<string>([
    ...localMap.keys(),
    ...incomingMap.keys(),
    ...localTombstones.keys(),
    ...incomingTombstones.keys(),
  ]);

  for (const id of allIds) {
    const l = localMap.get(id);
    const r = incomingMap.get(id);
    const lDel = localTombstones.get(id);
    const rDel = incomingTombstones.get(id);

    if (l && r) {
      if (l.updatedAt === r.updatedAt) {
        // 同一版本，保留本地
        resultBenches.push(l);
        stats.unchanged += 1;
        continue;
      }

      const lModified = l.updatedAt !== l.createdAt;
      const rModified = r.updatedAt !== r.createdAt;

      if (lModified && rModified) {
        // 两边都动过：留较晚的值，另一边挂待复核
        const [newer, older] = l.updatedAt >= r.updatedAt ? [l, r] : [r, l];
        const conflict: ConflictInfo = {
          reason: 'both-modified',
          otherVersion: older,
          detectedAt: now,
        };
        resultBenches.push({
          ...newer,
          pendingReview: true,
          conflict,
          // 材质或遮阴与另一边不同 → 分时段体验需重新确认
          experiencesConfirmed:
            newer.material === older.material && newer.shadeLevel === older.shadeLevel
              ? newer.experiencesConfirmed
              : false,
        });
        stats.bothModified += 1;
      } else {
        // 只在一边动过：直接并入动过的版本
        resultBenches.push(lModified ? l : r);
        stats.fastForwarded += 1;
      }
    } else if (l && rDel) {
      // 本地有记录，导入方删除了 → 留出来待复核
      resultBenches.push({
        ...l,
        pendingReview: true,
        conflict: { reason: 'deleted-vs-modified', otherVersion: null, detectedAt: now },
      });
      stats.keptFromDeletion += 1;
    } else if (r && lDel) {
      // 导入方有记录，本地删除了 → 留出来待复核
      resultBenches.push({
        ...r,
        pendingReview: true,
        conflict: { reason: 'deleted-vs-modified', otherVersion: null, detectedAt: now },
      });
      stats.keptFromDeletion += 1;
    } else if (l) {
      // 只在本地存在
      resultBenches.push(l);
      stats.unchanged += 1;
    } else if (r) {
      // 只在导入方存在 → 直接并入
      resultBenches.push(r);
      stats.added += 1;
    } else {
      // 两边都删除（或仅一方有墓碑）→ 确认删除
      resultTombstones.push(lDel ?? rDel ?? { id, deletedAt: now });
      stats.deleted += 1;
    }
  }

  return { benches: resultBenches, tombstones: resultTombstones, stats };
}
