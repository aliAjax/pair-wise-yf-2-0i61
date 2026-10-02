import type {
  Bench,
  BenchArchive,
  BenchExperience,
  BenchFieldKey,
  BenchSnapshot,
  BenchTombstone,
  MergeReport,
  PendingReview,
  QuarantinedBench,
} from '@/types';
import { migrateArchive, snapshotFrom } from '@/utils/migration';
import { generateId } from '@/utils/comfort';

export interface MergeResult {
  archive: BenchArchive;
  report: MergeReport;
}

/** 参与三路合并的长椅标量字段 */
const BENCH_FIELDS: BenchFieldKey[] = [
  'name',
  'location',
  'lat',
  'lng',
  'material',
  'orientation',
  'hasBackrest',
  'shadeLevel',
  'noiseLevel',
  'stayDuration',
  'rating',
  'review',
];

/** 参与合并的分时段体验字段 */
const EXPERIENCE_FIELDS = ['timePeriod', 'rating', 'notes'] as const;
type ExperienceField = (typeof EXPERIENCE_FIELDS)[number];

/** 这些字段一变，旧的分时段体验就要重新确认 */
const SENSITIVE_FIELDS = new Set<BenchFieldKey>(['material', 'shadeLevel']);
const SENSITIVE_FIELDS_DELTA: BenchFieldKey[] = ['material', 'shadeLevel'];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function benchTime(bench: Bench): number {
  const t = Date.parse(bench.updatedAt);
  return Number.isNaN(t) ? 0 : t;
}

function experienceTime(exp: BenchExperience, bench: Bench): number {
  const t = Date.parse(exp.updatedAt ?? bench.updatedAt);
  return Number.isNaN(t) ? benchTime(bench) : t;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

function setBenchField(bench: Bench, field: BenchFieldKey, value: unknown): void {
  (bench as unknown as Record<string, unknown>)[field] = value;
}

function byCode(benches: Bench[]): Map<string, Bench> {
  return new Map(benches.map((bench) => [bench.code, bench]));
}

function byId(experiences: BenchExperience[]): Map<string, BenchExperience> {
  return new Map(experiences.map((exp) => [exp.id, exp]));
}

function tombstoneMap(tombstones: BenchTombstone[]): Map<string, BenchTombstone> {
  return new Map(tombstones.map((t) => [t.code, t]));
}

function changed(base: unknown, current: unknown, hasBase: boolean): boolean {
  // 没有共同基线时，只能认为双方都各自改过
  return !hasBase || !deepEqual(base, current);
}

/**
 * 合并同一编号下、两边都存在的长椅。
 * 字段级三路合并：只一边改 → 直接取；两边都改 → 时间晚的生效，早的挂待复核。
 */
function mergeBenchPair(
  local: Bench,
  incoming: Bench,
  base: Bench | undefined,
  now: string,
): { bench: Bench; newPending: PendingReview[] } {
  const hasBase = !!base;
  const localLater = benchTime(local) >= benchTime(incoming);
  // 以较晚一版为骨架，保留 id / 时间戳等
  const winner = localLater ? local : incoming;
  const merged = clone(winner);
  merged.id = winner.id;
  merged.code = winner.code;

  const newPending: PendingReview[] = [];
  let sensitiveChanged = false;

  for (const field of BENCH_FIELDS) {
    const lv = local[field];
    const iv = incoming[field];
    const bv = base?.[field];

    if (deepEqual(lv, iv)) {
      setBenchField(merged, field, lv);
      continue;
    }

    const localChanged = changed(bv, lv, hasBase);
    const incomingChanged = changed(bv, iv, hasBase);

    if (localChanged && incomingChanged) {
      // 两边都动过：留时间较晚的值，另一边挂待复核
      const keptValue = localLater ? lv : iv;
      const otherValue = localLater ? iv : lv;
      setBenchField(merged, field, keptValue);
      newPending.push({
        id: generateId(),
        scope: 'bench',
        field,
        keptValue: clone(keptValue),
        otherValue: clone(otherValue),
        otherSource: localLater ? 'incoming' : 'local',
        keptUpdatedAt: localLater ? local.updatedAt : incoming.updatedAt,
        otherUpdatedAt: localLater ? incoming.updatedAt : local.updatedAt,
        createdAt: now,
        status: 'open',
      });
    } else if (localChanged) {
      setBenchField(merged, field, lv);
    } else {
      setBenchField(merged, field, iv);
    }

    if (SENSITIVE_FIELDS.has(field) && hasBase && !deepEqual(merged[field], bv)) {
      sensitiveChanged = true;
    }
    if (SENSITIVE_FIELDS.has(field) && !hasBase && !deepEqual(lv, iv)) {
      sensitiveChanged = true;
    }
  }

  // 分时段体验按体验 id 做同样的三路合并
  const { experiences, expPending } = mergeExperiences(local, incoming, base, merged.id);
  newPending.push(...expPending);
  merged.experiences = experiences;

  // 沿续两边之前留下的待复核（去掉指向已不存在体验的悬空条目），再叠加新冲突
  const expIds = new Set(experiences.map((exp) => exp.id));
  const carried = [...local.pendingReviews, ...incoming.pendingReviews].filter(
    (item, index, arr) =>
      arr.findIndex((other) => other.id === item.id) === index &&
      (item.scope !== 'experience' || (item.experienceId !== undefined && expIds.has(item.experienceId))),
  );
  merged.pendingReviews = [...carried, ...newPending];

  // 材质 / 遮阴一变，分时段体验需重新确认；任一方原本就未确认也保持未确认
  merged.experiencesConfirmed =
    local.experiencesConfirmed && incoming.experiencesConfirmed && !sensitiveChanged;

  merged.createdAt = [local.createdAt, incoming.createdAt]
    .sort()
    .find((v) => v !== undefined) ?? winner.createdAt;
  merged.updatedAt = benchTime(local) >= benchTime(incoming) ? local.updatedAt : incoming.updatedAt;

  return { bench: merged, newPending };
}

/**
 * 体验合并：
 * - 两边都有：字段级三路合并，两边都改同一字段时晚的生效、早的挂待复核；
 * - 只在一边：若另一边在基线里有且删除了它，仅当留存版没改过才删除，否则保留改动。
 */
function mergeExperiences(
  local: Bench,
  incoming: Bench,
  base: Bench | undefined,
  finalBenchId: string,
): { experiences: BenchExperience[]; expPending: PendingReview[] } {
  const lm = byId(local.experiences);
  const im = byId(incoming.experiences);
  const bm = byId(base?.experiences ?? []);
  const expPending: PendingReview[] = [];
  const result: BenchExperience[] = [];

  const allIds = new Set<string>([...lm.keys(), ...im.keys()]);

  for (const expId of allIds) {
    const le = lm.get(expId);
    const ie = im.get(expId);
    const be = bm.get(expId);

    if (le && ie) {
      const localLater = experienceTime(le, local) >= experienceTime(ie, incoming);
      const mergedExp: BenchExperience = {
        id: expId,
        benchId: finalBenchId,
        timePeriod: le.timePeriod,
        notes: le.notes,
        rating: le.rating,
        updatedAt: localLater ? le.updatedAt ?? local.updatedAt : ie.updatedAt ?? incoming.updatedAt,
      };

      for (const field of EXPERIENCE_FIELDS) {
        const lv = le[field];
        const iv = ie[field];
        const bv = be?.[field];
        if (deepEqual(lv, iv)) {
          (mergedExp as Record<ExperienceField, unknown>)[field] = clone(lv);
          continue;
        }
        const localChanged = changed(bv, lv, !!be);
        const incomingChanged = changed(bv, iv, !!be);
        if (localChanged && incomingChanged) {
          const keptValue = localLater ? lv : iv;
          const otherValue = localLater ? iv : lv;
          (mergedExp as Record<ExperienceField, unknown>)[field] = clone(keptValue);
          expPending.push({
            id: generateId(),
            scope: 'experience',
            experienceId: expId,
            field,
            keptValue: clone(keptValue),
            otherValue: clone(otherValue),
            otherSource: localLater ? 'incoming' : 'local',
            keptUpdatedAt: localLater ? le.updatedAt ?? local.updatedAt : ie.updatedAt ?? incoming.updatedAt,
            otherUpdatedAt: localLater ? ie.updatedAt ?? incoming.updatedAt : le.updatedAt ?? local.updatedAt,
            createdAt: new Date().toISOString(),
            status: 'open',
          });
        } else if (localChanged) {
          (mergedExp as Record<ExperienceField, unknown>)[field] = clone(lv);
        } else {
          (mergedExp as Record<ExperienceField, unknown>)[field] = clone(iv);
        }
      }
      result.push(mergedExp);
      continue;
    }

    const only = le ?? ie;
    const onlySide: 'local' | 'incoming' = le ? 'local' : 'incoming';
    if (!only) continue;

    const otherDeleted = !be ? false : (onlySide === 'local' ? !im.has(expId) : !lm.has(expId));
    if (otherDeleted && be) {
      const onlyUnchanged = EXPERIENCE_FIELDS.every((field) => deepEqual(only[field], be[field]));
      // 留存版改过就保留（删除 vs 修改不丢数据），没改过则尊重删除
      if (onlyUnchanged) continue;
    }
    result.push({ ...clone(only), benchId: finalBenchId });
  }

  // 维持创建顺序的稳定排序（基线 / 本地 / 对方）
  const order = new Map<string, number>();
  [...(base?.experiences ?? []), ...local.experiences, ...incoming.experiences].forEach((exp, i) => {
    if (!order.has(exp.id)) order.set(exp.id, i);
  });
  result.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return { experiences: result, expPending };
}

/**
 * 三路合并两份档案。
 * local：本机当前档案；incomingData：导入的档案（v2 / v1 包裹对象 / 裸数组均可）。
 */
export function mergeArchives(
  local: BenchArchive,
  incomingData: unknown,
  now: string = new Date().toISOString(),
): MergeResult {
  const incoming = migrateArchive(incomingData);

  const localMap = byCode(local.benches);
  const incomingMap = byCode(incoming.benches);
  const baseMap = byCode(local.base.benches);
  const localTombs = tombstoneMap(local.tombstones);
  const incomingTombs = tombstoneMap(incoming.tombstones);

  const mergedBenches: Bench[] = [];
  const quarantined: QuarantinedBench[] = [...local.quarantined];
  const quarantineCodes = new Set(quarantined.map((q) => q.code));
  const resultTombs = new Map<string, BenchTombstone>();

  const report: MergeReport = {
    mergedAt: now,
    incomingName: incoming.exportedBy,
    added: 0,
    updated: 0,
    removed: 0,
    conflicts: 0,
    pendingReviews: 0,
    quarantined: 0,
  };

  const rememberTomb = (code: string, deletedAt: string) => {
    const existing = resultTombs.get(code);
    if (!existing || Date.parse(deletedAt) > Date.parse(existing.deletedAt)) {
      resultTombs.set(code, { code, deletedAt });
    }
  };

  const allCodes = new Set<string>([
    ...localMap.keys(),
    ...incomingMap.keys(),
    ...localTombs.keys(),
    ...incomingTombs.keys(),
    ...baseMap.keys(),
  ]);

  for (const code of allCodes) {
    const l = localMap.get(code);
    const i = incomingMap.get(code);
    const b = baseMap.get(code);
    const lt = localTombs.get(code);
    const it = incomingTombs.get(code);

    if (l && i) {
      // 两边都在：字段级合并
      const { bench, newPending } = mergeBenchPair(l, i, b, now);
      mergedBenches.push(bench);
      if (!deepEqual(stripMergeState(l), stripMergeState(bench))) {
        report.updated += 1;
      }
      if (newPending.length > 0) {
        report.conflicts += 1;
        report.pendingReviews += newPending.length;
      }
      continue;
    }

    const only = l ?? i;
    if (!only) {
      // 两边都没这张长椅：保留删除墓碑
      if (lt || it) {
        rememberTomb(code, lt && it ? (lt.deletedAt >= it.deletedAt ? lt.deletedAt : it.deletedAt) : (lt ?? it)!.deletedAt);
      }
      continue;
    }

    const onlySideIsLocal = !!l;
    const otherTomb = onlySideIsLocal ? it : lt;
    const wasInBase = !!b;

    if (otherTomb && wasInBase) {
      // 另一边删了，这一边还留着
      const onlyChanged = benchChangedSinceBase(only, b);
      if (onlyChanged) {
        // 一边删除、另一边又改过：隔离，不自动取舍
        if (!quarantineCodes.has(code)) {
          const quarantinedBench = clone(only);
          if (SENSITIVE_FIELDS_DELTA.some((field) => !deepEqual(quarantinedBench[field], b[field]))) {
            quarantinedBench.experiencesConfirmed = false;
          }
          quarantined.push({
            code,
            bench: quarantinedBench,
            deleteSource: onlySideIsLocal ? 'incoming' : 'local',
            reason: 'deleted-modified',
            createdAt: now,
            resolved: false,
          });
          quarantineCodes.add(code);
          report.quarantined += 1;
        }
        continue;
      }
      // 留着的一边没改过：尊重删除
      if (onlySideIsLocal) report.removed += 1;
      rememberTomb(code, otherTomb.deletedAt);
      continue;
    }

    // 另一边没有有效删除（无共同基线或只是缺记录）：留着的一边直接并入
    const keptOnly = clone(only);
    // 相对共同基线改过材质 / 遮阴（哪怕另一边是删除），分时段体验同样要重新确认
    if (b && SENSITIVE_FIELDS_DELTA.some((field) => !deepEqual(keptOnly[field], b[field]))) {
      keptOnly.experiencesConfirmed = false;
    }
    mergedBenches.push(keptOnly);
    if (!onlySideIsLocal) report.added += 1;
  }

  // 合并对方档案里带过来的隔离项（本机没有的）
  for (const q of incoming.quarantined) {
    if (!quarantineCodes.has(q.code) && !localMap.has(q.code) && !incomingMap.has(q.code)) {
      quarantined.push(clone(q));
      quarantineCodes.add(q.code);
    }
  }

  // 隔离项不允许同时带墓碑
  for (const code of quarantineCodes) {
    resultTombs.delete(code);
  }

  // 排序：沿用本机顺序，新到的排后面
  const localOrder = new Map(local.benches.map((bench, index) => [bench.code, index]));
  mergedBenches.sort((a, b2) => {
    const ao = localOrder.get(a.code);
    const bo = localOrder.get(b2.code);
    if (ao === undefined && bo === undefined) return 0;
    if (ao === undefined) return 1;
    if (bo === undefined) return -1;
    return ao - bo;
  });

  const base: BenchSnapshot = snapshotFrom(mergedBenches, [...resultTombs.values()]);

  const archive: BenchArchive = {
    format: 'bench-archive-v2',
    benches: mergedBenches,
    tombstones: [...resultTombs.values()],
    quarantined,
    base,
  };

  return { archive, report };
}

/** 比较时忽略待复核等合并辅助状态，只看档案内容是否变化 */
function stripMergeState(bench: Bench): Omit<Bench, 'pendingReviews'> {
  const { pendingReviews, ...rest } = bench;
  void pendingReviews;
  return rest;
}

/** 只在一边存在的长椅，相对共同基线是否被改过（标量字段或体验） */
function benchChangedSinceBase(bench: Bench, base: Bench | undefined): boolean {
  if (!base) return true;
  if (BENCH_FIELDS.some((field) => !deepEqual(bench[field], base[field]))) return true;

  const bm = byId(base.experiences);
  // 新增了体验，或体验内容 / 时间有变
  for (const exp of bench.experiences) {
    const be = bm.get(exp.id);
    if (!be) return true;
    if (EXPERIENCE_FIELDS.some((field) => !deepEqual(exp[field], be[field]))) return true;
  }
  // 基线里的体验被删掉也算改过
  if (bench.experiences.length !== base.experiences.length) return true;
  return false;
}
