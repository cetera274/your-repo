// File: js/pages/review.js
import { addDays, formatShort, todayStr } from "../core/date.js";
import { calcStreak, habitLabel, isHabitDone, isHabitTarget, sortedHabits } from "../core/habits.js";
import { schedulesBetween } from "../core/schedules.js";
import { sleepHours } from "../core/sleep.js";
import { state } from "../state.js";
import { getData } from "../store.js";
import { $, cssVar, escapeHtml, makeChart, metric, rerender } from "../ui.js";

const PERIODS = [7, 14, 30, 90];

function mean(list) {
  return list.length === 0 ? null : list.reduce((a, b) => a + b, 0) / list.length;
}

export function renderReview(app) {
  const data = getData();
  const today = todayStr();
  const days = state.reviewDays;
  const dates = [];
  for (let i = days - 1; i >= 0; i--) {
    dates.push(addDays(today, -i));
  }
  const first = dates[0];

  const rates = dates.map((d) => {
    const targets = data.habits.filter((h) => isHabitTarget(data, h, d));
    if (targets.length === 0) {
      return null;
    }
    return targets.filter((h) => isHabitDone(data, h.id, d)).length / targets.length;
  });
  const validRates = rates.filter((r) => r !== null);
  const avgRate = mean(validRates);

  const schedules = schedulesBetween(data, first, today);
  const doneSchedules = schedules.filter((s) => s.done).length;

  const hours = dates.map((d) => {
    const r = data.sleepLogs[d];
    return r ? sleepHours(r.bedtime, r.wakeTime) : null;
  });
  const validHours = hours.filter((h) => h !== null);
  const qualities = dates.filter((d) => data.sleepLogs[d]).map((d) => Number(data.sleepLogs[d].quality));
  const avgHours = mean(validHours);
  const avgQuality = mean(qualities);
  const target = data.settings.targetSleep;

  const habitRows = sortedHabits(data, true).map((h) => {
    const targetDays = dates.filter((d) => isHabitTarget(data, h, d));
    const done = targetDays.filter((d) => isHabitDone(data, h.id, d)).length;
    const rate = targetDays.length > 0 ? `${Math.round((done / targetDays.length) * 100)}%` : "対象日なし";
    return `
      <tr>
        <th scope="row">${escapeHtml(habitLabel(h))}</th>
        <td>${targetDays.length}</td>
        <td>${done}</td>
        <td>${rate}</td>
        <td>${calcStreak(data, h, today)}日</td>
      </tr>
    `;
  });

  app.innerHTML = `
    <h2>振り返り</h2>
    <div class="toolbar">
      <label class="inline">期間
        <select id="review-days">
          ${PERIODS.map((p) => `<option value="${p}" ${p === days ? "selected" : ""}>直近${p}日</option>`).join("")}
        </select>
      </label>
      <span class="caption">${formatShort(first)}〜${formatShort(today)}</span>
    </div>

    <div class="metrics">
      ${metric("習慣の平均達成率", avgRate === null ? "記録なし" : `${Math.round(avgRate * 100)}%`)}
      ${metric("予定の完了", schedules.length === 0 ? "予定なし" : `${doneSchedules} / ${schedules.length}`)}
      ${metric("平均睡眠時間", avgHours === null ? "記録なし" : `${avgHours.toFixed(1)}時間`)}
      ${metric("平均の睡眠の質", avgQuality === null ? "記録なし" : `${avgQuality.toFixed(1)} / 5`)}
    </div>

    <section class="card" aria-labelledby="review-habit-chart">
      <h3 id="review-habit-chart">習慣の達成率の推移</h3>
      <div class="chart-box"><canvas id="chart-habits"></canvas></div>
    </section>

    <section class="card" aria-labelledby="review-sleep-chart">
      <h3 id="review-sleep-chart">睡眠時間の推移</h3>
      <div class="chart-box"><canvas id="chart-sleep"></canvas></div>
    </section>

    <section class="card" aria-labelledby="review-habit-table">
      <h3 id="review-habit-table">習慣ごとの結果</h3>
      ${
        habitRows.length === 0
          ? `<p class="info">有効な習慣がありません。</p>`
          : `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">習慣</th>
                <th scope="col">対象日数</th>
                <th scope="col">達成日数</th>
                <th scope="col">達成率</th>
                <th scope="col">連続達成</th>
              </tr>
            </thead>
            <tbody>${habitRows.join("")}</tbody>
          </table>
        </div>
      `
      }
    </section>
  `;

  $("review-days").addEventListener("change", (e) => {
    state.reviewDays = Number(e.target.value);
    rerender();
  });

  const labels = dates.map(formatShort);
  const habitDesc =
    avgRate === null
      ? `直近${days}日の習慣の達成率。記録はありません。`
      : `直近${days}日の習慣の達成率の棒グラフ。記録のある${validRates.length}日の平均は${Math.round(avgRate * 100)}%。`;
  makeChart(
    "chart-habits",
    {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "習慣の達成率（%）",
            data: rates.map((r) => (r === null ? null : Math.round(r * 100))),
            backgroundColor: cssVar("--success"),
          },
        ],
      },
      options: {
        scales: { y: { min: 0, max: 100 } },
        plugins: { legend: { display: false } },
      },
    },
    habitDesc
  );

  const sleepDesc =
    avgHours === null
      ? `直近${days}日の睡眠時間。記録はありません。`
      : `直近${days}日の睡眠時間の折れ線グラフ。記録のある${validHours.length}日の平均は${avgHours.toFixed(1)}時間、目標は${target}時間。`;
  makeChart(
    "chart-sleep",
    {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "睡眠時間（時間）",
            data: hours,
            borderColor: cssVar("--primary"),
            backgroundColor: cssVar("--primary"),
            spanGaps: true,
            tension: 0.2,
          },
          {
            label: `目標（${target}時間）`,
            data: dates.map(() => target),
            borderColor: cssVar("--warning"),
            borderDash: [6, 4],
            pointRadius: 0,
          },
        ],
      },
      options: {
        scales: { y: { suggestedMin: 0, suggestedMax: 12 } },
      },
    },
    sleepDesc
  );
}