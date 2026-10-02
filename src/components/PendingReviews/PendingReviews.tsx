import { AlertTriangle, Check, X, History } from 'lucide-react';
import { TIME_PERIOD_LABELS } from '@/types';
import type { Bench, PendingReview } from '@/types';
import { useBenchStore } from '@/store/useBenchStore';
import { formatFieldValue, getFieldLabel } from '@/utils/format';

interface PendingReviewsPanelProps {
  bench: Bench;
}

function SourceTag({ source }: { source: PendingReview['otherSource'] }) {
  return (
    <span className="text-xs px-1.5 py-0.5 rounded bg-warm-beige text-ink-light">
      {source === 'local' ? '本机旧值' : '导入旧值'}
    </span>
  );
}

export default function PendingReviewsPanel({ bench }: PendingReviewsPanelProps) {
  const resolvePendingReview = useBenchStore((state) => state.resolvePendingReview);
  const removePendingReview = useBenchStore((state) => state.removePendingReview);

  const openReviews = bench.pendingReviews.filter((review) => review.status !== 'resolved');

  if (openReviews.length === 0) return null;

  return (
    <div className="paper-texture rounded-xl shadow-paper p-6 border border-ochre/30 fade-in opacity-0 stagger-2">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="w-5 h-5 text-ochre" />
        <h2 className="font-serif text-lg font-semibold text-deep-brown">
          待复核（{openReviews.length}）
        </h2>
      </div>
      <p className="text-xs text-ink-light mb-4">
        两边都改过这张长椅，已保留时间较晚的值。请确认另一边的旧值是否需要采纳。
      </p>

      <div className="space-y-3">
        {openReviews.map((review) => {
          const exp =
            review.scope === 'experience' && review.experienceId
              ? bench.experiences.find((e) => e.id === review.experienceId)
              : undefined;
          return (
            <div key={review.id} className="p-4 bg-ochre/5 rounded-lg border border-ochre/15">
              <div className="flex items-center gap-2 mb-3">
                <History className="w-4 h-4 text-ochre" />
                <span className="text-sm font-medium text-deep-brown">
                  {review.scope === 'experience' && exp
                    ? `分时段体验 · ${TIME_PERIOD_LABELS[exp.timePeriod]} · ${getFieldLabel(review.field)}`
                    : getFieldLabel(review.field)}
                </span>
                <SourceTag source={review.otherSource} />
              </div>

              <div className="space-y-2 mb-3 text-sm">
                <div className="flex gap-2">
                  <span className="text-xs text-moss-green flex-shrink-0 mt-0.5">已保留（较新）</span>
                  <span className="text-deep-brown flex-1">
                    {formatFieldValue(review.field, review.keptValue)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="text-xs text-ink-light flex-shrink-0 mt-0.5">另一边旧值</span>
                  <span className="text-ink-light flex-1">
                    {formatFieldValue(review.field, review.otherValue)}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => resolvePendingReview(bench.id, review.id, true)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-moss-green hover:bg-moss-light rounded-lg transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  采纳旧值
                </button>
                <button
                  onClick={() => resolvePendingReview(bench.id, review.id, false)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-deep-brown bg-warm-beige hover:bg-warm-beige/70 rounded-lg transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  保留新值
                </button>
                <button
                  onClick={() => removePendingReview(bench.id, review.id)}
                  className="ml-auto px-2 py-1.5 text-xs text-ink-light hover:text-deep-brown transition-colors"
                >
                  稍后处理
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
