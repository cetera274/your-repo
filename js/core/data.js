// File: js/core/data.js
import { ALL_WEEKDAYS, datesByWeekdays, daysInMonth, isDateStr, isTimeStr, weekdayIndex } from "./date.js";
import { WINDOW_KEYS, compareByTime } from "./habits.js";

export const DATA_VERSION = 3;
export const CATEGORIES = ["睡眠", "食事", "運動", "勉強", "仕事", "休息", "その他"];
export const MAX_DURATION = 600;
const FALLBACK_CATEGORY = "その他";

export function defaultPlannerSettings() {
  return {
    wakeTime: "07:00",
    bufferMin: 10,
    exerciseGapMin: 60,
    mealGapMin: 120,
  };
}

export function defaultData() {
  return {
    version: DATA_VERSION,
    nextId: 1,
    updatedAt: "",
    habits: [],
    habitLogs: {},
    schedules: [],
    recurrences: [],
    sleepLogs: {},
    settings: { targetSleep: 7, planner: defaultPlannerSettings() },
  };
}

export function newId(data) {
  const id = data.nextId;
  data.nextId += 1;
  return id;
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function toPositiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function intInRange(value, min, max, fallback) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

export function normalizeWeekdays(value) {
  if (!Array.isArray(value)) {
    return [...ALL_WEEKDAYS];
  }
  const list = [...new Set(value.map(Number))]
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    .sort((a, b) => a - b);
  return list.length > 0 ? list : [...ALL_WEEKDAYS];
}

function normalizeDateList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.filter(isDateStr))].sort();
}

function normalizeHabits(list) {
  const seen = new Set();
  const habits = [];
  for (const h of Array.isArray(list) ? list : []) {
    if (!asObject(h)) continue;
    const id = toPositiveInt(h.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    habits.push({
      id,
      name: String(h.name ?? ""),
      category: String(h.category || FALLBACK_CATEGORY),
      targetTime: isTimeStr(h.targetTime) ? h.targetTime : "",
      weekdays: normalizeWeekdays(h.weekdays),
      active: h.active !== false,
      createdAt: isDateStr(h.createdAt) ? h.createdAt : "",
      order: Number.isInteger(h.order) ? h.order : null,
      duration: intInRange(h.duration, 0, MAX_DURATION, 0),
      window: WINDOW_KEYS.includes(h.window) ? h.window : "any",
    });
  }
  // 並び順がない（バージョン2以前の）データは、以前の並び順を引き継ぐ
  if (habits.some((h) => h.order === null)) {
    habits.sort(compareByTime);
  } else {
    habits.sort((a, b) => a.order - b.order || a.id - b.id);
  }
  habits.forEach((h, i) => {
    h.order = i;
  });
  return habits;
}

// バージョン2以前の {"habitId|YYYY-MM-DD": true} と、
// バージョン3の {habitId: {"YYYY-MM": ビット}} の両方を読み込む
export function normalizeHabitLogs(raw, habitIds) {
  const out = {};
  const obj = asObject(raw);
  if (!obj) {
    return out;
  }
  const merge = (id, ym, mask) => {
    if (!out[id]) {
      out[id] = {};
    }
    out[id][ym] = (out[id][ym] || 0) | mask;
  };

  for (const [key, value] of Object.entries(obj)) {
    const legacy = /^(\d+)\|(\d{4}-\d{2}-\d{2})$/.exec(key);
    if (legacy) {
      const id = Number(legacy[1]);
      const date = legacy[2];
      if (value === true && habitIds.has(id) && isDateStr(date)) {
        merge(id, date.slice(0, 7), 1 << (Number(date.slice(8)) - 1));
      }
      continue;
    }
    const months = asObject(value);
    if (!/^\d+$/.test(key) || !habitIds.has(Number(key)) || !months) {
      continue;
    }
    for (const [ym, mask] of Object.entries(months)) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym) || !Number.isInteger(mask)) continue;
      const valid = mask & (2 ** daysInMonth(ym) - 1);
      if (valid !== 0) {
        merge(Number(key), ym, valid);
      }
    }
  }
  return out;
}

function normalizeSchedules(list, habitIds) {
  const seen = new Set();
  const out = [];
  for (const s of Array.isArray(list) ? list : []) {
    if (!asObject(s)) continue;
    const id = toPositiveInt(s.id);
    if (!id || seen.has(id)) continue;
    if (!isDateStr(s.date) || !isTimeStr(s.start) || !isTimeStr(s.end) || s.end <= s.start) continue;
    seen.add(id);
    const habitId = toPositiveInt(s.habitId);
    out.push({
      id,
      date: s.date,
      start: s.start,
      end: s.end,
      title: String(s.title ?? ""),
      category: String(s.category || FALLBACK_CATEGORY),
      memo: String(s.memo ?? ""),
      done: s.done === true,
      groupId: toPositiveInt(s.groupId),
      habitId: habitId && habitIds.has(habitId) ? habitId : null,
    });
  }
  return out;
}

// 繰り返し設定がない（バージョン2以前の）グループから設定を復元する
function inferRule(groupId, items) {
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const first = sorted[0];
  const startDate = first.date;
  const until = sorted[sorted.length - 1].date;
  const weekdays = [...new Set(sorted.map((s) => weekdayIndex(s.date)))].sort((a, b) => a - b);
  const existing = new Set(sorted.map((s) => s.date));
  return {
    id: groupId,
    title: first.title,
    category: first.category,
    memo: first.memo,
    start: first.start,
    end: first.end,
    startDate,
    until,
    weekdays,
    excludedDates: datesByWeekdays(startDate, until, weekdays).filter((d) => !existing.has(d)),
  };
}

function normalizeRecurrences(list, schedules) {
  const groups = new Map();
  for (const s of schedules) {
    if (!s.groupId) continue;
    if (!groups.has(s.groupId)) {
      groups.set(s.groupId, []);
    }
    groups.get(s.groupId).push(s);
  }

  const rules = new Map();
  for (const r of Array.isArray(list) ? list : []) {
    if (!asObject(r)) continue;
    const id = toPositiveInt(r.id);
    if (!id || !groups.has(id) || rules.has(id)) continue;
    if (!isDateStr(r.startDate) || !isDateStr(r.until) || !isTimeStr(r.start) || !isTimeStr(r.end)) continue;
    rules.set(id, {
      id,
      title: String(r.title ?? ""),
      category: String(r.category || FALLBACK_CATEGORY),
      memo: String(r.memo ?? ""),
      start: r.start,
      end: r.end,
      startDate: r.startDate,
      until: r.until,
      weekdays: normalizeWeekdays(r.weekdays),
      excludedDates: normalizeDateList(r.excludedDates),
    });
  }
  for (const [groupId, items] of groups) {
    if (!rules.has(groupId)) {
      rules.set(groupId, inferRule(groupId, items));
    }
  }
  return [...rules.values()].sort((a, b) => a.id - b.id);
}

function normalizeSleepLogs(raw) {
  const out = {};
  const obj = asObject(raw);
  if (!obj) {
    return out;
  }
  for (const [key, r] of Object.entries(obj)) {
    if (!isDateStr(key) || !asObject(r) || !isTimeStr(r.bedtime) || !isTimeStr(r.wakeTime)) continue;
    const q = Number(r.quality);
    out[key] = {
      bedtime: r.bedtime,
      wakeTime: r.wakeTime,
      quality: Number.isInteger(q) && q >= 1 && q <= 5 ? q : 3,
      memo: String(r.memo ?? ""),
    };
  }
  return out;
}

function normalizeSettings(raw) {
  const s = asObject(raw) || {};
  const p = asObject(s.planner) || {};
  const base = defaultPlannerSettings();
  const target = Number(s.targetSleep);
  return {
    targetSleep: Number.isFinite(target) && target >= 3 && target <= 12 ? target : 7,
    planner: {
      wakeTime: isTimeStr(p.wakeTime) ? p.wakeTime : base.wakeTime,
      bufferMin: intInRange(p.bufferMin, 0, 60, base.bufferMin),
      exerciseGapMin: intInRange(p.exerciseGapMin, 0, 300, base.exerciseGapMin),
      mealGapMin: intInRange(p.mealGapMin, 0, 300, base.mealGapMin),
    },
  };
}

export function normalizeData(obj) {
  if (!asObject(obj)) {
    return defaultData();
  }
  const habits = normalizeHabits(obj.habits);
  const habitIds = new Set(habits.map((h) => h.id));
  const schedules = normalizeSchedules(obj.schedules, habitIds);
  const recurrences = normalizeRecurrences(obj.recurrences, schedules);

  const result = {
    version: DATA_VERSION,
    nextId: toPositiveInt(obj.nextId) || 1,
    updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt : "",
    habits,
    habitLogs: normalizeHabitLogs(obj.habitLogs, habitIds),
    schedules,
    recurrences,
    sleepLogs: normalizeSleepLogs(obj.sleepLogs),
    settings: normalizeSettings(obj.settings),
  };

  let maxId = 0;
  for (const list of [habits, schedules, recurrences]) {
    for (const item of list) {
      maxId = Math.max(maxId, item.id);
    }
  }
  if (result.nextId <= maxId) {
    result.nextId = maxId + 1;
  }
  return result;
}