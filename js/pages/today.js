// File: js/pages/today.js
import { addDays, formatClock, formatDate, todayStr } from "../core/date.js";
import { habitLabel, habitsForDate, isHabitDone, sortedHabits } from "../core/habits.js";
import { buildPlan } from "../core/planner.js";
import { schedulesBetween } from "../core/schedules.js";
import { sleepHours } from "../core/sleep.js";
import { setHabitDone } from "../actions.js";
import { state } from "../state.js";
import { getData } from "../store.js";
import { $, escapeHtml, rerender } from "../ui.js";
import { bindScheduleActions, scheduleItemHtml } from "./schedule-ui.js";

export function renderToday(app) {
  const data = getData();
  const d = state.todayDate;
  const habits = habitsForDate(data, d);
  const schedules = schedulesBetween(data, d, d);
  const sleep = data.sleepLogs[d];
  const plan = buildPlan(data, d);
  const recommended = new Map(
    plan.items.filter((i) => i.kind === "planned").map((i) => [i.habitId, i])
  );
  const linked = new Set(schedules.map((s) => s.habitId).filter(Boolean));

  let habitHtml;
  if (sortedHabits(data, true).length === 0) {
    habitHtml = `<p class="info">「習慣設定」から習慣を登録してください。</p>`;
  } else if (habits.length === 0) {
    habitHtml = `<p class="info">この日に実施する習慣はありません。</p>`;
  } else {
    const doneCount = habits.filter((h) => isHabitDone(data, h.id, d)).length;
    const rate = Math.round((doneCount / habits.length) * 100);
    habitHtml = `
      <ul class="check-list">
        ${habits
          .map((h) => {
            const rec = recommended.get(h.id);
            let hint = "";
            if (rec && !isHabitDone(data, h.id, d)) {
              hint = `<p class="memo"><span class="rec">おすすめ ${formatClock(rec.start)}〜${formatClock(rec.end)}</span></p>`;
            } else if (linked.has(h.id)) {
              hint = `<p class="memo">予定に登録済み</p>`;
            }
            return `
              <li>
                <label class="inline">
                  <input type="checkbox" data-habit="${h.id}" ${isHabitDone(data, h.id, d) ? "checked" : ""}>
                  <span>${escapeHtml(habitLabel(h))}</span>
                </label>
                ${hint}
              </li>
            `;
          })
          .join("")}
      </ul>
      <div class="progress" role="progressbar" aria-label="習慣の達成率" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${rate}">
        <div class="progress-bar" style="width: ${rate}%"></div>
      </div>
      <p>達成：${doneCount} / ${habits.length}（${rate}%）</p>
      <p class="note"><a href="#planner" id="link-planner">プランナー</a>で、空き時間に合わせたおすすめの時間を確認し、予定に登録できます。</p>
    `;
  }

  let scheduleHtml;
  if (schedules.length === 0) {
    scheduleHtml = `<p class="info">この日の予定はありません。</p>`;
  } else {
    const doneCount = schedules.filter((s) => s.done).length;
    scheduleHtml = `
      <ul class="schedule-list">${schedules.map(scheduleItemHtml).join("")}</ul>
      <p>完了：${doneCount} / ${schedules.length}</p>
    `;
  }

  let sleepHtml;
  if (!sleep) {
    sleepHtml = `<p>記録がありません。「睡眠記録」から登録できます。</p>`;
  } else {
    sleepHtml = `
      <p>
        就寝 ${escapeHtml(sleep.bedtime)} → 起床 ${escapeHtml(sleep.wakeTime)}　
        睡眠時間 ${sleepHours(sleep.bedtime, sleep.wakeTime).toFixed(1)} 時間　睡眠の質 ${escapeHtml(sleep.quality)} / 5
      </p>
      ${sleep.memo ? `<p class="memo">${escapeHtml(sleep.memo)}</p>` : ""}
    `;
  }

  app.innerHTML = `
    <h2>今日のチェック</h2>
    <div class="toolbar">
      <input type="date" id="today-date" value="${d}" aria-label="表示する日付">
      <button type="button" id="btn-prev">前日</button>
      <button type="button" id="btn-today">今日</button>
      <button type="button" id="btn-next">翌日</button>
    </div>
    <p class="caption">${formatDate(d)}</p>

    <div class="grid-2">
      <section class="card" aria-labelledby="today-habits">
        <h3 id="today-habits">習慣</h3>
        ${habitHtml}
      </section>
      <section class="card" aria-labelledby="today-schedules">
        <h3 id="today-schedules">予定</h3>
        ${scheduleHtml}
      </section>
    </div>

    <section class="card" aria-labelledby="today-sleep">
      <h3 id="today-sleep">睡眠（この日の起床分）</h3>
      ${sleepHtml}
    </section>
  `;

  $("today-date").addEventListener("change", (e) => {
    if (e.target.value) {
      state.todayDate = e.target.value;
      rerender();
    }
  });
  $("btn-prev").addEventListener("click", () => {
    state.todayDate = addDays(state.todayDate, -1);
    rerender();
  });
  $("btn-today").addEventListener("click", () => {
    state.todayDate = todayStr();
    rerender();
  });
  $("btn-next").addEventListener("click", () => {
    state.todayDate = addDays(state.todayDate, 1);
    rerender();
  });

  const plannerLink = $("link-planner");
  if (plannerLink) {
    plannerLink.addEventListener("click", () => {
      state.planDate = d;
    });
  }

  app.querySelectorAll("[data-habit]").forEach((el) => {
    el.addEventListener("change", () => {
      setHabitDone(Number(el.dataset.habit), d, el.checked);
      rerender();
    });
  });

  bindScheduleActions(app);
}