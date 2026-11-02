// File: js/store.js
import { DATA_VERSION, defaultData, normalizeData } from "./core/data.js";
import { toast } from "./ui.js";

export const STORAGE_KEY = "habitPlanner.v1";
export const PREFS_KEY = "habitPlanner.prefs";

const saveListeners = [];

function readData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { value: defaultData(), migrated: false };
    }
    const parsed = JSON.parse(raw);
    const version = Number(parsed && parsed.version) || 1;
    return { value: normalizeData(parsed), migrated: version < DATA_VERSION };
  } catch (e) {
    console.error(e);
    return { value: defaultData(), migrated: false };
  }
}

export function writeData(touch) {
  if (touch) {
    data.updatedAt = new Date().toISOString();
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error(e);
    toast("データを保存できませんでした。ブラウザの設定や空き容量を確認してください。", "error");
  }
}

let data = defaultData();
{
  const r = readData();
  data = r.value;
  // 古い形式のデータは、新しい形式で保存し直す（更新日時は変えない）
  if (r.migrated) {
    writeData(false);
  }
}

export function getData() {
  return data;
}

export function replaceData(next) {
  data = next;
}

export function reloadData() {
  data = readData().value;
}

export function save() {
  writeData(true);
  for (const fn of saveListeners) {
    fn();
  }
}

export function onSave(fn) {
  saveListeners.push(fn);
}

// ---------- 端末ごとの設定（テーマ・通知・同期） ----------
export function defaultPrefs() {
  return {
    theme: "system",
    reminder: { enabled: false, scheduleMinutes: 10, habits: true },
    sync: { token: "", gistId: "", auto: false, lastSyncedAt: "", lastSyncTime: "" },
  };
}

function readPrefs() {
  const base = defaultPrefs();
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") || {};
    return {
      theme: ["system", "light", "dark"].includes(p.theme) ? p.theme : "system",
      reminder: Object.assign(base.reminder, p.reminder || {}),
      sync: Object.assign(base.sync, p.sync || {}),
    };
  } catch (e) {
    console.error(e);
    return base;
  }
}

let prefs = readPrefs();

export function getPrefs() {
  return prefs;
}

export function reloadPrefs() {
  prefs = readPrefs();
}

export function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch (e) {
    console.error(e);
    toast("設定を保存できませんでした。", "error");
  }
}

export function resetSyncPrefs() {
  prefs.sync = defaultPrefs().sync;
  savePrefs();
}