import { useRef, useState } from 'react';
import { X, FileDown, FileUp, Archive, CheckCircle2, AlertTriangle, GitMerge } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useBenchStore } from '@/store/useBenchStore';
import { migrateArchive } from '@/utils/migrate';
import { DATA_VERSION } from '@/types';
import type { ArchiveFile } from '@/types';

interface ArchiveManagerProps {
  open: boolean;
  onClose: () => void;
}

function downloadArchive(archive: ArchiveFile) {
  const blob = new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `长椅档案_${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ArchiveManager({ open, onClose }: ArchiveManagerProps) {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { benches, tombstones, mergeArchiveFile, lastMergeResult, clearMergeResult } = useBenchStore();
  const [importError, setImportError] = useState<string | null>(null);

  if (!open) return null;

  const pendingBenches = benches.filter((b) => b.pendingReview);

  const handleExport = () => {
    downloadArchive({
      version: DATA_VERSION,
      exportedAt: new Date().toISOString(),
      benches,
      tombstones,
    });
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const archive = migrateArchive(data);
      if (archive.benches.length === 0 && archive.tombstones.length === 0) {
        setImportError('档案文件中没有找到长椅记录');
        return;
      }
      mergeArchiveFile(archive);
      setImportError(null);
    } catch {
      setImportError('无法识别该档案文件，请确认是本应用导出的 .json 档案');
    }
  };

  const stats = lastMergeResult?.stats;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="paper-texture rounded-xl shadow-paper-hover p-6 max-w-lg w-full fade-in max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-lg font-semibold text-deep-brown flex items-center gap-2">
            <Archive className="w-5 h-5 text-moss-green" />
            档案管理
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-ink-light hover:text-deep-brown rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-ink-light mb-5 leading-relaxed">
          分头离线记录后，导出各自的档案文件，回来导入即可按长椅编号合并：
          只在一边改过的直接并入，两边都改过的保留较晚值并挂起待复核，
          一边删除、另一边改过的长椅会保留下来。
        </p>

        <div className="space-y-3 mb-5">
          <button
            onClick={handleExport}
            className="w-full flex items-center gap-3 px-4 py-3 bg-moss-green/10 hover:bg-moss-green/20 text-deep-brown rounded-lg transition-colors"
          >
            <FileDown className="w-5 h-5 text-moss-green flex-shrink-0" />
            <div className="text-left">
              <div className="text-sm font-medium">导出档案文件</div>
              <div className="text-xs text-ink-light">将当前 {benches.length} 张长椅导出为 JSON 文件</div>
            </div>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center gap-3 px-4 py-3 bg-ochre/10 hover:bg-ochre/20 text-deep-brown rounded-lg transition-colors"
          >
            <FileUp className="w-5 h-5 text-ochre flex-shrink-0" />
            <div className="text-left">
              <div className="text-sm font-medium">导入并合并档案</div>
              <div className="text-xs text-ink-light">选择同伴导出的 .json 文件，与当前档案合并</div>
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFile}
            className="hidden"
          />
        </div>

        {importError && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{importError}</span>
          </div>
        )}

        {stats && (
          <div className="mb-4 p-4 bg-warm-cream/60 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-deep-brown flex items-center gap-1.5">
                <GitMerge className="w-4 h-4 text-moss-green" />
                本次合并结果
              </h4>
              <button
                onClick={clearMergeResult}
                className="text-xs text-ink-light hover:text-deep-brown transition-colors"
              >
                知道了
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between px-3 py-1.5 bg-white/60 rounded">
                <span className="text-ink-light">新增长椅</span>
                <span className="text-deep-brown font-medium">{stats.added}</span>
              </div>
              <div className="flex justify-between px-3 py-1.5 bg-white/60 rounded">
                <span className="text-ink-light">直接并入</span>
                <span className="text-deep-brown font-medium">{stats.fastForwarded}</span>
              </div>
              <div className="flex justify-between px-3 py-1.5 bg-white/60 rounded">
                <span className="text-ink-light">保留本地</span>
                <span className="text-deep-brown font-medium">{stats.unchanged}</span>
              </div>
              <div className="flex justify-between px-3 py-1.5 bg-white/60 rounded">
                <span className="text-ink-light">待复核</span>
                <span className={`font-medium ${stats.bothModified + stats.keptFromDeletion > 0 ? 'text-ochre' : 'text-deep-brown'}`}>
                  {stats.bothModified + stats.keptFromDeletion}
                </span>
              </div>
            </div>
          </div>
        )}

        {pendingBenches.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-deep-brown mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-ochre" />
              待复核长椅（{pendingBenches.length}）
            </h4>
            <div className="space-y-2">
              {pendingBenches.map((bench) => (
                <button
                  key={bench.id}
                  onClick={() => {
                    onClose();
                    navigate(`/bench/${bench.id}`);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-white/60 hover:bg-white rounded-lg transition-colors text-left"
                >
                  <AlertTriangle className="w-4 h-4 text-ochre flex-shrink-0" />
                  <span className="text-sm text-deep-brown truncate flex-1">{bench.name}</span>
                  <span className="text-xs text-ink-light flex-shrink-0">去处理 →</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {!stats && pendingBenches.length === 0 && (
          <div className="text-center py-4 text-sm text-ink-light flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-moss-green" />
            当前档案没有待复核项
          </div>
        )}
      </div>
    </div>
  );
}
