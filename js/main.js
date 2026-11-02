// File: js/main.js
import { todayStr } from "./core/date.js";
import { renderCalendar } from "./pages/calendar.js";
import { renderHabits } from "./pages/habits.js";
import { renderPlanner } from "./pages/planner.js";
import { renderReview } from "./pages/review.js";
import { renderSchedule } from "./pages/schedule.js";
import { renderSettings } from "./pages/settings.js";
import { renderSleep } from "./pages/sleep.js";
import { renderToday } from "./pages/today.js";
import { initPwa } from "./pwa.js";
import { startReminders } from "./reminders.js";
import { state } from "./state.js";
import { PREFS_KEY, STORAGE_KEY, getPrefs, onSave, reloadData, reloadPrefs } from "./store.js";
import { canAutoSync, runSync, scheduleAutoSync, syncTask } from "./sync.js";
import { $, applyTheme, destroyCharts, focusHeading, initDialogs, rerender, setRenderer } from "./ui.js";

const APP_NAME = "生活習慣プランナー";

const PAGES = {
  today: { label: "今日", render: renderToday },
  planner: { label: "プランナー", render: renderPlanner },
  calendar: { label: "カレンダー", render: renderCalendar },
  schedule: { label: "予定管理", render: renderSchedule },
  habits: { label: "習慣設定", render: renderHabits },
  sleep: { label: "睡眠記録", render: renderSleep },
  review: { label: "振り返り", render: renderReview },
  settings: { label: "設定", render: renderSettings },
};

function pageFromHash() {
  const key = location.hash.replace(/^#/, "");
  return Object.hasOwn(PAGES, key) ? key : "today";
}

function render() {
  destroyCharts();
  const app = $("app");
  const page = PAGES[state.page];
  document.title = `${page.label} - ${APP_NAME}`;
  document.querySelectorAll("#nav a").forEach((a) => {
    const active = a.dataset.page === state.page;
    a.classList.toggle("active", active);
    if (active) {
      a.setAttribute("aria-current", "page");
    } else {
      a.removeAttribute("aria-current");
    }
  });
  try {
    page.render(app);
  } catch (e) {
    console.error(e);
    app.innerHTML = `
      <h2>エラー</h2>
      <p class="info">画面を表示できませんでした。ページを再読み込みしてください。解決しない場合は「設定」からデータをエクスポートしてください。</p>
    `;
  }
}

function autoSync() {
  if (canAutoSync()) {
    runSync(syncTask, { silent: true });
  }
}

// 日付が変わったら、今日を表示していた画面を新しい日付に合わせる
function watchDateChange() {
  let lastToday = todayStr();
  setInterval(() => {
    const t = todayStr();
    if (t === lastToday) {
      return;
    }
    for (const key of ["todayDate", "sleepDate", "planDate", "weekStart"]) {
      if (state[key] === lastToday) {
        state[key] = t;
      }
    }
    if (state.calMonth === lastToday.slice(0, 7)) {
      state.calMonth = t.slice(0, 7);
    }
    lastToday = t;
    if (!document.querySelector("dialog[open]")) {
      rerender();
    }
  }, 60000);
}

function init() {
  applyTheme(getPrefs().theme);
  setRenderer(render);
  initDialogs();

  state.page = pageFromHash();
  render();

  window.addEventListener("hashchange", () => {
    state.page = pageFromHash();
    render();
    window.scrollTo(0, 0);
    focusHeading();
  });

  // スキップリンクで URL のハッシュを変えない（画面の切り替えと区別する）
  $("skip-link").addEventListener("click", (e) => {
    e.preventDefault();
    $("app").focus();
  });

  // 他のタブでの変更を反映する
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) {
      reloadData();
      rerender();
    } else if (e.key === PREFS_KEY) {
      reloadPrefs();
      applyTheme(getPrefs().theme);
      startReminders();
      rerender();
    }
  });

  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (getPrefs().theme === "system") {
        applyTheme("system");
        rerender();
      }
    });
  }

  onSave(scheduleAutoSync);

  initPwa(() => {
    if (state.page === "settings") {
      rerender();
    }
  });

  startReminders();
  autoSync();
  window.addEventListener("online", autoSync);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      autoSync();
    }
  });

  watchDateChange();
}

init();