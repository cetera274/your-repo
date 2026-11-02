// File: js/pages/planner.js
import {
  addDays,
  formatClock,
  formatDuration,
  formatLong,
  isTimeStr,
  minutesToTime,
  normalizeTime,
  nowMinutes,
  todayStr,
} from "../core/date.js";
import { WINDOW_LABELS } from "../core/habits.js";
import { buildPlan, commitPlan, sleepAdvice } from "../core/planner.js";
import { state } from "../state.js";
import { getData, save } from "../store.js";
import { $, choose, escapeHtml, metric, rerender, toast } from "../ui.js";
import { openHabitEditor } from "./habit-ui.js";

const KIND_LABELS = {
  wake: "目標",
  schedule: "予定",
  fixed: "習慣（目標時刻）",
  planned: "おすすめ",
  bed: "推奨",
};

const KIND_ORDER = { wake: 0, schedule: 1, fixed: 2, planned: 3, bed: 4 };

function timelineItem(item) {
  const time = item.end > item.start ? `${formatClock(item.start)}〜${formatClock(item.end)}` : formatClock(item.start);
  const category = item.category ? `（${escapeHtml(item.category)}）` : "";
  return `
    <li class="tl-item tl-${item.kind}">
      <span class="tl-time">${time}</span>
      <span class="tl-body">
        <span class="tl-kind">${KIND_LABELS[item.kind]}</span>${escapeHtml(item.title)}${category}${item.done ? "　完了" : ""}
      </span>
    </li>
  `;
}

function notBeforeFor(date) {
  return date === todayStr() && state.planAfterNow ? nowMinutes() : null;
}

function plannedCount(plan) {
  return plan.items.filter((i) => i.kind === "planned").length;
}

function readInt(fd, name, min, max) {
  const raw = String(fd.get(name) ?? "").trim();
  const n = Number(raw);
  if (raw === "" || !Number.isInteger(n) || n < min || n > max) {
    return null;
  }
  return n;
}

function habitEditButton(h) {
  const label = escapeHtml(`習慣「${h.name}」を編集`);
  return `<button type="button" class="btn-small" data-plan-habit="${h.id}" aria-label="${label}">習慣を編集</button>`;
}

export function renderPlanner(app) {
  const data = getData();
  const { planner, targetSleep } = data.settings;
  const today = todayStr();
  const d = state.planDate;
  const isToday = d === today;
  const plan = buildPlan(data, d, { notBefore: notBeforeFor(d) });
  const advice = sleepAdvice(data, today);
  const stats = advice.stats;
  const planned = plannedCount(plan);

  const timeline = [
    { kind: "wake", start: plan.bounds.wake, end: plan.bounds.wake, title: "起床" },
    ...plan.items,
    { kind: "bed", start: plan.bounds.bed, end: plan.bounds.bed, title: "就寝" },
  ].sort((a, b) => a.start - b.start || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);

  const adviceMetrics = [
    metric("推奨の就寝時刻", formatClock(advice.recommendedBed)),
    metric("目標の起床時刻", formatClock(advice.recommendedWake)),
    metric("今夜の目安", formatClock(advice.tonight)),
  ];
  if (stats) {
    adviceMetrics.push(
      metric(`平均の就寝時刻（${stats.count}日）`, formatClock(Math.round(stats.avgBed))),
      metric(`平均の起床時刻（${stats.count}日）`, minutesToTime(Math.round(stats.avgWake))),
      metric("平均の睡眠時間", `${stats.avgHours.toFixed(1)}時間`)
    );
  }

  const warningsHtml =
    plan.warnings.length > 0
      ? `
      <h4>注意</h4>
      <ul class="plain-list">
        ${plan.warnings.map((w) => `<li class="warn">${escapeHtml(w)}</li>`).join("")}
      </ul>
    `
      : "";

  const unplacedHtml =
    plan.unplaced.length > 0
      ? `
      <h4>割り当てられなかった習慣</h4>
      <ul class="plain-list">
        ${plan.unplaced
          .map(
            (u) => `
          <li class="warn">
            ${escapeHtml(u.habit.name)}（${formatDuration(u.habit.duration)}、${WINDOW_LABELS[u.habit.window]}）：${escapeHtml(u.reason)}
            ${habitEditButton(u.habit)}
          </li>
        `
          )
          .join("")}
      </ul>
    `
      : "";

  const noDurationHtml =
    plan.noDuration.length > 0
      ? `
      <details>
        <summary>所要時間が設定されていない習慣（${plan.noDuration.length} 件）</summary>
        <p class="note">所要時間が0の習慣はおすすめの時間を計算しません。習慣の編集で所要時間を設定してください。</p>
        <ul class="plain-list">
          ${plan.noDuration
            .map((h) => `<li>${escapeHtml(h.name)}　${habitEditButton(h)}</li>`)
            .join("")}
        </ul>
      </details>
    `
      : "";

  const doneHtml =
    plan.doneHabits.length > 0
      ? `<p class="note">この日に達成済みの習慣：${plan.doneHabits.map((h) => escapeHtml(h.name)).join("、")}</p>`
      : "";

  app.innerHTML = `
    <h2>プランナー</h2>

    <section class="card" aria-labelledby="planner-sleep">
      <h3 id="planner-sleep">推奨の睡眠時間帯</h3>
      <div class="metrics">${adviceMetrics.join("")}</div>
      <ul class="plain-list">
        ${advice.messages.map((m) => `<li>${escapeHtml(m)}</li>`).join("")}
      </ul>
      <p class="note">推奨の就寝時刻は「目標の起床時刻 − 目標睡眠時間」です。平均は直近14日の睡眠記録から計算しています。</p>
    </section>

    <section class="card" aria-labelledby="planner-day">
      <h3 id="planner-day">1日の計画</h3>
      <div class="toolbar">
        <input type="date" id="plan-date" value="${d}" aria-label="計画する日付">
        <button type="button" id="btn-plan-prev">前日</button>
        <button type="button" id="btn-plan-today">今日</button>
        <button type="button" id="btn-plan-next">翌日</button>
      </div>
      <p class="caption">${formatLong(d)}</p>
      ${
        isToday
          ? `
        <label class="inline">
          <input type="checkbox" id="plan-after-now" ${state.planAfterNow ? "checked" : ""}>
          現在時刻より後だけに割り当てる
        </label>
      `
          : ""
      }
      <div class="metrics">
        ${metric("空き時間", formatDuration(plan.freeMinutes))}
        ${metric("おすすめ", `${planned} 件`)}
      </div>
      ${warningsHtml}
      <h4>タイムライン</h4>
      <ol class="timeline">${timeline.map(timelineItem).join("")}</ol>
      ${unplacedHtml}
      ${noDurationHtml}
      ${doneHtml}
      <div class="toolbar">
        <button type="button" class="btn-primary" id="btn-commit-day" ${planned === 0 ? "disabled" : ""}>おすすめを予定に登録（この日）</button>
        <button type="button" id="btn-commit-week">この日から7日分を登録</button>
      </div>
      <p class="note">
        登録した予定は習慣と連動し、どちらかを完了にすると、もう一方も完了になります。
        登録済みの習慣は、次回からおすすめの対象になりません。
      </p>
    </section>

    <section class="card" aria-labelledby="planner-settings-title">
      <h3 id="planner-settings-title">プランナーの設定</h3>
      <form id="planner-settings" novalidate>
        <div class="form-row">
          <label>目標の起床時刻
            <input type="time" name="wakeTime" id="ps-wake" value="${planner.wakeTime}" step="300">
          </label>
          <label>目標睡眠時間（時間、3〜12）
            <input type="number" name="targetSleep" id="ps-sleep" min="3" max="12" step="0.5" value="${targetSleep}">
          </label>
        </div>
        <div class="form-row">
          <label>予定の前後の余裕（分、0〜60）
            <input type="number" name="bufferMin" id="ps-buffer" min="0" max="60" step="5" value="${planner.bufferMin}">
          </label>
          <label>運動を避ける就寝前の時間（分、0〜300）
            <input type="number" name="exerciseGapMin" id="ps-exercise" min="0" max="300" step="5" value="${planner.exerciseGapMin}">
          </label>
          <label>食事を避ける就寝前の時間（分、0〜300）
            <input type="number" name="mealGapMin" id="ps-meal" min="0" max="300" step="5" value="${planner.mealGapMin}">
          </label>
        </div>
        <p class="dialog-error" id="ps-error" role="alert"></p>
        <button type="submit" class="btn-primary">設定を保存</button>
      </form>
    </section>
  `;

  $("plan-date").addEventListener("change", (e) => {
    if (e.target.value) {
      state.planDate = e.target.value;
      rerender();
    }
  });
  $("btn-plan-prev").addEventListener("click", () => {
    state.planDate = addDays(state.planDate, -1);
    rerender();
  });
  $("btn-plan-today").addEventListener("click", () => {
    state.planDate = todayStr();
    rerender();
  });
  $("btn-plan-next").addEventListener("click", () => {
    state.planDate = addDays(state.planDate, 1);
    rerender();
  });

  const afterNow = $("plan-after-now");
  if (afterNow) {
    afterNow.addEventListener("change", () => {
      state.planAfterNow = afterNow.checked;
      rerender();
    });
  }

  app.querySelectorAll("[data-plan-habit]").forEach((el) => {
    el.addEventListener("click", () => openHabitEditor(Number(el.dataset.planHabit)));
  });

  $("btn-commit-day").addEventListener("click", () => {
    const current = buildPlan(getData(), d, { notBefore: notBeforeFor(d) });
    const n = commitPlan(getData(), current);
    if (n === 0) {
      toast("登録できるおすすめがありません。", "error");
      return;
    }
    save();
    rerender();
    toast(`${n} 件のおすすめを予定に登録しました。`);
  });

  $("btn-commit-week").addEventListener("click", async () => {
    const plans = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(d, i);
      plans.push(buildPlan(getData(), date, { notBefore: notBeforeFor(date) }));
    }
    const total = plans.reduce((n, p) => n + plannedCount(p), 0);
    if (total === 0) {
      toast("登録できるおすすめがありません。", "error");
      return;
    }
    const ok = await choose(
      `${formatLong(d)}から7日分のおすすめ（${total} 件）を予定として登録します。\n登録した予定は、予定管理の画面から個別に編集・削除できます。`,
      [{ label: "登録する", value: "ok", className: "btn-primary" }]
    );
    if (!ok) {
      return;
    }
    let count = 0;
    for (const p of plans) {
      count += commitPlan(getData(), p);
    }
    save();
    rerender();
    toast(`${count} 件のおすすめを予定に登録しました。`);
  });

  $("planner-settings").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const errorEl = $("ps-error");
    const wakeTime = normalizeTime(fd.get("wakeTime"));
    const sleep = Number(String(fd.get("targetSleep") ?? "").trim());
    const bufferMin = readInt(fd, "bufferMin", 0, 60);
    const exerciseGapMin = readInt(fd, "exerciseGapMin", 0, 300);
    const mealGapMin = readInt(fd, "mealGapMin", 0, 300);

    let error = null;
    if (!isTimeStr(wakeTime)) error = "目標の起床時刻を入力してください。";
    else if (!Number.isFinite(sleep) || sleep < 3 || sleep > 12) error = "目標睡眠時間は3〜12の範囲で入力してください。";
    else if (bufferMin === null) error = "予定の前後の余裕は0〜60の整数で入力してください。";
    else if (exerciseGapMin === null || mealGapMin === null) error = "就寝前の時間は0〜300の整数で入力してください。";
    if (error) {
      errorEl.textContent = error;
      return;
    }

    const settings = getData().settings;
    settings.targetSleep = sleep;
    Object.assign(settings.planner, { wakeTime, bufferMin, exerciseGapMin, mealGapMin });
    save();
    rerender();
    toast("プランナーの設定を保存しました。");
  });
}