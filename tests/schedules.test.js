// File: tests/schedules.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { defaultData, normalizeData } from "../js/core/data.js";
import {
  applyRuleChange,
  createSchedules,
  deleteByScope,
  editByScope,
  findRule,
  groupItems,
  validateRange,
} from "../js/core/schedules.js";

const content = { title: "ジム", category: "運動", memo: "", start: "19:00", end: "20:00" };

function setup() {
  const data = defaultData();
  const r = createSchedules(data, {
    ...content,
    date: "2024-01-01",
    repeat: { until: "2024-01-14", weekdays: [0, 2] },
  });
  return { data, ruleId: r.ruleId, result: r };
}

const dates = (data, ruleId) => groupItems(data, ruleId).map((s) => s.date).sort();
const byDate = (data, date) => data.schedules.find((s) => s.date === date);

test("繰り返し予定を登録すると繰り返し設定が作られる", () => {
  const { data, ruleId, result } = setup();
  assert.equal(result.count, 4);
  assert.equal(data.recurrences.length, 1);
  assert.deepEqual(dates(data, ruleId), ["2024-01-01", "2024-01-03", "2024-01-08", "2024-01-10"]);
});

test("該当日が1日だけの場合は通常の予定として登録する", () => {
  const data = defaultData();
  const r = createSchedules(data, { ...content, date: "2024-01-01", repeat: { until: "2024-01-02", weekdays: [0] } });
  assert.equal(r.count, 1);
  assert.equal(data.schedules[0].groupId, null);
  assert.equal(data.recurrences.length, 0);
});

test("入力の検証", () => {
  const data = defaultData();
  assert.ok(createSchedules(data, { ...content, title: " ", date: "2024-01-01", repeat: null }).error);
  assert.ok(createSchedules(data, { ...content, start: "20:00", end: "19:00", date: "2024-01-01", repeat: null }).error);
  assert.equal(validateRange("2024-01-01", "2025-01-01", [0]), null);
  assert.ok(validateRange("2024-01-01", "2025-01-02", [0]));
  assert.ok(validateRange("2024-01-02", "2024-01-01", [0]));
  assert.ok(validateRange("2024-01-01", "2024-01-31", []));
});

test("1件だけ削除すると除外日になり、設定を変更しても復活しない", () => {
  const { data, ruleId } = setup();
  assert.equal(deleteByScope(data, byDate(data, "2024-01-03").id, "single"), 1);
  assert.deepEqual(findRule(data, ruleId).excludedDates, ["2024-01-03"]);

  const input = { ...content, startDate: "2024-01-01", until: "2024-01-14", weekdays: [0, 2] };
  const r1 = applyRuleChange(data, ruleId, input, { keepPast: false, today: "2024-01-01" });
  assert.deepEqual(r1, { added: 0, removed: 0, updated: 3 });

  const r2 = applyRuleChange(data, ruleId, input, { keepPast: false, today: "2024-01-01", restoreExcluded: true });
  assert.equal(r2.added, 1);
  assert.deepEqual(dates(data, ruleId), ["2024-01-01", "2024-01-03", "2024-01-08", "2024-01-10"]);
  assert.deepEqual(findRule(data, ruleId).excludedDates, []);
});

test("曜日の変更では、過去の予定を残し、完了状態を保持する", () => {
  const { data, ruleId } = setup();
  byDate(data, "2024-01-10").done = true;
  const r = applyRuleChange(
    data,
    ruleId,
    { ...content, title: "ジム（水）", startDate: "2024-01-01", until: "2024-01-14", weekdays: [2] },
    { keepPast: true, today: "2024-01-08" }
  );
  assert.deepEqual(r, { added: 0, removed: 1, updated: 1 });
  assert.deepEqual(dates(data, ruleId), ["2024-01-01", "2024-01-03", "2024-01-10"]);
  assert.equal(byDate(data, "2024-01-01").title, "ジム");
  assert.equal(byDate(data, "2024-01-10").title, "ジム（水）");
  assert.equal(byDate(data, "2024-01-10").done, true);
  assert.deepEqual(findRule(data, ruleId).weekdays, [2]);
});

test("期間を延ばすと予定が追加される", () => {
  const { data, ruleId } = setup();
  const r = applyRuleChange(
    data,
    ruleId,
    { ...content, startDate: "2024-01-01", until: "2024-01-21", weekdays: [0, 2] },
    { keepPast: false, today: "2024-01-01" }
  );
  assert.equal(r.added, 2);
  assert.equal(groupItems(data, ruleId).length, 6);
});

test("この日以降の編集で繰り返し設定が2つに分かれる", () => {
  const { data, ruleId } = setup();
  const base = byDate(data, "2024-01-08");
  const r = editByScope(
    data,
    base.id,
    { ...content, title: "ジム（新）", start: "18:00", end: "19:00", date: "2024-01-08" },
    "future"
  );
  assert.equal(r.count, 2);
  assert.equal(data.recurrences.length, 2);
  const oldRule = findRule(data, ruleId);
  assert.equal(oldRule.until, "2024-01-07");
  assert.deepEqual(dates(data, ruleId), ["2024-01-01", "2024-01-03"]);

  const newRule = data.recurrences.find((x) => x.id !== ruleId);
  assert.equal(newRule.startDate, "2024-01-08");
  assert.deepEqual(dates(data, newRule.id), ["2024-01-08", "2024-01-10"]);
  assert.equal(byDate(data, "2024-01-10").start, "18:00");
  assert.equal(byDate(data, "2024-01-01").title, "ジム");
});

test("この予定のみで日付を変えると繰り返しから外れる", () => {
  const { data, ruleId } = setup();
  const base = byDate(data, "2024-01-03");
  editByScope(data, base.id, { ...content, date: "2024-01-04" }, "single");
  assert.equal(base.groupId, null);
  assert.equal(base.date, "2024-01-04");
  assert.deepEqual(findRule(data, ruleId).excludedDates, ["2024-01-03"]);
});

test("この日以降・すべての削除", () => {
  const a = setup();
  assert.equal(deleteByScope(a.data, byDate(a.data, "2024-01-08").id, "future"), 2);
  assert.equal(findRule(a.data, a.ruleId).until, "2024-01-07");
  assert.equal(a.data.schedules.length, 2);

  const b = setup();
  assert.equal(deleteByScope(b.data, byDate(b.data, "2024-01-08").id, "all"), 4);
  assert.equal(b.data.recurrences.length, 0);
  assert.equal(b.data.schedules.length, 0);
});

test("以前のデータの繰り返しグループから繰り返し設定を復元する", () => {
  const item = { start: "09:00", end: "10:00", title: "会議", category: "仕事", groupId: 5 };
  const data = normalizeData({
    nextId: 3,
    schedules: [
      { id: 1, date: "2024-01-01", ...item },
      { id: 2, date: "2024-01-15", ...item },
    ],
  });
  assert.equal(data.recurrences.length, 1);
  const rule = data.recurrences[0];
  assert.equal(rule.id, 5);
  assert.deepEqual(rule.weekdays, [0]);
  assert.equal(rule.startDate, "2024-01-01");
  assert.equal(rule.until, "2024-01-15");
  assert.deepEqual(rule.excludedDates, ["2024-01-08"]);
  assert.equal(data.nextId, 6);
});