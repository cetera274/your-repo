// File: js/core/habits.js
import { WEEKDAYS, addDays, daysInMonth, pad, weekdayIndex } from "./date.js";

export const WINDOW_KEYS = ["any", "afterWake", "morning", "afternoon", "evening", "beforeBed"];

export const WINDOW_LABELS = {
  any: "いつでも",
  afterWake: "起床後（90分以内）",
  morning: "午前",
  afternoon: "午後（12〜18時）",
  evening: "夕方以降（18時〜）",
  beforeBed: "就寝前（90分以内）",
};

// 以前の並び順（目標時刻のある習慣を時刻順に先頭へ）
export function compareByTime(a, b) {
  if (!a.targetTime && b.targetTime) return 1;
  if (a.targetTime && !b.targetTime) return -1;
  if (a.targetTime !== b.targetTime) return a.targetTime < b.targetTime ? -1 : 1;
  return a.id - b.id;
}

// ---------- 記録（習慣ID → "YYYY-MM" → 日ごとのビット） ----------
function dayBit(date) {
  return 1 << (Number(date.slice(8, 10)) - 1);
}

export function isHabitDone(data, habitId, date) {
  const months = data.habitLogs[habitId];
  if (!months) {
    return false;
  }
  const mask = months[date.slice(0, 7)];
  return mask ? (mask & dayBit(date)) !== 0 : false;
}

export function setHabitDoneIn(data, habitId, date, done) {
  const ym = date.slice(0, 7);
  let months = data.habitLogs[habitId];
  if (done) {
    if (!months) {
      months = {};
      data.habitLogs[habitId] = months;
    }
    months[ym] = (months[ym] || 0) | dayBit(date);
    return;
  }
  if (!months || !months[ym]) {
    return;
  }
  const next = months[ym] & ~dayBit(date);
  if (next === 0) {
    delete months[ym];
  } else {
    months[ym] = next;
  }
  if (Object.keys(months).length === 0) {
    delete data.habitLogs[habitId];
  }
}

export function habitDoneDates(data, habitId) {
  const months = data.habitLogs[habitId] || {};
  const out = [];
  for (const ym of Object.keys(months).sort()) {
    const mask = months[ym];
    const last = daysInMonth(ym);
    for (let d = 1; d <= last; d++) {
      if (mask & (1 << (d - 1))) {
        out.push(`${ym}-${pad(d)}`);
      }
    }
  }
  return out;
}

function popcount(x) {
  let n = x;
  let count = 0;
  while (n) {
    n &= n - 1;
    count += 1;
  }
  return count;
}

export function countHabitLogs(data) {
  let total = 0;
  for (const months of Object.values(data.habitLogs)) {
    for (const mask of Object.values(months)) {
      total += popcount(mask);
    }
  }
  return total;
}

// ---------- 習慣 ----------
export function sortedHabits(data, activeOnly = false) {
  return data.habits
    .filter((h) => !activeOnly || h.active)
    .sort((a, b) => a.order - b.order || a.id - b.id);
}

export function habitLabel(h) {
  const time = h.targetTime ? `${h.targetTime}　` : "";
  return `${time}${h.name}（${h.category}）`;
}

export function weekdaysLabel(weekdays) {
  const key = weekdays.join(",");
  if (key === "0,1,2,3,4,5,6") return "毎日";
  if (key === "0,1,2,3,4") return "平日";
  if (key === "5,6") return "週末";
  return weekdays.map((i) => WEEKDAYS[i]).join("・");
}

export function isHabitScheduled(h, date) {
  return h.weekdays.includes(weekdayIndex(date));
}

// 集計の対象になる日か（有効、実施曜日、作成日以降または記録がある日）
export function isHabitTarget(data, h, date) {
  if (!h.active || !isHabitScheduled(h, date)) {
    return false;
  }
  return !h.createdAt || date >= h.createdAt || isHabitDone(data, h.id, date);
}

export function habitsForDate(data, date) {
  return sortedHabits(data, true).filter((h) => isHabitScheduled(h, date));
}

// 実施曜日だけを数える連続達成日数（今日が未達成でも前日までの連続を数える）
export function calcStreak(data, h, today) {
  const months = Object.keys(data.habitLogs[h.id] || {}).sort();
  if (months.length === 0) {
    return 0;
  }
  const earliest = `${months[0]}-01`;
  let d = today;
  if (isHabitScheduled(h, d) && !isHabitDone(data, h.id, d)) {
    d = addDays(d, -1);
  }
  let streak = 0;
  while (d >= earliest) {
    if (isHabitScheduled(h, d)) {
      if (!isHabitDone(data, h.id, d)) {
        break;
      }
      streak += 1;
    }
    d = addDays(d, -1);
  }
  return streak;
}

function reindex(data) {
  sortedHabits(data).forEach((h, i) => {
    h.order = i;
  });
}

export function nextHabitOrder(data) {
  return data.habits.reduce((max, h) => Math.max(max, h.order + 1), 0);
}

export function deleteHabitIn(data, habitId) {
  data.habits = data.habits.filter((h) => h.id !== habitId);
  delete data.habitLogs[habitId];
  for (const s of data.schedules) {
    if (s.habitId === habitId) {
      s.habitId = null;
    }
  }
  reindex(data);
}

// delta: -1 で上へ、1 で下へ
export function moveHabit(data, habitId, delta) {
  const list = sortedHabits(data);
  const i = list.findIndex((h) => h.id === habitId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) {
    return false;
  }
  [list[i], list[j]] = [list[j], list[i]];
  list.forEach((h, k) => {
    h.order = k;
  });
  return true;
}

export function sortHabitsByTime(data) {
  [...data.habits].sort(compareByTime).forEach((h, i) => {
    h.order = i;
  });
}