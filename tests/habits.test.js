// File: tests/habits.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { defaultData, normalizeData, normalizeHabitLogs } from "../js/core/data.js";
import {
  calcStreak,
  countHabitLogs,
  deleteHabitIn,
  habitDoneDates,
  isHabitDone,
  isHabitTarget,
  moveHabit,
  setHabitDoneIn,
  sortHabitsByTime,
  sortedHabits,
} from "../js/core/habits.js";

function makeData(habits = []) {
  const data = defaultData();
  data.habits = habits.map((h, i) => ({
    id: i + 1,
    name: `習慣${i + 1}`,
    category: "その他",
    targetTime: "",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    active: true,
    createdAt: "",
    order: i,
    duration: 0,
    window: "any",
    ...h,
  }));
  data.nextId = data.habits.length + 1;
  return data;
}

const ids = (list) => list.map((h) => h.id);

test("達成記録を月ごとのビットで保存・取得・削除する", () => {
  const data = makeData([{}]);
  setHabitDoneIn(data, 1, "2024-01-01", true);
  setHabitDoneIn(data, 1, "2024-01-31", true);
  assert.equal(data.habitLogs[1]["2024-01"], 1 | (1 << 30));
  assert.equal(isHabitDone(data, 1, "2024-01-31"), true);
  assert.equal(isHabitDone(data, 1, "2024-01-02"), false);
  assert.deepEqual(habitDoneDates(data, 1), ["2024-01-01", "2024-01-31"]);
  assert.equal(countHabitLogs(data), 2);

  setHabitDoneIn(data, 1, "2024-01-01", false);
  setHabitDoneIn(data, 1, "2024-01-31", false);
  assert.equal(data.habitLogs[1], undefined);
});

test("calcStreak は今日が未達成でも前日までの連続を数える", () => {
  const data = makeData([{}]);
  for (const d of ["2024-01-01", "2024-01-02", "2024-01-03"]) {
    setHabitDoneIn(data, 1, d, true);
  }
  const h = data.habits[0];
  assert.equal(calcStreak(data, h, "2024-01-04"), 3);
  setHabitDoneIn(data, 1, "2024-01-04", true);
  assert.equal(calcStreak(data, h, "2024-01-04"), 4);
  assert.equal(calcStreak(data, h, "2024-01-06"), 0);
});

test("calcStreak は実施曜日だけを数える", () => {
  const data = makeData([{ weekdays: [0, 1, 2, 3, 4] }]);
  setHabitDoneIn(data, 1, "2024-01-05", true);
  setHabitDoneIn(data, 1, "2024-01-08", true);
  // 火曜日（未達成）→ 月曜日（達成）→ 土日は対象外 → 金曜日（達成）→ 木曜日（未達成）
  assert.equal(calcStreak(data, data.habits[0], "2024-01-09"), 2);
});

test("isHabitTarget は作成日より前の日を対象外にする（記録がある日を除く）", () => {
  const data = makeData([{ createdAt: "2024-01-05" }]);
  const h = data.habits[0];
  assert.equal(isHabitTarget(data, h, "2024-01-04"), false);
  assert.equal(isHabitTarget(data, h, "2024-01-05"), true);
  setHabitDoneIn(data, 1, "2024-01-04", true);
  assert.equal(isHabitTarget(data, h, "2024-01-04"), true);
  h.active = false;
  assert.equal(isHabitTarget(data, h, "2024-01-05"), false);
});

test("moveHabit と sortHabitsByTime", () => {
  const data = makeData([{ targetTime: "21:00" }, { targetTime: "" }, { targetTime: "06:30" }]);
  assert.equal(moveHabit(data, 3, -1), true);
  assert.deepEqual(ids(sortedHabits(data)), [1, 3, 2]);
  assert.equal(moveHabit(data, 1, -1), false);
  assert.equal(moveHabit(data, 2, 1), false);
  sortHabitsByTime(data);
  assert.deepEqual(ids(sortedHabits(data)), [3, 1, 2]);
});

test("deleteHabitIn は記録を削除し、予定との連動を外し、並び順を詰める", () => {
  const data = makeData([{}, {}, {}]);
  setHabitDoneIn(data, 2, "2024-01-01", true);
  data.schedules.push({
    id: 10,
    date: "2024-01-01",
    start: "09:00",
    end: "09:30",
    title: "t",
    category: "その他",
    memo: "",
    done: false,
    groupId: null,
    habitId: 2,
  });
  deleteHabitIn(data, 2);
  assert.deepEqual(ids(sortedHabits(data)), [1, 3]);
  assert.deepEqual(data.habits.map((h) => h.order), [0, 1]);
  assert.equal(data.habitLogs[2], undefined);
  assert.equal(data.schedules[0].habitId, null);
});

test("normalizeHabitLogs は以前の形式を変換し、存在しない習慣や日を除く", () => {
  const legacy = { "1|2024-01-02": true, "2|2024-01-03": true, "1|2023-02-29": true };
  assert.deepEqual(normalizeHabitLogs(legacy, new Set([1])), { 1: { "2024-01": 2 } });

  const current = { 1: { "2024-02": 2 ** 31 - 1, "2024-13": 1 } };
  assert.deepEqual(normalizeHabitLogs(current, new Set([1])), { 1: { "2024-02": 2 ** 29 - 1 } });
});

test("normalizeData は並び順のないデータを以前の並び順（目標時刻順）で引き継ぐ", () => {
  const data = normalizeData({
    habits: [
      { id: 1, name: "読書", targetTime: "" },
      { id: 2, name: "起床", targetTime: "07:00" },
    ],
  });
  assert.deepEqual(ids(sortedHabits(data)), [2, 1]);
  assert.equal(data.habits[0].duration, 0);
  assert.equal(data.nextId, 3);
});