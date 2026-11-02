// File: js/core/date.js
export const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];
export const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
export const MAX_RANGE_DAYS = 3660;

export function pad(n) {
  return String(n).padStart(2, "0");
}

export function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// 実在する日付の "YYYY-MM-DD" か
export function isDateStr(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return false;
  }
  return toDateStr(parseDate(s)) === s;
}

export function isTimeStr(s) {
  if (typeof s !== "string" || !/^\d{2}:\d{2}$/.test(s)) {
    return false;
  }
  const [h, m] = s.split(":").map(Number);
  return h <= 23 && m <= 59;
}

export function normalizeTime(value) {
  return String(value ?? "").slice(0, 5);
}

export function todayStr(now = new Date()) {
  return toDateStr(now);
}

export function nowMinutes(now = new Date()) {
  return now.getHours() * 60 + now.getMinutes();
}

export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

export function addMonths(ym, n) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

// 月曜日 = 0 〜 日曜日 = 6
export function weekdayIndex(s) {
  return (parseDate(s).getDay() + 6) % 7;
}

export function diffDays(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

export function daysInMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

// 開始日から終了日まで（両端を含む）
export function dateRange(start, end) {
  const out = [];
  let d = start;
  while (d <= end && out.length < MAX_RANGE_DAYS) {
    out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

export function datesByWeekdays(start, end, weekdays) {
  const set = new Set(weekdays);
  return dateRange(start, end).filter((d) => set.has(weekdayIndex(d)));
}

export function formatDate(s) {
  const d = parseDate(s);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}（${WEEKDAYS[weekdayIndex(s)]}）`;
}

export function formatShort(s) {
  const d = parseDate(s);
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}（${WEEKDAYS[weekdayIndex(s)]}）`;
}

export function formatLong(s) {
  const d = parseDate(s);
  return `${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS[weekdayIndex(s)]}）`;
}

export function formatDateTime(iso) {
  if (!iso) {
    return "なし";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "なし";
  }
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function minutesOf(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

// 24時以降は「翌」を付けて表示する
export function formatClock(min) {
  return min >= 1440 ? `翌${minutesToTime(min)}` : minutesToTime(min);
}

export function formatDuration(min) {
  const total = Math.max(0, Math.round(min));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) {
    return `${m}分`;
  }
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}