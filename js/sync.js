// File: js/sync.js
import { DATA_VERSION, normalizeData } from "./core/data.js";
import { formatDateTime } from "./core/date.js";
import { decideSync } from "./core/sync-logic.js";
import { getData, getPrefs, replaceData, savePrefs, writeData } from "./store.js";
import { $, choose, rerender, toast } from "./ui.js";

const GIST_API = "https://api.github.com/gists";
const SYNC_FILE = "habit-planner.json";
const AUTO_SYNC_DELAY_MS = 5000;
const MSG_UP_TO_DATE = "データは最新の状態です。";

let syncing = false;
let pendingSync = false;
let autoSyncTimer = null;
let lastSyncError = "";

export class SyncError extends Error {}

export function isSyncing() {
  return syncing;
}

export function clearSyncError() {
  lastSyncError = "";
}

export function canAutoSync() {
  const s = getPrefs().sync;
  return Boolean(s.auto && s.token);
}

async function gistRequest(method, path, body) {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${getPrefs().sync.token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (body) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${GIST_API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    if (res.status === 401) throw new SyncError("トークンが正しくないか、有効期限が切れています。");
    if (res.status === 403) throw new SyncError("アクセスが拒否されました。トークンの権限を確認してください。");
    if (res.status === 404) throw new SyncError("Gistが見つかりません。Gist IDとトークンの権限を確認してください。");
    throw new SyncError(`GitHubのAPIがエラーを返しました（HTTP ${res.status}）。`);
  }
  return res.json();
}

export async function fetchRemote() {
  const prefs = getPrefs();
  if (!prefs.sync.gistId) {
    return null;
  }
  const gist = await gistRequest("GET", `/${encodeURIComponent(prefs.sync.gistId)}`);
  const file = gist.files && gist.files[SYNC_FILE];
  if (!file) {
    return null;
  }
  let content = file.content;
  if (file.truncated && file.raw_url) {
    const res = await fetch(file.raw_url, { cache: "no-store" });
    if (!res.ok) {
      throw new SyncError("クラウドのデータを取得できませんでした。");
    }
    content = await res.text();
  }
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new SyncError("クラウドのデータの形式が正しくありません。");
  }
  if (Number(parsed && parsed.version) > DATA_VERSION) {
    throw new SyncError("クラウドのデータは新しいバージョンのアプリで保存されています。ページを再読み込みしてください。");
  }
  return normalizeData(parsed);
}

export async function pushRemote() {
  const prefs = getPrefs();
  const data = getData();
  const snapshotUpdatedAt = data.updatedAt;
  const body = { files: { [SYNC_FILE]: { content: JSON.stringify(data, null, 2) } } };
  if (prefs.sync.gistId) {
    await gistRequest("PATCH", `/${encodeURIComponent(prefs.sync.gistId)}`, body);
  } else {
    const gist = await gistRequest("POST", "", {
      description: "生活習慣プランナー 同期データ",
      public: false,
      ...body,
    });
    prefs.sync.gistId = gist.id;
  }
  prefs.sync.lastSyncedAt = snapshotUpdatedAt;
  prefs.sync.lastSyncTime = new Date().toISOString();
  savePrefs();
}

export function applyRemote(remote) {
  const prefs = getPrefs();
  replaceData(remote);
  writeData(false);
  prefs.sync.lastSyncedAt = remote.updatedAt;
  prefs.sync.lastSyncTime = new Date().toISOString();
  savePrefs();
  rerender();
}

function markSynced(updatedAt) {
  const prefs = getPrefs();
  if (updatedAt !== null) {
    prefs.sync.lastSyncedAt = updatedAt;
  }
  prefs.sync.lastSyncTime = new Date().toISOString();
  savePrefs();
}

export async function syncTask() {
  const remote = await fetchRemote();
  const data = getData();
  const action = decideSync({
    remoteExists: Boolean(remote),
    localUpdatedAt: data.updatedAt,
    remoteUpdatedAt: remote ? remote.updatedAt : "",
    base: getPrefs().sync.lastSyncedAt,
  });

  if (action === "push") {
    await pushRemote();
    return remote ? "この端末の変更をクラウドに保存しました。" : "クラウドにデータを保存しました。";
  }
  if (action === "pull") {
    applyRemote(remote);
    return "クラウドのデータを読み込みました。";
  }
  if (action === "noop") {
    markSynced(null);
    return MSG_UP_TO_DATE;
  }
  if (action === "same") {
    markSynced(data.updatedAt);
    return MSG_UP_TO_DATE;
  }

  const choice = await choose(
    "この端末とクラウドの両方でデータが変更されています。\n" +
      `この端末の最終更新：${formatDateTime(data.updatedAt)}\n` +
      `クラウドの最終更新：${formatDateTime(remote.updatedAt)}\n` +
      "どちらのデータを残しますか？（残さなかった方の変更は失われます）",
    [
      { label: "この端末のデータを残す", value: "local" },
      { label: "クラウドのデータを残す", value: "remote" },
    ]
  );
  if (choice === "local") {
    await pushRemote();
    return "この端末のデータでクラウドを上書きしました。";
  }
  if (choice === "remote") {
    applyRemote(remote);
    return "クラウドのデータでこの端末を上書きしました。";
  }
  return "同期を中止しました。";
}

function syncErrorMessage(e) {
  if (e instanceof SyncError) {
    return e.message;
  }
  if (e instanceof TypeError) {
    return "ネットワークに接続できません。";
  }
  return "不明なエラーが発生しました。";
}

export async function runSync(task, { silent = false } = {}) {
  if (!getPrefs().sync.token) {
    if (!silent) {
      toast("先にアクセストークンを設定してください。", "error");
    }
    return;
  }
  if (syncing) {
    if (silent) {
      pendingSync = true;
    } else {
      toast("同期中です。しばらくお待ちください。", "error");
    }
    return;
  }
  syncing = true;
  updateSyncStatus("同期中…");
  try {
    const msg = await task();
    lastSyncError = "";
    if (msg && !silent) {
      toast(msg);
    }
  } catch (e) {
    console.error(e);
    lastSyncError = syncErrorMessage(e);
    if (!silent) {
      toast(`同期に失敗しました：${lastSyncError}`, "error");
    }
  } finally {
    syncing = false;
    updateSyncStatus();
    if (pendingSync) {
      pendingSync = false;
      scheduleAutoSync();
    }
  }
}

export function scheduleAutoSync() {
  if (!canAutoSync()) {
    return;
  }
  if (syncing) {
    pendingSync = true;
    return;
  }
  clearTimeout(autoSyncTimer);
  autoSyncTimer = setTimeout(() => runSync(syncTask, { silent: true }), AUTO_SYNC_DELAY_MS);
}

export function updateSyncStatus(text) {
  const el = $("sync-status");
  if (!el) {
    return;
  }
  if (text) {
    el.textContent = text;
    return;
  }
  const s = getPrefs().sync;
  let status = `最終同期：${formatDateTime(s.lastSyncTime)}`;
  if (s.gistId) {
    status += `　Gist ID：${s.gistId}`;
  }
  if (lastSyncError) {
    status += `　前回の同期は失敗しました（${lastSyncError}）`;
  }
  el.textContent = status;
  const gistInput = $("sync-gist");
  if (gistInput && document.activeElement !== gistInput) {
    gistInput.value = s.gistId;
  }
}