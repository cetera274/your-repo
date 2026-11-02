// File: js/core/sync-logic.js
// 前回の同期時点（base）からの変更の有無で、同期の動作を決める
// 戻り値: "push" | "pull" | "noop" | "same" | "conflict"
export function decideSync({ remoteExists, localUpdatedAt, remoteUpdatedAt, base }) {
  if (!remoteExists) {
    return "push";
  }
  const localChanged = localUpdatedAt !== base;
  const remoteChanged = remoteUpdatedAt !== base;
  if (!localChanged && !remoteChanged) return "noop";
  if (localChanged && !remoteChanged) return "push";
  if (!localChanged && remoteChanged) return "pull";
  if (localUpdatedAt === remoteUpdatedAt) return "same";
  return "conflict";
}