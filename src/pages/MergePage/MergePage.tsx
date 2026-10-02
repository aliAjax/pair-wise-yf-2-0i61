import { useEffect, useRef, useState } from 'react';
import {
  Upload,
  Download,
  FileUp,
  AlertTriangle,
  CheckCircle2,
  GitMerge,
  ShieldAlert,
  RotateCcw,
} from 'lucide-react';
import { useBenchStore } from '@/store/useBenchStore';
import { loadArchive } from '@/utils/storage';
import type { MergeReport } from '@/types';

export default function MergePage() {
  const {
    benches,
    quarantined,
    initialize,
    initialized,
    importArchive,
    restoreQuarantined,
    discardQuarantined,
  } = useBenchStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<MergeReport | null>(null);
  const [myName, setMyName] = useState('');

  useEffect(() => {
    if (!initialized) initialize();
  }, [initialized, initialize]);

  const pendingCount = benches.reduce((sum, bench) => sum + bench.pendingReviews.length, 0);

  const handleExport = () => {
    const archive = loadArchive();
    if (!archive) return;
    const payload = {
      ...archive,
      exportedAt: new Date().toISOString(),
      exportedBy: myName.trim() || undefined,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bench-archive-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (file: File) => {
    setError(null);
    setReport(null);
    try {
      const text = await file.text();
      JSON.parse(text); // 提前校验格式
      const result = importArchive(text);
      setReport(result);
    } catch {
      setError('无法读取该文件，请确认是本应用导出的长椅档案 JSON。');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-3xl">
      <div className="mb-6">
        <h2 className="font-serif text-2xl font-semibold text-deep-brown mb-1 flex items-center gap-2">
          <GitMerge className="w-6 h-6 text-moss-green" />
          小队档案合并
        </h2>
        <p className="text-ink-light text-sm">
          分头离线记录的档案按长椅编号合并：只在一边改过的直接并入，两边都改过的保留较晚的值，另一边挂待复核。
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-3">
        <button
          onClick={handleExport}
          className="paper-texture rounded-xl shadow-paper p-6 text-left card-hover transition-all"
        >
          <div className="w-12 h-12 rounded-xl bg-moss-green/10 flex items-center justify-center mb-3">
            <Download className="w-6 h-6 text-moss-green" />
          </div>
          <h3 className="font-serif font-semibold text-deep-brown mb-1">导出我的档案</h3>
          <p className="text-xs text-ink-light">
            生成 JSON 交给队友，里面带合并基线，下次再合并不会互相覆盖。
          </p>
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="paper-texture rounded-xl shadow-paper p-6 text-left card-hover transition-all"
        >
          <div className="w-12 h-12 rounded-xl bg-ochre/10 flex items-center justify-center mb-3">
            <Upload className="w-6 h-6 text-ochre" />
          </div>
          <h3 className="font-serif font-semibold text-deep-brown mb-1">导入队友档案</h3>
          <p className="text-xs text-ink-light">
            选择队友导出的 JSON，按编号与本机档案做三路合并。
          </p>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </div>

      <div className="mb-6">
        <input
          type="text"
          value={myName}
          onChange={(e) => setMyName(e.target.value)}
          placeholder="署名（可选，导出时标注记录人）"
          className="w-full px-4 py-2 text-sm bg-white/50 border border-deep-brown/10 rounded-lg text-deep-brown placeholder:text-ink-light/60 focus:bg-white transition-colors"
        />
      </div>

      <div className="paper-texture rounded-xl shadow-paper p-4 mb-6 flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <span className="text-ink-light">长椅 <span className="font-medium text-deep-brown">{benches.length}</span></span>
        <span className="text-ink-light">待复核 <span className={`font-medium ${pendingCount > 0 ? 'text-ochre' : 'text-deep-brown'}`}>{pendingCount}</span></span>
        <span className="text-ink-light">隔离区 <span className={`font-medium ${quarantined.length > 0 ? 'text-red-500' : 'text-deep-brown'}`}>{quarantined.length}</span></span>
      </div>

      {error && (
        <div className="mb-6 paper-texture rounded-xl p-4 border border-red-200 bg-red-50/60 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {report && (
        <div className="mb-6 paper-texture rounded-xl shadow-paper p-5 border border-moss-green/30 fade-in">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-5 h-5 text-moss-green" />
            <h3 className="font-serif font-semibold text-deep-brown">合并完成</h3>
            {report.incomingName && <span className="text-xs text-ink-light">来自：{report.incomingName}</span>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <ReportStat label="新增" value={report.added} />
            <ReportStat label="更新" value={report.updated} />
            <ReportStat label="删除" value={report.removed} />
            <ReportStat label="冲突长椅" value={report.conflicts} highlight={report.conflicts > 0} />
            <ReportStat label="待复核条目" value={report.pendingReviews} highlight={report.pendingReviews > 0} />
            <ReportStat label="进入隔离区" value={report.quarantined} highlight={report.quarantined > 0} />
          </div>
          {(report.pendingReviews > 0 || report.quarantined > 0) && (
            <p className="text-xs text-ink-light mt-3">
              有待复核或隔离项时，请到对应长椅详情或下方隔离区处理；未确认体验的长椅暂不进排行。
            </p>
          )}
        </div>
      )}

      <div className="paper-texture rounded-xl shadow-paper p-6">
        <div className="flex items-center gap-2 mb-4">
          <ShieldAlert className="w-5 h-5 text-red-400" />
          <h3 className="font-serif font-semibold text-deep-brown">隔离区：删除 vs 修改</h3>
        </div>
        {quarantined.length === 0 ? (
          <p className="text-sm text-ink-light">没有需要裁决的冲突长椅。</p>
        ) : (
          <div className="space-y-3">
            {quarantined.map((item) => (
              <div key={item.code} className="p-4 bg-red-50/40 rounded-lg border border-red-100">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-mono text-xs text-ink-light">{item.code}</span>
                  <span className="font-medium text-deep-brown text-sm">{item.bench.name}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-white text-red-500">
                    {item.deleteSource === 'local' ? '本机已删除，对方改过' : '对方已删除，本机改过'}
                  </span>
                </div>
                <p className="text-xs text-ink-light mb-3">{item.bench.location}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => restoreQuarantined(item.code)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-moss-green hover:bg-moss-light rounded-lg transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    保留改动
                  </button>
                  <button
                    onClick={() => discardQuarantined(item.code)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 bg-white hover:bg-red-50 border border-red-200 rounded-lg transition-colors"
                  >
                    确认删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-ink-light/70 mt-4 flex items-start gap-2">
        <FileUp className="w-4 h-4 flex-shrink-0 mt-0.5" />
        旧版单份历史数据（数组或 {'{ benches: [] }'} 格式）也可直接导入，会自动迁移到带编号、基线和墓碑的新格式。
      </p>
    </div>
  );
}

function ReportStat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="p-3 bg-warm-cream/60 rounded-lg text-center">
      <div className={`text-xl font-bold font-serif ${highlight ? 'text-ochre' : 'text-deep-brown'}`}>
        {value}
      </div>
      <div className="text-xs text-ink-light">{label}</div>
    </div>
  );
}
