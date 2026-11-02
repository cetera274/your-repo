// File: js/core/csv.js
import { dateRange } from "./date.js";
import { habitDoneDates, isHabitDone, isHabitScheduled, sortedHabits } from "./habits.js";
import { schedulesBetween } from "./schedules.js";
import { sleepHours } from "./sleep.js";

export function csvCell(value, isText = false) {
  let s = String(value ?? "");
  // 表計算ソフトで数式として解釈されないようにする
  if (isText && /^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  if (/[",\r\n]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// Excelで文字化けしないよう、BOM付きで出力する
export function toCsv(header, rows, textCols = []) {
  const lines = [header.map((h) => csvCell(h)).join(",")];
  for (const row of rows) {
    lines.push(row.map((v, i) => csvCell(v, textCols.includes(i))).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function schedulesCsv(data) {
  const habitNames = new Map(data.habits.map((h) => [h.id, h.name]));
  const rows = schedulesBetween(data, "0000-01-01", "9999-12-31").map((s) => [
    s.date,
    s.start,
    s.end,
    s.title,
    s.category,
    s.memo,
    s.done ? "完了" : "未完了",
    s.groupId || "",
    s.habitId ? habitNames.get(s.habitId) || "" : "",
  ]);
  return toCsv(
    ["日付", "開始", "終了", "予定名", "カテゴリ", "メモ", "状態", "繰り返しID", "関連する習慣"],
    rows,
    [3, 4, 5, 8]
  );
}

export function habitLogsCsv(data, today) {
  const rows = [];
  for (const h of sortedHabits(data)) {
    const done = habitDoneDates(data, h.id);
    let start = h.createdAt || today;
    let end = today;
    if (done.length > 0) {
      if (done[0] < start) start = done[0];
      if (done[done.length - 1] > end) end = done[done.length - 1];
    }
    for (const d of dateRange(start, end)) {
      if (isHabitScheduled(h, d)) {
        rows.push([
          d,
          h.name,
          h.category,
          isHabitDone(data, h.id, d) ? "達成" : "未達成",
          h.active ? "有効" : "無効",
        ]);
      }
    }
  }
  rows.sort((a, b) => a[0].localeCompare(b[0]));
  return toCsv(["日付", "習慣", "カテゴリ", "結果", "習慣の状態"], rows, [1, 2]);
}

export function sleepCsv(data) {
  const rows = Object.keys(data.sleepLogs)
    .sort()
    .map((k) => {
      const r = data.sleepLogs[k];
      return [k, r.bedtime, r.wakeTime, sleepHours(r.bedtime, r.wakeTime).toFixed(2), r.quality, r.memo];
    });
  return toCsv(["日付", "就寝", "起床", "睡眠時間(h)", "睡眠の質", "メモ"], rows, [5]);
}