import {
  MATERIAL_LABELS,
  ORIENTATION_LABELS,
  SHADE_LABELS,
  NOISE_LABELS,
  STAY_DURATION_LABELS,
  TIME_PERIOD_LABELS,
  getFieldLabel,
} from '@/types';
import type { MaterialType, OrientationType, ShadeLevelType, NoiseLevelType, StayDurationType, TimePeriodType } from '@/types';

/** 把待复核 / 冲突条目的字段值转成可读文字 */
export function formatFieldValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '（空）';

  switch (field) {
    case 'material':
      return MATERIAL_LABELS[value as MaterialType] ?? String(value);
    case 'orientation':
      return ORIENTATION_LABELS[value as OrientationType] ?? String(value);
    case 'shadeLevel':
      return SHADE_LABELS[value as ShadeLevelType] ?? String(value);
    case 'noiseLevel':
      return NOISE_LABELS[value as NoiseLevelType] ?? String(value);
    case 'stayDuration':
      return STAY_DURATION_LABELS[value as StayDurationType] ?? String(value);
    case 'timePeriod':
      return TIME_PERIOD_LABELS[value as TimePeriodType] ?? String(value);
    case 'hasBackrest':
      return value ? '有靠背' : '无靠背';
    case 'rating':
      return `${value} 星`;
    case 'lat':
    case 'lng':
      return typeof value === 'number' ? value.toFixed(4) : String(value);
    default:
      return typeof value === 'string' ? value : JSON.stringify(value);
  }
}

export { getFieldLabel };
