export type MaterialType = 'wood' | 'metal' | 'stone' | 'plastic' | 'mixed';
export type OrientationType = 'east' | 'south' | 'west' | 'north' | 'southeast' | 'northeast' | 'southwest' | 'northwest';
export type ShadeLevelType = 'none' | 'partial' | 'full';
export type NoiseLevelType = 'quiet' | 'moderate' | 'noisy';
export type StayDurationType = 'short' | 'medium' | 'long' | 'verylong';
export type TimePeriodType = 'morning' | 'noon' | 'afternoon' | 'evening' | 'night';

/** 参与三路合并的长椅标量字段（id / 时间戳 / 合并辅助字段不在此列） */
export type BenchFieldKey =
  | 'name'
  | 'location'
  | 'lat'
  | 'lng'
  | 'material'
  | 'orientation'
  | 'hasBackrest'
  | 'shadeLevel'
  | 'noiseLevel'
  | 'stayDuration'
  | 'rating'
  | 'review';

export type ReviewStatus = 'open' | 'resolved';

/** 合并时保存下来、等待人工复核的另一边取值 */
export interface PendingReview {
  id: string;
  /** 冲突所在位置：长椅字段 或 某条分时段体验字段 */
  scope: 'bench' | 'experience';
  /** scope 为 experience 时，对应的体验 id */
  experienceId?: string;
  field: string;
  /** 两边时间较晚、目前已采用的取值 */
  keptValue: unknown;
  /** 另一边（较早）的取值，等待人工复核 */
  otherValue: unknown;
  /** 较早取值来自哪一边，便于展示 */
  otherSource: 'local' | 'incoming';
  keptUpdatedAt: string;
  otherUpdatedAt: string;
  createdAt: string;
  status: ReviewStatus;
}

export interface BenchExperience {
  id: string;
  benchId: string;
  timePeriod: TimePeriodType;
  notes: string;
  rating: number;
  updatedAt?: string;
}

export interface Bench {
  id: string;
  /** 长椅编号：离线分小队记录后合并用的稳定键 */
  code: string;
  name: string;
  location: string;
  lat: number;
  lng: number;
  material: MaterialType;
  orientation: OrientationType;
  hasBackrest: boolean;
  shadeLevel: ShadeLevelType;
  noiseLevel: NoiseLevelType;
  stayDuration: StayDurationType;
  rating: number;
  review: string;
  experiences: BenchExperience[];
  /** 分时段体验是否已确认；材质 / 遮阴变化后置为 false，未确认不进排行 */
  experiencesConfirmed: boolean;
  /** 字段冲突时保存的另一边取值，等待人工复核 */
  pendingReviews: PendingReview[];
  createdAt: string;
  updatedAt: string;
}

/** 已删除长椅的墓碑：用于识别“一边删除、另一边修改”的冲突 */
export interface BenchTombstone {
  code: string;
  deletedAt: string;
}

/** “一边删除、另一边修改”的长椅，先隔离出来等人工处理 */
export interface QuarantinedBench {
  code: string;
  /** 被改过、没有直接删除的那一版长椅 */
  bench: Bench;
  /** 删除发生在哪一边 */
  deleteSource: 'local' | 'incoming';
  reason: 'deleted-modified';
  createdAt: string;
  resolved: boolean;
}

export interface MergeReport {
  mergedAt: string;
  incomingName?: string;
  /** 直接并入的新增长椅数 */
  added: number;
  /** 合并后有更新的长椅数（含自动合并字段） */
  updated: number;
  /** 一边删除、未与修改冲突，已直接移除的长椅数 */
  removed: number;
  /** 两边都改、产生待复核条目的长椅数 */
  conflicts: number;
  /** 新增的待复核条目总数 */
  pendingReviews: number;
  /** 被隔离（删除 vs 修改）的长椅数 */
  quarantined: number;
}

/** 新格式档案（v2）：数据 + 上次同步基线 + 墓碑 + 隔离区 */
export interface BenchArchive {
  format: 'bench-archive-v2';
  exportedAt?: string;
  exportedBy?: string;
  benches: Bench[];
  tombstones: BenchTombstone[];
  quarantined: QuarantinedBench[];
  /** 上次合并 / 同步时的完整快照，作为下一次三路合并的共同基线 */
  base: BenchSnapshot;
}

/** 基线快照：当时的长椅与墓碑（隔离项不参与对端合并） */
export interface BenchSnapshot {
  benches: Bench[];
  tombstones: BenchTombstone[];
}

export const MATERIAL_LABELS: Record<MaterialType, string> = {
  wood: '木质',
  metal: '金属',
  stone: '石质',
  plastic: '塑料',
  mixed: '混合材质',
};

export const ORIENTATION_LABELS: Record<OrientationType, string> = {
  east: '东',
  south: '南',
  west: '西',
  north: '北',
  southeast: '东南',
  northeast: '东北',
  southwest: '西南',
  northwest: '西北',
};

export const SHADE_LABELS: Record<ShadeLevelType, string> = {
  none: '无遮阴',
  partial: '部分遮阴',
  full: '完全遮阴',
};

export const NOISE_LABELS: Record<NoiseLevelType, string> = {
  quiet: '安静',
  moderate: '一般',
  noisy: '嘈杂',
};

export const STAY_DURATION_LABELS: Record<StayDurationType, string> = {
  short: '少于15分钟',
  medium: '15-30分钟',
  long: '30-60分钟',
  verylong: '1小时以上',
};

export const TIME_PERIOD_LABELS: Record<TimePeriodType, string> = {
  morning: '早晨',
  noon: '中午',
  afternoon: '下午',
  evening: '傍晚',
  night: '夜晚',
};

export const TIME_PERIOD_ICONS: Record<TimePeriodType, string> = {
  morning: 'sunrise',
  noon: 'sun',
  afternoon: 'cloud-sun',
  evening: 'sunset',
  night: 'moon',
};

/** 待复核字段的中文名 */
export const FIELD_LABELS: Record<string, string> = {
  name: '名称',
  location: '位置',
  lat: '纬度',
  lng: '经度',
  material: '材质',
  orientation: '朝向',
  hasBackrest: '靠背',
  shadeLevel: '遮阴',
  noiseLevel: '噪音',
  stayDuration: '停留时长',
  rating: '综合评分',
  review: '评价',
  timePeriod: '时段',
  notes: '体验备注',
};

export function getFieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}
