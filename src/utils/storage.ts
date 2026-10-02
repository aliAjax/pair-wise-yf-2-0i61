import type { ArchiveFile, Bench } from '@/types';
import { DATA_VERSION } from '@/types';
import { migrateArchive } from './migrate';

const STORAGE_KEY = 'bench-archive-data';

function emptyArchive(): ArchiveFile {
  return {
    version: DATA_VERSION,
    exportedAt: new Date().toISOString(),
    benches: [],
    tombstones: [],
  };
}

export function loadArchive(): ArchiveFile {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      return migrateArchive(JSON.parse(data));
    }
  } catch (error) {
    console.error('Failed to load archive from localStorage:', error);
  }
  return emptyArchive();
}

export function saveArchive(archive: ArchiveFile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(archive));
  } catch (error) {
    console.error('Failed to save archive to localStorage:', error);
  }
}

/** 兼容旧调用：仅返回长椅列表 */
export function loadBenches(): Bench[] {
  return loadArchive().benches;
}

/** 兼容旧调用：仅保存长椅列表（保留已有墓碑） */
export function saveBenches(benches: Bench[]): void {
  const current = loadArchive();
  saveArchive({ ...current, exportedAt: new Date().toISOString(), benches });
}

export function clearArchive(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear archive from localStorage:', error);
  }
}
