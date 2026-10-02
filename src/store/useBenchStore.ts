import { create } from 'zustand';
import type { Bench, BenchExperience, MaterialType, OrientationType, ShadeLevelType, NoiseLevelType, StayDurationType, ArchiveFile, Tombstone } from '@/types';
import { DATA_VERSION } from '@/types';
import { loadArchive, saveArchive } from '@/utils/storage';
import { generateId } from '@/utils/comfort';
import { mergeArchives } from '@/utils/merge';
import type { MergeResult } from '@/utils/merge';
import { migrateBench } from '@/utils/migrate';
import { mockBenches } from '@/data/mockBenches';

type NewBenchInput = Omit<Bench, 'id' | 'createdAt' | 'updatedAt' | 'experiences' | 'pendingReview' | 'experiencesConfirmed' | 'conflict'>;

interface BenchState {
  benches: Bench[];
  tombstones: Tombstone[];
  searchQuery: string;
  materialFilter: MaterialType | null;
  orientationFilter: OrientationType | null;
  shadeFilter: ShadeLevelType | null;
  noiseFilter: NoiseLevelType | null;
  initialized: boolean;
  lastMergeResult: MergeResult | null;
}

interface BenchActions {
  initialize: () => void;
  setSearchQuery: (query: string) => void;
  setMaterialFilter: (material: MaterialType | null) => void;
  setOrientationFilter: (orientation: OrientationType | null) => void;
  setShadeFilter: (shade: ShadeLevelType | null) => void;
  setNoiseFilter: (noise: NoiseLevelType | null) => void;
  clearFilters: () => void;
  addBench: (bench: NewBenchInput) => void;
  updateBench: (id: string, updates: Partial<Bench>) => void;
  deleteBench: (id: string) => void;
  getBenchById: (id: string) => Bench | undefined;
  addExperience: (benchId: string, experience: Omit<BenchExperience, 'id' | 'benchId'>) => void;
  updateExperience: (benchId: string, expId: string, updates: Partial<BenchExperience>) => void;
  deleteExperience: (benchId: string, expId: string) => void;
  getFilteredBenches: () => Bench[];
  /** 导入档案文件并与当前档案合并 */
  mergeArchiveFile: (incoming: ArchiveFile) => MergeResult;
  /** 处理合并冲突：保留当前版本或采用对方版本 */
  resolveConflict: (id: string, keep: 'current' | 'other') => void;
  /** 材质/遮阴变更后，确认分时段体验已重新确认 */
  confirmExperiences: (id: string) => void;
  clearMergeResult: () => void;
}

const initialState: BenchState = {
  benches: [],
  tombstones: [],
  searchQuery: '',
  materialFilter: null,
  orientationFilter: null,
  shadeFilter: null,
  noiseFilter: null,
  initialized: false,
  lastMergeResult: null,
};

function persist(benches: Bench[], tombstones: Tombstone[]) {
  saveArchive({
    version: DATA_VERSION,
    exportedAt: new Date().toISOString(),
    benches,
    tombstones,
  });
}

export const useBenchStore = create<BenchState & BenchActions>((set, get) => ({
  ...initialState,

  initialize: () => {
    const archive = loadArchive();
    if (archive.benches.length > 0 || archive.tombstones.length > 0) {
      set({ benches: archive.benches, tombstones: archive.tombstones, initialized: true });
    } else {
      const seeded = mockBenches.map((b) => migrateBench(b));
      set({ benches: seeded, tombstones: [], initialized: true });
      persist(seeded, []);
    }
  },

  setSearchQuery: (query) => set({ searchQuery: query }),
  setMaterialFilter: (material) => set({ materialFilter: material }),
  setOrientationFilter: (orientation) => set({ orientationFilter: orientation }),
  setShadeFilter: (shade) => set({ shadeFilter: shade }),
  setNoiseFilter: (noise) => set({ noiseFilter: noise }),

  clearFilters: () => set({
    searchQuery: '',
    materialFilter: null,
    orientationFilter: null,
    shadeFilter: null,
    noiseFilter: null,
  }),

  addBench: (benchData) => {
    const now = new Date().toISOString();
    const newBench: Bench = {
      ...benchData,
      id: generateId(),
      experiences: [],
      pendingReview: false,
      experiencesConfirmed: true,
      createdAt: now,
      updatedAt: now,
    };
    const newBenches = [newBench, ...get().benches];
    set({ benches: newBenches });
    persist(newBenches, get().tombstones);
  },

  updateBench: (id, updates) => {
    const oldBench = get().benches.find((bench) => bench.id === id);
    const materialChanged =
      oldBench !== undefined && updates.material !== undefined && updates.material !== oldBench.material;
    const shadeChanged =
      oldBench !== undefined && updates.shadeLevel !== undefined && updates.shadeLevel !== oldBench.shadeLevel;

    const newBenches = get().benches.map((bench) => {
      if (bench.id !== id) return bench;
      const next: Bench = {
        ...bench,
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      // 材质或遮阴一变，分时段体验需重新确认
      if (materialChanged || shadeChanged) {
        next.experiencesConfirmed = false;
      }
      return next;
    });
    set({ benches: newBenches });
    persist(newBenches, get().tombstones);
  },

  deleteBench: (id) => {
    const newBenches = get().benches.filter((bench) => bench.id !== id);
    const newTombstones = [
      ...get().tombstones.filter((tombstone) => tombstone.id !== id),
      { id, deletedAt: new Date().toISOString() },
    ];
    set({ benches: newBenches, tombstones: newTombstones });
    persist(newBenches, newTombstones);
  },

  getBenchById: (id) => {
    return get().benches.find((bench) => bench.id === id);
  },

  addExperience: (benchId, experienceData) => {
    const newExperience: BenchExperience = {
      ...experienceData,
      id: generateId(),
      benchId,
    };
    const newBenches = get().benches.map((bench) =>
      bench.id === benchId
        ? {
            ...bench,
            experiences: [...bench.experiences, newExperience],
            updatedAt: new Date().toISOString(),
          }
        : bench
    );
    set({ benches: newBenches });
    persist(newBenches, get().tombstones);
  },

  updateExperience: (benchId, expId, updates) => {
    const newBenches = get().benches.map((bench) =>
      bench.id === benchId
        ? {
            ...bench,
            experiences: bench.experiences.map((exp) =>
              exp.id === expId ? { ...exp, ...updates } : exp
            ),
            updatedAt: new Date().toISOString(),
          }
        : bench
    );
    set({ benches: newBenches });
    persist(newBenches, get().tombstones);
  },

  deleteExperience: (benchId, expId) => {
    const newBenches = get().benches.map((bench) =>
      bench.id === benchId
        ? {
            ...bench,
            experiences: bench.experiences.filter((exp) => exp.id !== expId),
            updatedAt: new Date().toISOString(),
          }
        : bench
    );
    set({ benches: newBenches });
    persist(newBenches, get().tombstones);
  },

  getFilteredBenches: () => {
    const { benches, searchQuery, materialFilter, orientationFilter, shadeFilter, noiseFilter } = get();

    return benches.filter((bench) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchName = bench.name.toLowerCase().includes(query);
        const matchLocation = bench.location.toLowerCase().includes(query);
        const matchReview = bench.review.toLowerCase().includes(query);
        if (!matchName && !matchLocation && !matchReview) return false;
      }

      if (materialFilter && bench.material !== materialFilter) return false;
      if (orientationFilter && bench.orientation !== orientationFilter) return false;
      if (shadeFilter && bench.shadeLevel !== shadeFilter) return false;
      if (noiseFilter && bench.noiseLevel !== noiseFilter) return false;

      return true;
    });
  },

  mergeArchiveFile: (incoming) => {
    const current: ArchiveFile = {
      version: DATA_VERSION,
      exportedAt: new Date().toISOString(),
      benches: get().benches,
      tombstones: get().tombstones,
    };
    const result = mergeArchives(current, incoming);
    set({ benches: result.benches, tombstones: result.tombstones, lastMergeResult: result });
    persist(result.benches, result.tombstones);
    return result;
  },

  resolveConflict: (id, keep) => {
    const bench = get().benches.find((b) => b.id === id);
    if (!bench || !bench.conflict) return;

    let resolved: Bench;
    if (keep === 'other' && bench.conflict.otherVersion) {
      const other = bench.conflict.otherVersion;
      resolved = {
        ...other,
        id: bench.id,
        createdAt: bench.createdAt,
        pendingReview: false,
        conflict: undefined,
      };
    } else {
      resolved = { ...bench, pendingReview: false, conflict: undefined };
    }

    const newBenches = get().benches.map((b) => (b.id === id ? resolved : b));
    set({ benches: newBenches });
    persist(newBenches, get().tombstones);
  },

  confirmExperiences: (id) => {
    const newBenches = get().benches.map((bench) =>
      bench.id === id ? { ...bench, experiencesConfirmed: true } : bench
    );
    set({ benches: newBenches });
    persist(newBenches, get().tombstones);
  },

  clearMergeResult: () => set({ lastMergeResult: null }),
}));
