export type MaterialType = 'wood' | 'metal' | 'stone' | 'plastic' | 'mixed';
export type OrientationType = 'east' | 'south' | 'west' | 'north' | 'southeast' | 'northeast' | 'southwest' | 'northwest';
export type ShadeLevelType = 'none' | 'partial' | 'full';
export type NoiseLevelType = 'quiet' | 'moderate' | 'noisy';
export type StayDurationType = 'short' | 'medium' | 'long' | 'verylong';
export type TimePeriodType = 'morning' | 'noon' | 'afternoon' | 'evening' | 'night';

/** 档案格式版本：v1 为裸长椅数组，v2 为带版本号的档案文件（含墓碑） */
export const DATA_VERSION = 2;

export interface BenchExperience {
  id: string;
  benchId: string;
  timePeriod: TimePeriodType;
  notes: string;
  rating: number;
}

/** 合并冲突信息：记录另一边的值与冲突原因，供人工复核 */
export interface ConflictInfo {
  reason: 'both-modified' | 'deleted-vs-modified';
  /** 另一边的长椅快照；删除方无快照时为 null */
  otherVersion: Bench | null;
  detectedAt: string;
}

export interface Bench {
  id: string;
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
  createdAt: string;
  updatedAt: string;
  /** 合并后待人工复核（两边都改过 / 一边删一边改） */
  pendingReview: boolean;
  /** 冲突详情 */
  conflict?: ConflictInfo;
  /** 分时段体验是否已确认；材质或遮阴变更后需重新确认，未确认前不进排行 */
  experiencesConfirmed: boolean;
}

/** 墓碑：记录已删除的长椅，用于合并时区分"真删除"与"这边没有" */
export interface Tombstone {
  id: string;
  deletedAt: string;
}

/** 档案文件（v2 格式） */
export interface ArchiveFile {
  version: number;
  exportedAt: string;
  benches: Bench[];
  tombstones: Tombstone[];
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

export const CONFLICT_REASON_LABELS: Record<NonNullable<ConflictInfo['reason']>, string> = {
  'both-modified': '两边都修改过这张长椅',
  'deleted-vs-modified': '一边删除了长椅，另一边做了修改',
};
