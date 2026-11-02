// File: tests/csv.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { defaultData } from "../js/core/data.js";
import { csvCell, habitLogsCsv, schedulesCsv, sleepCsv, toCsv } from "../js/core/csv.js";
import { setHabitDoneIn } from "../js/core/habits.js";

test("csvCell は区切り文字と引用符をエスケープする", () => {
  assert.equal(csvCell("abc"), "abc");
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell("1行目\n2行目"), '"1行目\n2行目"');
  assert.equal(csvCell(null), "");
});

test("csvCell は文字列の列で数式として解釈される先頭文字を無効にする", () => {
  assert.equal(csvCell("=SUM(A1)", true), "'=SUM(A1)");
  assert.equal(csvCell("+81", true), "'+81");
  assert.equal(csvCell("-5", false), "-5");
});

test("toCsv はBOMとCRLFで出力する", () => {
  assert.equal(toCsv(["a", "b"], [["1", "x\ny"]]), '\uFEFFa,b\r\n1,"x\ny"\r\n');
});

test("schedulesCsv", () => {
  const data = defaultData();
  data.schedules.push({
    id: 1,
    date: "2024-01-01",
    start: "09:00",
    end: "10:00",
    title: "会議, 定例",
    category: "仕事",
    memo: "",
    done: true,
    groupId: null,
    habitId: null,
  });
  const lines = schedulesCsv(data).replace("\uFEFF", "").split("\r\n");
  assert.equal(lines[0], "日付,開始,終了,予定名,カテゴリ,メモ,状態,繰り返しID,関連する習慣");
  assert.equal(lines[1], '2024-01-01,09:00,10:00,"会議, 定例",仕事,,完了,,');
});

test("habitLogsCsv は作成日から今日までの実施曜日を出力する", () => {
  const data = defaultData();
  data.habits.push({
    id: 1,
    name: "読書",
    category: "勉強",
    targetTime: "",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    active: true,
    createdAt: "2024-01-01",
    order: 0,
    duration: 0,
    window: "any",
  });
  setHabitDoneIn(data, 1, "2024-01-02", true);
  const lines = habitLogsCsv(data, "2024-01-03").replace("\uFEFF", "").trim().split("\r\n");
  assert.equal(lines.length, 4);
  assert.equal(lines[1], "2024-01-01,読書,勉強,未達成,有効");
  assert.equal(lines[2], "2024-01-02,読書,勉強,達成,有効");
});

test("sleepCsv", () => {
  const data = defaultData();
  data.sleepLogs["2024-01-02"] = { bedtime: "23:00", wakeTime: "07:00", quality: 4, memo: "=test" };
  const lines = sleepCsv(data).replace("\uFEFF", "").trim().split("\r\n");
  assert.equal(lines[1], "2024-01-02,23:00,07:00,8.00,4,'=test");
});