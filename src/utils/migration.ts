import type {
  Bench,
  BenchArchive,
  BenchExperience,
  BenchSnapshot,
  BenchTombstone,
  PendingReview,
  QuarantinedBench,
} from '@/types';

/**
 * 兼容旧版（v1）存储：
 * - 裸数组 Bench[]
 * - { benches: Bench[] } 包裹对象
 * 都会被迁移成 v2 档案。
 */

type LegacyExperience = Partial<BenchExperience> & {
  id?: string;
  benchId?: string;
  timePeriod?: BenchExperience['timePeriod'];
  notes?: string;
  rating?: number;
};

type LegacyBench = Partial<Bench> & {
  id?: string;
  code?: string;
  experiences?: LegacyExperience[];
  pendingReviews?: PendingReview[];
  experiencesConfirmed?: boolean;
};

interface LegacyWrapped {
  benches?: LegacyBench[];
  tombstones?: BenchTombstone[];
  quarantined?: QuarantinedBench[];
  base?: BenchSnapshot;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function migrateExperience(raw: LegacyExperience, benchId: string, index: number, fallbackTime: string): BenchExperience {
  return {
    id: raw.id ?? `${benchId}-exp-${index + 1}`,
    benchId,
    timePeriod: raw.timePeriod ?? 'afternoon',
    notes: raw.notes ?? '',
    rating: typeof raw.rating === 'number' ? raw.rating : 3,
    updatedAt: raw.updatedAt ?? fallbackTime,
  };
}

function migrateBench(raw: LegacyBench, index: number): Bench {
  const id = raw.id ?? `bench-${index + 1}`;
  const createdAt = raw.createdAt ?? new Date(0).toISOString();
  const updatedAt = raw.updatedAt ?? createdAt;
  const experiences = Array.isArray(raw.experiences)
    ? raw.experiences.map((exp, expIndex) => migrateExperience(exp, id, expIndex, updatedAt))
    : [];

  return {
    id,
    // 旧数据没有“长椅编号”，用原 id 兜底作为稳定合并键
    code: raw.code?.trim() || id,
    name: raw.name ?? '',
    location: raw.location ?? '',
    lat: typeof raw.lat === 'number' ? raw.lat : 0,
    lng: typeof raw.lng === 'number' ? raw.lng : 0,
    material: raw.material ?? 'wood',
    orientation: raw.orientation ?? 'south',
    hasBackrest: raw.hasBackrest ?? true,
    shadeLevel: raw.shadeLevel ?? 'partial',
    noiseLevel: raw.noiseLevel ?? 'moderate',
    stayDuration: raw.stayDuration ?? 'medium',
    rating: typeof raw.rating === 'number' ? raw.rating : 3,
    review: raw.review ?? '',
    experiences,
    // 历史数据的分时段体验视为已确认，不影响进排行
    experiencesConfirmed: raw.experiencesConfirmed ?? true,
    pendingReviews: Array.isArray(raw.pendingReviews) ? raw.pendingReviews : [],
    createdAt,
    updatedAt,
  };
}

/** 识别 v2 档案 */
export function isBenchArchive(value: unknown): value is BenchArchive {
  return isObject(value) && value.format === 'bench-archive-v2' && Array.isArray(value.benches);
}

/** 编号必须唯一：缺编号数据可能撞键，追加后缀保证合并键稳定 */
function ensureUniqueCodes(input: Bench[]): Bench[] {
  const seenCodes = new Set<string>();
  return input.map((bench) => {
    if (!seenCodes.has(bench.code)) {
      seenCodes.add(bench.code);
      return bench;
    }
    let suffix = 2;
    let code = `${bench.code}-${suffix}`;
    while (seenCodes.has(code)) {
      suffix += 1;
      code = `${bench.code}-${suffix}`;
    }
    seenCodes.add(code);
    return { ...bench, code };
  });
}

/**
 * 把任意受支持的历史数据迁移为 v2 档案。
 * 裸数组、{benches:[...]}、已是 v2 的数据都可以传入。
 */
export function migrateArchive(input: unknown): BenchArchive {
  if (isBenchArchive(input)) {
    return normalizeArchive(input);
  }

  let legacyBenches: LegacyBench[] = [];
  if (Array.isArray(input)) {
    legacyBenches = input as LegacyBench[];
  } else if (isObject(input) && Array.isArray((input as LegacyWrapped).benches)) {
    legacyBenches = (input as LegacyWrapped).benches as LegacyBench[];
  }

  const benches = ensureUniqueCodes(
    legacyBenches
      .filter((b): b is LegacyBench => isObject(b))
      .map((raw, index) => migrateBench(raw, index)),
  );

  return buildArchive(benches, [], []);
}

/** 规整一份 v2 档案，补齐缺失字段 */
export function normalizeArchive(input: BenchArchive): BenchArchive {
  const benches = ensureUniqueCodes(
    input.benches
      .filter((b): b is Bench => isObject(b))
      .map((raw, index) => migrateBench(raw as unknown as LegacyBench, index)),
  );
  const tombstones = Array.isArray(input.tombstones) ? input.tombstones : [];
  const quarantined = Array.isArray(input.quarantined) ? input.quarantined : [];
  const base = input.base
    ? {
        benches: Array.isArray(input.base.benches)
          ? ensureUniqueCodes(
              input.base.benches.map((raw, index) => migrateBench(raw as unknown as LegacyBench, index)),
            )
          : [],
        tombstones: Array.isArray(input.base.tombstones) ? input.base.tombstones : [],
      }
    : snapshotFrom(benches, tombstones);

  return {
    format: 'bench-archive-v2',
    exportedAt: input.exportedAt,
    exportedBy: input.exportedBy,
    benches,
    tombstones,
    quarantined,
    base,
  };
}

export function snapshotFrom(benches: Bench[], tombstones: BenchTombstone[]): BenchSnapshot {
  return {
    benches: benches.map((bench) => structuredCloneSafe(bench)),
    tombstones: tombstones.map((t) => ({ ...t })),
  };
}

export function buildArchive(
  benches: Bench[],
  tombstones: BenchTombstone[],
  quarantined: QuarantinedBench[],
  base?: BenchSnapshot,
): BenchArchive {
  return {
    format: 'bench-archive-v2',
    benches,
    tombstones,
    quarantined,
    base: base ?? snapshotFrom(benches, tombstones),
  };
}

/** structuredClone 在旧环境可能不可用时的 JSON 兜底 */
function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // fall through
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
