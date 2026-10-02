# 城市长椅观察档案

离线记录城市长椅的小队协作工具：分头走访、各自离线建档，回来按长椅编号合并档案。

## 小队协作与档案合并

在导航栏「合并」页：

1. **导出我的档案**：生成一份 JSON（可选署名），交给队友。
2. **导入队友档案**：按长椅「编号」与本机档案做三路合并（本机 / 导入 / 共同基线）。

合并规则：

- 只在一边改动过的长椅或字段，直接并入。
- 两边都改过同一字段：保留 `updatedAt` 较晚的值，另一边的值挂为**待复核**，
  可在长椅详情页选择「采纳旧值」或「保留新值」。
- 一边删除、另一边又改过的长椅进入**隔离区**，由人工决定保留改动还是确认删除。
- 长椅的**材质或遮阴**一旦变化，分时段体验需要重新确认；确认前不参与舒适度排行。
- 分时段体验（同一条记录的备注 / 评分 / 时段）也按上述规则做字段级合并。

导出的档案内含上次同步基线与删除墓碑，因此双方反复交换档案合并也不会互相覆盖、
已删除的长椅不会“复活”。

### 历史数据迁移

旧版单份数据（裸数组 `Bench[]` 或 `{ benches: [...] }` 包裹格式）在应用启动或导入时
会自动迁移到 v2 格式（`bench-archive-v2`：编号、基线、墓碑、隔离区），无需手动处理。
旧数据缺少编号时，用原 `id` 作为编号兜底。

## 数据格式（v2）

```jsonc
{
  "format": "bench-archive-v2",
  "benches": [
    {
      "code": "B0001",            // 长椅编号，合并用稳定键
      // ...档案字段
      "experiencesConfirmed": true, // 材质/遮阴变更后置 false，未确认不进排行
      "pendingReviews": []          // 字段冲突时保存的另一边取值
    }
  ],
  "tombstones": [{ "code": "B0009", "deletedAt": "..." }],
  "quarantined": [],                // 删除 vs 修改的隔离项
  "base": { "benches": [], "tombstones": [] } // 上次同步基线
}
```

## 开发

```bash
npm install
npm run dev      # 本地开发
npm run build    # 类型检查 + 生产构建
npm run lint     # ESLint
```

合并逻辑的离线验证脚本（不依赖浏览器 / localStorage）：

```bash
npx esbuild scripts/verify-merge.ts --bundle --platform=node --format=cjs --outfile=/tmp/vm.cjs && node /tmp/vm.cjs
npx esbuild scripts/verify-e2e.ts  --bundle --platform=node --format=cjs --outfile=/tmp/ve.cjs && node /tmp/ve.cjs
```

技术栈：React + TypeScript + Vite、Zustand、Tailwind CSS，数据保存在浏览器 localStorage。
