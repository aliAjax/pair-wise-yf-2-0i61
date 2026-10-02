import { create } from 'zustand';
import type {
  Bench,
  BenchArchive,
  BenchExperience,
  BenchTombstone,
  MaterialType,
  MergeReport,
  OrientationType,
  QuarantinedBench,
  ShadeLevelType,
  NoiseLevelType,
} from '@/types';
import { loadArchive, saveArchive, createArchiveFromBenches } from '@/utils/storage';
import { migrateArchive } from '@/utils/migration';
import { mergeArchives } from '@/utils/merge';
import { generateId } from '@/utils/comfort';
import { mockBenches } from '@/data/mockBenches';

interface BenchState {
  benches: Bench[];
  tombstones: BenchTombstone[];
  quarantined: QuarantinedBench[];
  searchQuery: string;
  materialFilter: MaterialType | null;
  orientationFilter: OrientationType | null;
  shadeFilter: ShadeLevelType | null;
  noiseFilter: NoiseLevelType | null;
  initialized: boolean;
}

interface BenchActions {
  initialize: () => void;
  setSearchQuery: (query: string) => void;
  setMaterialFilter: (material: MaterialType | null) => void;
  setOrientationFilter: (orientation: OrientationType | null) => void;
  setShadeFilter: (shade: ShadeLevelType | null) => void;
  setNoiseFilter: (noise: NoiseLevelType | null) => void;
  clearFilters: () => void;
  addBench: (bench: Omit<Bench, 'id' | 'code' | 'createdAt' | 'updatedAt' | 'experiences' | 'experiencesConfirmed' | 'pendingReviews'>) => string;
  updateBench: (id: string, updates: Partial<Bench>) => void;
  deleteBench: (id: string) => void;
  getBenchById: (id: string) => Bench | undefined;
  addExperience: (benchId: string, experience: Omit<BenchExperience, 'id' | 'benchId'>) => void;
  updateExperience: (benchId: string, expId: string, updates: Partial<BenchExperience>) => void;
  deleteExperience: (benchId: string, expId: string) => void;
  confirmExperiences: (benchId: string) => void;
  resolvePendingReview: (benchId: string, reviewId: string, acceptOther: boolean) => void;
  removePendingReview: (benchId: string, reviewId: string) => void;
  restoreQuarantined: (code: string) => void;
  discardQuarantined: (code: string) => void;
  importArchive: (raw: string) => MergeReport;
  getFilteredBenches: () => Bench[];
}

const initialState: BenchState = {
  benches: [],
  tombstones: [],
  quarantined: [],
  searchQuery: '',
  materialFilter: null,
  orientationFilter: null,
  shadeFilter: null,
  noiseFilter: null,
  initialized: false,
};

/** 按现有编号生成下一个顺序编号（B0001、B0002…） */
function nextBenchCode(benches: Bench[], tombstones: BenchTombstone[]): string {
  let max = 0;
  for (const code of [...benches.map((b) => b.code), ...tombstones.map((t) => t.code)]) {
    const match = /^B(\d+)$/.exec(code.trim());
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  return `B${String(max + 1).padStart(4, '0')}`;
}

export const useBenchStore = create<BenchState & BenchActions>((set, get) => {
  /** 持久化当前数据；保留上次合并基线不动，供下次三路合并使用 */
  const persist = (state: Pick<BenchState, 'benches' | 'tombstones' | 'quarantined'>) => {
    const existing = loadArchive();
    const archive: BenchArchive = {
      format: 'bench-archive-v2',
      benches: state.benches,
      tombstones: state.tombstones,
      quarantined: state.quarantined,
      base: existing?.base ?? migrateArchive(state.benches).base,
    };
    saveArchive(archive);
  };

  return {
    ...initialState,

    initialize: () => {
      if (get().initialized) return;
      const stored = loadArchive();
      if (stored) {
        // 哪怕长椅都被删光（只剩墓碑），也是有效档案，不能回退到示例数据
        set({
          benches: stored.benches,
          tombstones: stored.tombstones,
          quarantined: stored.quarantined,
          initialized: true,
        });
      } else {
        const archive = createArchiveFromBenches(mockBenches);
        saveArchive(archive);
        set({
          benches: archive.benches,
          tombstones: archive.tombstones,
          quarantined: archive.quarantined,
          initialized: true,
        });
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
      const id = generateId();
      const code = nextBenchCode(get().benches, get().tombstones);
      const newBench: Bench = {
        ...benchData,
        id,
        code,
        experiences: [],
        experiencesConfirmed: true,
        pendingReviews: [],
        createdAt: now,
        updatedAt: now,
      };
      const benches = [newBench, ...get().benches];
      set({ benches });
      persist({ benches, tombstones: get().tombstones, quarantined: get().quarantined });
      return id;
    },

    updateBench: (id, updates) => {
      const now = new Date().toISOString();
      const benches = get().benches.map((bench) => {
        if (bench.id !== id) return bench;
        const next = { ...bench, ...updates, updatedAt: now };
        // 材质 / 遮阴一变，分时段体验需重新确认，未确认前不进排行
        if (
          (updates.material !== undefined && updates.material !== bench.material) ||
          (updates.shadeLevel !== undefined && updates.shadeLevel !== bench.shadeLevel)
        ) {
          next.experiencesConfirmed = false;
        }
        return next;
      });
      set({ benches });
      persist({ benches, tombstones: get().tombstones, quarantined: get().quarantined });
    },

    deleteBench: (id) => {
      const bench = get().benches.find((b) => b.id === id);
      const now = new Date().toISOString();
      const benches = get().benches.filter((b) => b.id !== id);
      // 留下墓碑：下次合并时才能识别“对方改过、本机已删”的冲突
      const tombstones = bench
        ? [...get().tombstones.filter((t) => t.code !== bench.code), { code: bench.code, deletedAt: now }]
        : get().tombstones;
      set({ benches, tombstones });
      persist({ benches, tombstones, quarantined: get().quarantined });
    },

    getBenchById: (id) => get().benches.find((bench) => bench.id === id),

    addExperience: (benchId, experienceData) => {
      const now = new Date().toISOString();
      const newExperience: BenchExperience = {
        ...experienceData,
        id: generateId(),
        benchId,
        updatedAt: now,
      };
      const benches = get().benches.map((bench) =>
        bench.id === benchId
          ? { ...bench, experiences: [...bench.experiences, newExperience], updatedAt: now }
          : bench,
      );
      set({ benches });
      persist({ benches, tombstones: get().tombstones, quarantined: get().quarantined });
    },

    updateExperience: (benchId, expId, updates) => {
      const now = new Date().toISOString();
      const benches = get().benches.map((bench) =>
        bench.id === benchId
          ? {
              ...bench,
              experiences: bench.experiences.map((exp) =>
                exp.id === expId ? { ...exp, ...updates, updatedAt: now } : exp,
              ),
              updatedAt: now,
            }
          : bench,
      );
      set({ benches });
      persist({ benches, tombstones: get().tombstones, quarantined: get().quarantined });
    },

    deleteExperience: (benchId, expId) => {
      const now = new Date().toISOString();
      const benches = get().benches.map((bench) =>
        bench.id === benchId
          ? { ...bench, experiences: bench.experiences.filter((exp) => exp.id !== expId), updatedAt: now }
          : bench,
      );
      set({ benches });
      persist({ benches, tombstones: get().tombstones, quarantined: get().quarantined });
    },

    confirmExperiences: (benchId) => {
      const benches = get().benches.map((bench) =>
        bench.id === benchId ? { ...bench, experiencesConfirmed: true } : bench,
      );
      set({ benches });
      persist({ benches, tombstones: get().tombstones, quarantined: get().quarantined });
    },

    resolvePendingReview: (benchId, reviewId, acceptOther) => {
      const benches = get().benches.map((bench) => {
        if (bench.id !== benchId) return bench;
        const review = bench.pendingReviews.find((r) => r.id === reviewId);
        if (!review) return bench;
        const next: Bench = { ...bench };
        if (acceptOther) {
          if (review.scope === 'bench') {
            (next as unknown as Record<string, unknown>)[review.field] = review.otherValue;
          } else if (review.experienceId) {
            next.experiences = bench.experiences.map((exp) =>
              exp.id === review.experienceId
                ? { ...exp, [review.field]: review.otherValue }
                : exp,
            );
          }
        }
        next.pendingReviews = bench.pendingReviews.filter((r) => r.id !== reviewId);
        return next;
      });
      set({ benches });
      persist({ benches, tombstones: get().tombstones, quarantined: get().quarantined });
    },

    removePendingReview: (benchId, reviewId) => {
      const benches = get().benches.map((bench) =>
        bench.id === benchId
          ? { ...bench, pendingReviews: bench.pendingReviews.filter((r) => r.id !== reviewId) }
          : bench,
      );
      set({ benches });
      persist({ benches, tombstones: get().tombstones, quarantined: get().quarantined });
    },

    restoreQuarantined: (code) => {
      const item = get().quarantined.find((q) => q.code === code);
      if (!item || get().benches.some((b) => b.code === code)) return;
      const benches = [item.bench, ...get().benches];
      const quarantined = get().quarantined.filter((q) => q.code !== code);
      const tombstones = get().tombstones.filter((t) => t.code !== code);
      set({ benches, quarantined, tombstones });
      persist({ benches, tombstones, quarantined });
    },

    discardQuarantined: (code) => {
      const now = new Date().toISOString();
      const quarantined = get().quarantined.filter((q) => q.code !== code);
      // 确认放弃：补一块墓碑，以后再合并也不会复活
      const tombstones = get().tombstones.some((t) => t.code === code)
        ? get().tombstones
        : [...get().tombstones, { code, deletedAt: now }];
      set({ quarantined, tombstones });
      persist({ benches: get().benches, tombstones, quarantined });
    },

    importArchive: (raw) => {
      const current: BenchArchive =
        loadArchive() ??
        createArchiveFromBenches(get().benches);
      const parsed = JSON.parse(raw);
      const { archive, report } = mergeArchives(current, parsed);
      saveArchive(archive);
      set({
        benches: archive.benches,
        tombstones: archive.tombstones,
        quarantined: archive.quarantined,
      });
      return report;
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
  };
});
