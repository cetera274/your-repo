// File: tests/date.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  addMonths,
  dateRange,
  datesByWeekdays,
  daysInMonth,
  diffDays,
  formatClock,
  formatDuration,
  isDateStr,
  isTimeStr,
  minutesOf,
  minutesToTime,
  weekdayIndex,
} from "../js/core/date.js";

test("addDays は月末・年末・うるう年をまたいで計算する", () => {
  assert.equal(addDays("2024-12-31", 1), "2025-01-01");
  assert.equal(addDays("2024-03-01", -1), "2024-02-29");
  assert.equal(addDays("2023-03-01", -1), "2023-02-28");
  assert.equal(addDays("2024-01-31", 30), "2024-03-01");
});

test("addMonths と daysInMonth", () => {
  assert.equal(addMonths("2024-01", -1), "2023-12");
  assert.equal(addMonths("2024-12", 1), "2025-01");
  assert.equal(daysInMonth("2024-02"), 29);
  assert.equal(daysInMonth("2023-02"), 28);
  assert.equal(daysInMonth("2024-04"), 30);
});

test("weekdayIndex は月曜日を0、日曜日を6とする", () => {
  assert.equal(weekdayIndex("2024-01-01"), 0);
  assert.equal(weekdayIndex("2024-01-06"), 5);
  assert.equal(weekdayIndex("2024-01-07"), 6);
});

test("isDateStr は実在する日付だけを受け付ける", () => {
  assert.equal(isDateStr("2024-02-29"), true);
  assert.equal(isDateStr("2023-02-29"), false);
  assert.equal(isDateStr("2024-2-1"), false);
  assert.equal(isDateStr("2024-13-01"), false);
  assert.equal(isDateStr(null), false);
});

test("isTimeStr は 00:00〜23:59 を受け付ける", () => {
  assert.equal(isTimeStr("00:00"), true);
  assert.equal(isTimeStr("23:59"), true);
  assert.equal(isTimeStr("24:00"), false);
  assert.equal(isTimeStr("7:00"), false);
});

test("dateRange と datesByWeekdays", () => {
  assert.deepEqual(dateRange("2024-01-30", "2024-02-02"), ["2024-01-30", "2024-01-31", "2024-02-01", "2024-02-02"]);
  assert.deepEqual(dateRange("2024-01-02", "2024-01-01"), []);
  assert.deepEqual(datesByWeekdays("2024-01-01", "2024-01-14", [0]), ["2024-01-01", "2024-01-08"]);
  assert.deepEqual(datesByWeekdays("2024-01-01", "2024-01-07", [5, 6]), ["2024-01-06", "2024-01-07"]);
});

test("diffDays", () => {
  assert.equal(diffDays("2024-01-01", "2024-12-31"), 365);
  assert.equal(diffDays("2024-03-31", "2024-03-01"), -30);
});

test("時刻と分の変換・表示", () => {
  assert.equal(minutesOf("07:30"), 450);
  assert.equal(minutesToTime(450), "07:30");
  assert.equal(minutesToTime(-30), "23:30");
  assert.equal(minutesToTime(1500), "01:00");
  assert.equal(formatClock(1500), "翌01:00");
  assert.equal(formatClock(1380), "23:00");
  assert.equal(formatDuration(5), "5分");
  assert.equal(formatDuration(60), "1時間");
  assert.equal(formatDuration(90), "1時間30分");
});