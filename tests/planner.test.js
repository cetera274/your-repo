// File: tests/planner.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { defaultData } from "../js/core/data.js";
import { buildPlan, commitPlan, findSlot, planBounds, sleepAdvice } from "../js/core/planner.js";

const DATE = "2024-01-01";

function habit(id, values) {
  return {
    id,
    name: `習慣${id}`,
    category: "その他",
    targetTime: "",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    active: true,
    createdAt: "",
    order: id - 1,
    duration: 0,
    window: "any",
    ...values,
  };
}

function schedule(id, start, end, values = {}) {
  return {
    id,
    date: DATE,
    start,
    end,
    title: `予定${id}`,
    category: "仕事",
    memo: "",
    done: false,
    groupId: null,
    habitId: null,
    ...values,
  };
}

function makeData(habits, schedules) {
  const data = defaultData();
  data.habits = habits;
  data.schedules = schedules;
  data.nextId = 100;
  return data;
}

const planned = (plan) => plan.items.filter((i) => i.kind === "planned");

test("planBounds は目標の起床時刻と睡眠時間から就寝時刻を計算する", () => {
  const data = defaultData();
  assert.deepEqual(planBounds(data.settings), { wake: 420, bed: 1440, end: 1439 });
  data.settings.planner.wakeTime = "06:00";
  data.settings.targetSleep = 8;
  assert.deepEqual(planBounds(data.settings), { wake: 360, bed: 1320, end: 1320 });
});

test("findSlot は余裕時間を空けた最も早い空き時間を返す", () => {
  assert.equal(findSlot([[540, 600]], 420, 1439, 60, 10), 420);
  assert.equal(findSlot([[420, 600]], 420, 1439, 30, 10), 610);
  assert.equal(findSlot([[420, 1439]], 420, 1439, 30, 0), null);
});

test("buildPlan は予定を避け、条件の厳しい習慣から割り当てる", () => {
  const data = makeData(
    [
      habit(1, { name: "読書", category: "勉強", duration: 30 }),
      habit(2, { name: "ジョギング", category: "運動", duration: 60, window: "evening" }),
    ],
    [schedule(10, "09:00", "17:00")]
  );
  const plan = buildPlan(data, DATE);
  const result = Object.fromEntries(planned(plan).map((i) => [i.title, [i.start, i.end]]));
  assert.deepEqual(result, { 読書: [420, 450], ジョギング: [1080, 1140] });
  assert.equal(plan.unplaced.length, 0);
  assert.equal(plan.freeMinutes, 1019 - 480 - 60 - 30);
});

test("運動は就寝前の指定時間に入れない", () => {
  const data = makeData([habit(1, { category: "運動", duration: 60, window: "beforeBed" })], []);
  const plan = buildPlan(data, DATE);
  assert.equal(planned(plan).length, 0);
  assert.equal(plan.unplaced.length, 1);
});

test("notBefore より前には割り当てない", () => {
  const data = makeData([habit(1, { duration: 30 })], [schedule(10, "09:00", "17:00")]);
  const plan = buildPlan(data, DATE, { notBefore: 600 });
  assert.equal(planned(plan)[0].start, 1030);
});

test("達成済み・所要時間0の習慣は割り当てない", () => {
  const data = makeData([habit(1, { duration: 30 }), habit(2, { duration: 0 })], []);
  data.habitLogs = { 1: { "2024-01": 1 } };
  const plan = buildPlan(data, DATE);
  assert.equal(planned(plan).length, 0);
  assert.deepEqual(plan.doneHabits.map((h) => h.id), [1]);
  assert.deepEqual(plan.noDuration.map((h) => h.id), [2]);
});

test("予定の重なりと、目標時刻のある習慣との重なりを知らせる", () => {
  const data = makeData(
    [habit(1, { name: "瞑想", targetTime: "09:30", duration: 15 })],
    [schedule(10, "09:00", "10:00"), schedule(11, "09:30", "11:00")]
  );
  const plan = buildPlan(data, DATE);
  assert.ok(plan.warnings.some((w) => w.includes("予定10") && w.includes("予定11")));
  assert.ok(plan.warnings.some((w) => w.includes("瞑想")));
});

test("起床前と就寝後の予定を知らせる", () => {
  const data = makeData([], [schedule(10, "06:00", "06:30"), schedule(11, "22:00", "23:30", { category: "食事" })]);
  const plan = buildPlan(data, DATE);
  assert.ok(plan.warnings.some((w) => w.includes("起床予定時刻")));
  assert.ok(plan.warnings.some((w) => w.includes("就寝前120分")));
});

test("commitPlan はおすすめを習慣と連動した予定として登録する", () => {
  const data = makeData(
    [habit(1, { name: "読書", duration: 30 }), habit(2, { name: "散歩", duration: 20 })],
    []
  );
  const plan = buildPlan(data, DATE);
  assert.equal(commitPlan(data, plan), 2);
  assert.deepEqual(data.schedules.map((s) => s.habitId).sort(), [1, 2]);
  assert.equal(planned(buildPlan(data, DATE)).length, 0);
});

test("sleepAdvice は記録がなければ推奨時刻だけを返す", () => {
  const advice = sleepAdvice(defaultData(), "2024-01-10");
  assert.equal(advice.stats, null);
  assert.equal(advice.recommendedBed, 1440);
  assert.equal(advice.tonight, 1440);
});

test("sleepAdvice は平均が遅い場合、平均より約15分早い時刻を今夜の目安にする", () => {
  const data = defaultData();
  for (const d of ["2024-01-08", "2024-01-09", "2024-01-10"]) {
    data.sleepLogs[d] = { bedtime: "01:00", wakeTime: "07:00", quality: 3, memo: "" };
  }
  const advice = sleepAdvice(data, "2024-01-10");
  assert.equal(advice.stats.count, 3);
  assert.equal(advice.tonight, 1485);
  assert.ok(advice.messages.some((m) => m.includes("遅く")));
  assert.ok(advice.messages.some((m) => m.includes("短く")));
});