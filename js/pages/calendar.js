// File: js/pages/calendar.js
import {
  WEEKDAYS,
  addDays,
  addMonths,
  dateRange,
  daysInMonth,
  formatLong,
  pad,
  todayStr,
  weekdayIndex,
} from "../core/date.js";
import { isHabitDone, isHabitTarget } from "../core/habits.js";
import { schedulesBetween } from "../core/schedules.js";
import { state } from "../state.js";
import { getData } from "../store.js";
import { $, escapeHtml, metric, rerender } from "../ui.js";

const MAX_TITLES = 3;
let focusDate = null;

function dayRate(data, date) {
  const targets = data.habits.filter((h) => isHabitTarget(data, h, date));
  if (targets.length === 0) {
    return null;
  }
  const done = targets.filter((h) => isHabitDone(data, h.id, date)).length;
  return { done, total: targets.length, rate: done / targets.length };
}

function level(rate) {
  if (rate === 0) return 0;
  if (rate < 0.5) return 1;
  if (rate < 0.8) return 2;
  if (rate < 1) return 3;
  return 4;
}

function shiftMonth(date, n) {
  const ym = addMonths(date.slice(0, 7), n);
  const day = Math.min(Number(date.slice(8, 10)), daysInMonth(ym));
  return `${ym}-${pad(day)}`;
}

function openDay(date) {
  state.todayDate = date;
  location.hash = "#today";
}

function moveFocus(date) {
  focusDate = date;
  if (date.slice(0, 7) !== state.calMonth) {
    state.calMonth = date.slice(0, 7);
    rerender();
  } else {
    document.querySelectorAll("#app [data-date]").forEach((el) => {
      el.tabIndex = el.dataset.date === date ? 0 : -1;
    });
  }
  const el = document.querySelector(`#app [data-date="${date}"]`);
  if (el) {
    el.focus();
  }
}

function monthLabel(ym) {
  const [y, m] = ym.split("-").map(Number);
  return `${y}年${m}月`;
}

export function renderCalendar(app) {
  const data = getData();
  const today = todayStr();
  const ym = state.calMonth;
  const first = `${ym}-01`;
  const last = `${ym}-${pad(daysInMonth(ym))}`;
  const start = addDays(first, -weekdayIndex(first));
  const end = addDays(last, 6 - weekdayIndex(last));
  const dates = dateRange(start, end);

  const byDate = new Map();
  for (const s of schedulesBetween(data, start, end)) {
    if (!byDate.has(s.date)) {
      byDate.set(s.date, []);
    }
    byDate.get(s.date).push(s);
  }

  if (!focusDate || focusDate.slice(0, 7) !== ym) {
    focusDate = today.slice(0, 7) === ym ? today : first;
  }

  let rateSum = 0;
  let rateDays = 0;
  let monthSchedules = 0;
  let monthDone = 0;

  const cells = dates
    .map((date) => {
      const inMonth = date.slice(0, 7) === ym;
      const r = date <= today ? dayRate(data, date) : null;
      const items = byDate.get(date) || [];
      if (inMonth) {
        if (r) {
          rateSum += r.rate;
          rateDays += 1;
        }
        monthSchedules += items.length;
        monthDone += items.filter((s) => s.done).length;
      }

      const cls = ["cal-cell"];
      if (!inMonth) cls.push("other");
      if (date === today) cls.push("today");
      if (r) cls.push(`lv-${level(r.rate)}`);

      const labelParts = [formatLong(date)];
      if (date === today) labelParts.push("今日");
      if (r) labelParts.push(`習慣 ${r.total}件中${r.done}件達成`);
      labelParts.push(items.length > 0 ? `予定 ${items.length}件` : "予定なし");

      const titles = items
        .slice(0, MAX_TITLES)
        .map(
          (s) =>
            `<span class="cal-item ${s.done ? "is-done" : ""}">${escapeHtml(s.start)} ${escapeHtml(s.title)}</span>`
        )
        .join("");
      const more = items.length > MAX_TITLES ? `<span class="cal-item">ほか${items.length - MAX_TITLES}件</span>` : "";

      return `
        <button type="button" class="${cls.join(" ")}" data-date="${date}"
          tabindex="${date === focusDate ? 0 : -1}" aria-label="${escapeHtml(labelParts.join("、"))}">
          <span class="cal-day" aria-hidden="true">${Number(date.slice(8, 10))}</span>
          <span class="cal-titles" aria-hidden="true">${titles}${more}</span>
          <span class="cal-count" aria-hidden="true">${items.length > 0 ? `${items.length}件` : ""}</span>
        </button>
      `;
    })
    .join("");

  const avgRate = rateDays > 0 ? `${Math.round((rateSum / rateDays) * 100)}%` : "記録なし";

  app.innerHTML = `
    <h2>カレンダー</h2>
    <div class="toolbar">
      <button type="button" id="btn-cal-prev" aria-label="前の月">前の月</button>
      <button type="button" id="btn-cal-today">今月</button>
      <button type="button" id="btn-cal-next" aria-label="次の月">次の月</button>
      <span class="cal-title" id="cal-title">${monthLabel(ym)}</span>
    </div>

    <div class="metrics">
      ${metric("習慣の平均達成率（今日まで）", avgRate)}
      ${metric("予定", `${monthSchedules}件（完了 ${monthDone}件）`)}
    </div>

    <section class="card">
      <div class="cal-grid" role="group" aria-labelledby="cal-title" aria-describedby="cal-help" id="cal-grid">
        ${WEEKDAYS.map((w) => `<div class="cal-head" aria-hidden="true">${w}</div>`).join("")}
        ${cells}
      </div>
      <p class="note" id="cal-help">
        日付を選ぶとその日の画面を開きます。矢印キーで日付を移動、Home・Endで週の始め・終わり、Page Up・Page Downで前後の月に移動します。
      </p>
      <ul class="legend" aria-label="凡例">
        <li><i class="lv-0"></i>達成なし</li>
        <li><i class="lv-1"></i>50%未満</li>
        <li><i class="lv-2"></i>50〜79%</li>
        <li><i class="lv-3"></i>80〜99%</li>
        <li><i class="lv-4"></i>すべて達成</li>
      </ul>
    </section>
  `;

  $("btn-cal-prev").addEventListener("click", () => {
    state.calMonth = addMonths(state.calMonth, -1);
    focusDate = null;
    rerender();
  });
  $("btn-cal-today").addEventListener("click", () => {
    state.calMonth = todayStr().slice(0, 7);
    focusDate = null;
    rerender();
  });
  $("btn-cal-next").addEventListener("click", () => {
    state.calMonth = addMonths(state.calMonth, 1);
    focusDate = null;
    rerender();
  });

  const grid = $("cal-grid");
  grid.addEventListener("click", (e) => {
    const cell = e.target.closest("[data-date]");
    if (cell) {
      openDay(cell.dataset.date);
    }
  });
  grid.addEventListener("focusin", (e) => {
    const cell = e.target.closest("[data-date]");
    if (cell) {
      focusDate = cell.dataset.date;
    }
  });
  grid.addEventListener("keydown", (e) => {
    const cell = e.target.closest("[data-date]");
    if (!cell) {
      return;
    }
    const date = cell.dataset.date;
    let next = null;
    switch (e.key) {
      case "ArrowLeft":
        next = addDays(date, -1);
        break;
      case "ArrowRight":
        next = addDays(date, 1);
        break;
      case "ArrowUp":
        next = addDays(date, -7);
        break;
      case "ArrowDown":
        next = addDays(date, 7);
        break;
      case "Home":
        next = addDays(date, -weekdayIndex(date));
        break;
      case "End":
        next = addDays(date, 6 - weekdayIndex(date));
        break;
      case "PageUp":
        next = shiftMonth(date, -1);
        break;
      case "PageDown":
        next = shiftMonth(date, 1);
        break;
      default:
        return;
    }
    e.preventDefault();
    moveFocus(next);
  });
}