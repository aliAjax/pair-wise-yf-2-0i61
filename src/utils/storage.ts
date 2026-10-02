import type { Bench, BenchArchive, BenchTombstone, QuarantinedBench } from '@/types';
import { buildArchive, migrateArchive } from '@/utils/migration';

const STORAGE_KEY = 'bench-archive-data';

/** 读取本机档案；旧格式（裸数组 / 包裹对象）会自动迁移为 v2 */
export function loadArchive(): BenchArchive | null {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      return migrateArchive(JSON.parse(data));
    }
  } catch (error) {
    console.error('Failed to load bench archive from localStorage:', error);
  }
  return null;
}

export function saveArchive(archive: BenchArchive): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(archive));
  } catch (error) {
    console.error('Failed to save bench archive to localStorage:', error);
  }
}

export function clearArchive(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear bench archive from localStorage:', error);
  }
}

/** 用一组长椅初始化一份全新档案（基线即当前数据） */
export function createArchiveFromBenches(benches: Bench[]): BenchArchive {
  const tombstones: BenchTombstone[] = [];
  const quarantined: QuarantinedBench[] = [];
  return buildArchive(benches, tombstones, quarantined);
}
