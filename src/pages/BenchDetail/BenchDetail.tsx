import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  MapPin,
  Sun,
  Volume2,
  Clock,
  Armchair,
  Compass,
  Edit3,
  Trash2,
  Sunrise,
  Sunset,
  Moon,
  CloudSun,
} from 'lucide-react';
import { useBenchStore } from '@/store/useBenchStore';
import {
  MATERIAL_LABELS,
  ORIENTATION_LABELS,
  SHADE_LABELS,
  NOISE_LABELS,
  STAY_DURATION_LABELS,
  TIME_PERIOD_LABELS,
  CONFLICT_REASON_LABELS,
} from '@/types';
import type { TimePeriodType, Bench } from '@/types';
import Rating from '@/components/Rating/Rating';
import { calculateComfortScore, getComfortLevel, getComfortColor } from '@/utils/comfort';
import { GitCompare, ShieldQuestion, CheckCircle2 } from 'lucide-react';

/** 两边都修改过时，列出存在差异的字段 */
function diffFields(current: Bench, other: Bench): { label: string; current: string; other: string }[] {
  const fields: { key: keyof Bench; label: string; format?: (v: unknown) => string }[] = [
    { key: 'name', label: '名称' },
    { key: 'location', label: '位置' },
    { key: 'material', label: '材质', format: (v) => MATERIAL_LABELS[v as Bench['material']] },
    { key: 'orientation', label: '朝向', format: (v) => ORIENTATION_LABELS[v as Bench['orientation']] },
    { key: 'shadeLevel', label: '遮阴', format: (v) => SHADE_LABELS[v as Bench['shadeLevel']] },
    { key: 'noiseLevel', label: '噪音', format: (v) => NOISE_LABELS[v as Bench['noiseLevel']] },
    { key: 'stayDuration', label: '停留时长', format: (v) => STAY_DURATION_LABELS[v as Bench['stayDuration']] },
    { key: 'hasBackrest', label: '靠背', format: (v) => (v ? '有' : '无') },
    { key: 'rating', label: '评分', format: (v) => `${v} 星` },
    { key: 'review', label: '评价' },
  ];
  const diffs: { label: string; current: string; other: string }[] = [];
  for (const f of fields) {
    const cv = current[f.key];
    const ov = other[f.key];
    if (cv !== ov) {
      const fmt = f.format ?? ((v: unknown) => (v === '' || v == null ? '（空）' : String(v)));
      diffs.push({ label: f.label, current: fmt(cv), other: fmt(ov) });
    }
  }
  if (current.experiences.length !== other.experiences.length) {
    diffs.push({
      label: '时段体验',
      current: `${current.experiences.length} 条`,
      other: `${other.experiences.length} 条`,
    });
  }
  return diffs;
}

export default function BenchDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getBenchById, deleteBench, initialize, initialized, resolveConflict, confirmExperiences } = useBenchStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!initialized) {
      initialize();
    }
  }, [initialized, initialize]);

  const bench = id ? getBenchById(id) : undefined;

  useEffect(() => {
    if (bench === undefined && initialized) {
      navigate('/');
    }
  }, [bench, initialized, navigate]);

  if (!bench) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="text-center py-12">
          <p className="text-ink-light">加载中...</p>
        </div>
      </div>
    );
  }

  const comfortScore = calculateComfortScore(bench);
  const comfortLevel = getComfortLevel(comfortScore);
  const comfortColor = getComfortColor(comfortScore);

  const timePeriodIcons: Record<TimePeriodType, typeof Sunrise> = {
    morning: Sunrise,
    noon: Sun,
    afternoon: CloudSun,
    evening: Sunset,
    night: Moon,
  };

  const sortedExperiences = [...bench.experiences].sort((a, b) => {
    const order: TimePeriodType[] = ['morning', 'noon', 'afternoon', 'evening', 'night'];
    return order.indexOf(a.timePeriod) - order.indexOf(b.timePeriod);
  });

  const handleDelete = () => {
    if (id) {
      deleteBench(id);
      navigate('/');
    }
  };

  return (
    <div className="container mx-auto px-4 py-6">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-ink-light hover:text-deep-brown mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="text-sm">返回</span>
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {bench.pendingReview && bench.conflict && (
            <div className="paper-texture rounded-xl shadow-paper p-5 border-l-4 border-ochre fade-in opacity-0 stagger-1">
              <div className="flex items-start gap-3 mb-3">
                <GitCompare className="w-5 h-5 text-ochre flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-serif font-semibold text-deep-brown">合并冲突待复核</h3>
                  <p className="text-sm text-ink-light mt-0.5">
                    {CONFLICT_REASON_LABELS[bench.conflict.reason]}
                    ，当前保留了较晚更新的版本，请核对后处理。
                  </p>
                </div>
              </div>

              {bench.conflict.reason === 'both-modified' && bench.conflict.otherVersion && (
                <div className="mb-4 overflow-hidden rounded-lg border border-deep-brown/10">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-warm-cream/70 text-deep-brown">
                        <th className="text-left px-3 py-2 font-medium">字段</th>
                        <th className="text-left px-3 py-2 font-medium">当前版本（较晚）</th>
                        <th className="text-left px-3 py-2 font-medium">对方版本</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diffFields(bench, bench.conflict.otherVersion).map((diff) => (
                        <tr key={diff.label} className="border-t border-deep-brown/5">
                          <td className="px-3 py-2 text-ink-light">{diff.label}</td>
                          <td className="px-3 py-2 text-deep-brown">{diff.current}</td>
                          <td className="px-3 py-2 text-ink-light">{diff.other}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {bench.conflict.reason === 'deleted-vs-modified' && (
                <p className="text-sm text-ink-light mb-4 p-3 bg-warm-cream/60 rounded-lg">
                  这份档案在同伴的档案中已被删除，但本地有更新记录。长椅已保留，如确认删除可点击下方"保留长椅"后再删除。
                </p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => id && resolveConflict(id, 'current')}
                  className="px-4 py-2 text-sm text-white bg-moss-green hover:bg-moss-light rounded-lg transition-colors"
                >
                  {bench.conflict.reason === 'both-modified' ? '保留当前版本' : '保留长椅'}
                </button>
                {bench.conflict.reason === 'both-modified' && bench.conflict.otherVersion && (
                  <button
                    onClick={() => id && resolveConflict(id, 'other')}
                    className="px-4 py-2 text-sm text-deep-brown bg-warm-beige hover:bg-warm-beige/80 rounded-lg transition-colors"
                  >
                    采用对方版本
                  </button>
                )}
              </div>
            </div>
          )}

          {!bench.experiencesConfirmed && (
            <div className="paper-texture rounded-xl shadow-paper p-5 border-l-4 border-deep-brown/40 fade-in opacity-0 stagger-1">
              <div className="flex items-start gap-3">
                <ShieldQuestion className="w-5 h-5 text-deep-brown flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-serif font-semibold text-deep-brown">分时段体验待确认</h3>
                  <p className="text-sm text-ink-light mt-0.5 mb-3">
                    长椅的材质或遮阴发生了变化，分时段体验可能不再准确。请重新核对各时段体验备注，确认无误后这张长椅才会进入排行榜。
                  </p>
                  <button
                    onClick={() => id && confirmExperiences(id)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-moss-green hover:bg-moss-light rounded-lg transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    体验已确认
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="paper-texture rounded-xl shadow-paper overflow-hidden fade-in opacity-0 stagger-1">
            <div className="h-48 bg-gradient-to-br from-warm-cream via-warm-beige to-moss-green/10 relative">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-28 h-28 rounded-full bg-white/60 flex items-center justify-center backdrop-blur-sm">
                  <Armchair className="w-14 h-14 text-moss-green/60" />
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h1 className="font-serif text-2xl font-bold text-deep-brown mb-2">
                    {bench.name}
                  </h1>
                  <div className="flex items-center gap-1 text-ink-light">
                    <MapPin className="w-4 h-4 flex-shrink-0" />
                    <span>{bench.location}</span>
                  </div>
                </div>

                <div className="text-right">
                  <div className={`text-3xl font-bold font-serif ${comfortColor}`}>
                    {comfortScore}
                  </div>
                  <div className="text-sm text-ink-light">{comfortLevel}</div>
                </div>
              </div>

              <div className="h-2 bg-warm-beige rounded-full mb-6 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${
                    comfortScore >= 4 ? 'bg-moss-green' :
                    comfortScore >= 3 ? 'bg-ochre' :
                    'bg-ink-light'
                  }`}
                  style={{ width: `${(comfortScore / 5) * 100}%` }}
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <div className="text-center p-3 bg-moss-green/5 rounded-lg">
                  <Sun className="w-5 h-5 text-moss-green mx-auto mb-1" />
                  <div className="text-xs text-ink-light mb-0.5">遮阴</div>
                  <div className="text-sm font-medium text-deep-brown">
                    {SHADE_LABELS[bench.shadeLevel]}
                  </div>
                </div>
                <div className="text-center p-3 bg-ochre/5 rounded-lg">
                  <Volume2 className="w-5 h-5 text-ochre mx-auto mb-1" />
                  <div className="text-xs text-ink-light mb-0.5">噪音</div>
                  <div className="text-sm font-medium text-deep-brown">
                    {NOISE_LABELS[bench.noiseLevel]}
                  </div>
                </div>
                <div className="text-center p-3 bg-moss-green/5 rounded-lg">
                  <Armchair className="w-5 h-5 text-moss-green mx-auto mb-1" />
                  <div className="text-xs text-ink-light mb-0.5">靠背</div>
                  <div className="text-sm font-medium text-deep-brown">
                    {bench.hasBackrest ? '有' : '无'}
                  </div>
                </div>
                <div className="text-center p-3 bg-ochre/5 rounded-lg">
                  <Compass className="w-5 h-5 text-ochre mx-auto mb-1" />
                  <div className="text-xs text-ink-light mb-0.5">朝向</div>
                  <div className="text-sm font-medium text-deep-brown">
                    {ORIENTATION_LABELS[bench.orientation]}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6 mb-6 p-4 bg-warm-cream/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-ink-light">材质</span>
                  <span className="text-sm font-medium text-deep-brown">
                    {MATERIAL_LABELS[bench.material]}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-ink-light" />
                  <span className="text-sm text-ink-light">适合停留</span>
                  <span className="text-sm font-medium text-deep-brown">
                    {STAY_DURATION_LABELS[bench.stayDuration]}
                  </span>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="font-serif font-semibold text-deep-brown mb-2">个人评价</h3>
                <p className="text-ink-light leading-relaxed">{bench.review}</p>
              </div>

              <div className="flex items-center gap-4 pt-4 border-t border-deep-brown/10">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-ink-light">评分</span>
                  <Rating value={bench.rating} readOnly />
                </div>

                <div className="flex-1" />

                <button
                  onClick={() => navigate(`/edit/${bench.id}`)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-moss-green hover:bg-moss-green/10 rounded-lg transition-colors"
                >
                  <Edit3 className="w-4 h-4" />
                  编辑
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  删除
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="paper-texture rounded-xl shadow-paper p-6 fade-in opacity-0 stagger-2">
            <h2 className="font-serif text-lg font-semibold text-deep-brown mb-4">
              分时段体验
            </h2>

            {sortedExperiences.length > 0 ? (
              <div className="space-y-4">
                {sortedExperiences.map((experience) => {
                  const TimeIcon = timePeriodIcons[experience.timePeriod];
                  return (
                    <div
                      key={experience.id}
                      className="p-4 bg-warm-cream/50 rounded-lg hover:bg-warm-cream transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <TimeIcon className="w-4 h-4 text-ochre" />
                          <span className="font-medium text-deep-brown text-sm">
                            {TIME_PERIOD_LABELS[experience.timePeriod]}
                          </span>
                        </div>
                        <Rating value={experience.rating} readOnly size="sm" />
                      </div>
                      <p className="text-sm text-ink-light leading-relaxed">
                        {experience.notes}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-full bg-moss-green/10 flex items-center justify-center mx-auto mb-3">
                  <Clock className="w-6 h-6 text-moss-green/50" />
                </div>
                <p className="text-sm text-ink-light">
                  还没有分时段体验记录
                </p>
                <p className="text-xs text-ink-light/60 mt-1">
                  编辑长椅时可以添加
                </p>
              </div>
            )}
          </div>

          <div className="paper-texture rounded-xl shadow-paper p-6 fade-in opacity-0 stagger-3">
            <h3 className="font-serif text-sm font-semibold text-deep-brown mb-3">
              档案信息
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-light">创建时间</span>
                <span className="text-deep-brown">
                  {new Date(bench.createdAt).toLocaleDateString('zh-CN')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-light">更新时间</span>
                <span className="text-deep-brown">
                  {new Date(bench.updatedAt).toLocaleDateString('zh-CN')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-light">时段记录</span>
                <span className="text-deep-brown">{bench.experiences.length} 条</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="paper-texture rounded-xl shadow-paper-hover p-6 max-w-sm w-full fade-in">
            <h3 className="font-serif text-lg font-semibold text-deep-brown mb-2">
              确认删除
            </h3>
            <p className="text-ink-light text-sm mb-6">
              确定要删除这张长椅的档案吗？此操作无法撤销。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 text-sm text-deep-brown bg-warm-beige hover:bg-warm-beige/80 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2 text-sm text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
