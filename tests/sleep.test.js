// File: tests/sleep.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { bedtimeFromNoon, sleepHours, sleepMinutes, sleepStats } from "../js/core/sleep.js";

test("sleepMinutes は日付をまたぐ睡眠を計算する", () => {
  assert.equal(sleepMinutes("23:00", "07:00"), 480);
  assert.equal(sleepMinutes("01:00", "07:30"), 390);
  assert.equal(sleepMinutes("13:00", "14:30"), 90);
  // 同じ時刻は24時間として扱う
  assert.equal(sleepMinutes("07:00", "07:00"), 1440);
});

test("sleepHours は小数第2位までの時間を返す", () => {
  assert.equal(sleepHours("23:30", "06:45"), 7.25);
  assert.equal(sleepHours("22:10", "06:00"), 7.83);
});

test("bedtimeFromNoon は0時〜11時59分を24時以降として扱う", () => {
  assert.equal(bedtimeFromNoon("23:00"), 1380);
  assert.equal(bedtimeFromNoon("01:00"), 1500);
  assert.equal(bedtimeFromNoon("12:00"), 720);
});

test("sleepStats は平均と平日・週末の起床時刻を計算する", () => {
  const logs = {
    "2024-01-01": { bedtime: "23:00", wakeTime: "07:00", quality: 4, memo: "" },
    "2024-01-06": { bedtime: "01:00", wakeTime: "09:00", quality: 2, memo: "" },
  };
  const stats = sleepStats(logs, ["2024-01-01", "2024-01-02", "2024-01-06"]);
  assert.equal(stats.count, 2);
  assert.equal(stats.avgHours, 8);
  assert.equal(stats.avgQuality, 3);
  assert.equal(stats.avgBed, 1440);
  assert.equal(stats.weekdayWake, 420);
  assert.equal(stats.weekendWake, 540);
  assert.equal(stats.sdBed, 60);
});

test("sleepStats は記録がなければ null を返す", () => {
  assert.equal(sleepStats({}, ["2024-01-01"]), null);
});