import type { ArchiveFile, Bench, Tombstone } from '@/types';
import { DATA_VERSION } from '@/types';

/** 补全长椅在新格式中新增的字段 */
export function migrateBench(bench: Partial<Bench>): Bench {
  return {
    id: bench.id ?? '',
    name: bench.name ?? '',
    location: bench.location ?? '',
    lat: bench.lat ?? 0,
    lng: bench.lng ?? 0,
    material: bench.material ?? 'wood',
    orientation: bench.orientation ?? 'south',
    hasBackrest: bench.hasBackrest ?? false,
    shadeLevel: bench.shadeLevel ?? 'partial',
    noiseLevel: bench.noiseLevel ?? 'moderate',
    stayDuration: bench.stayDuration ?? 'medium',
    rating: bench.rating ?? 3,
    review: bench.review ?? '',
    experiences: Array.isArray(bench.experiences) ? bench.experiences : [],
    createdAt: bench.createdAt ?? new Date(0).toISOString(),
    updatedAt: bench.updatedAt ?? bench.createdAt ?? new Date(0).toISOString(),
    // 历史数据没有合并概念，默认无待复核
    pendingReview: bench.pendingReview ?? false,
    conflict: bench.conflict,
    // 历史数据的分时段体验视为已确认（材质/遮阴未发生过变更）
    experiencesConfirmed: bench.experiencesConfirmed ?? true,
  };
}

/**
 * 将任意历史档案数据迁移为新格式 ArchiveFile。
 * 支持：
 * - v1：裸长椅数组（单份历史数据）
 * - v2：{ version, benches, tombstones } 档案文件
 */
export function migrateArchive(data: unknown): ArchiveFile {
  const now = new Date().toISOString();

  if (Array.isArray(data)) {
    return {
      version: DATA_VERSION,
      exportedAt: now,
      benches: (data as Partial<Bench>[]).map(migrateBench),
      tombstones: [],
    };
  }

  if (data && typeof data === 'object' && Array.isArray((data as ArchiveFile).benches)) {
    const archive = data as Partial<ArchiveFile>;
    return {
      version: DATA_VERSION,
      exportedAt: archive.exportedAt ?? now,
      benches: (archive.benches as Partial<Bench>[]).map(migrateBench),
      tombstones: Array.isArray(archive.tombstones)
        ? (archive.tombstones as Partial<Tombstone>[]).filter(
            (t): t is Tombstone => !!t && typeof t.id === 'string'
          ).map((t) => ({ id: t.id, deletedAt: t.deletedAt ?? now }))
        : [],
    };
  }

  throw new Error('无法识别的档案格式');
}
