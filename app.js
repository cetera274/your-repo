// File: app.js
"use strict";

const STORAGE_KEY = "habitPlanner.v1";
const CATEGORIES = ["睡眠", "食事", "運動", "勉強", "仕事", "休息", "その他"];
const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];
const PAGES = ["today", "schedule", "habits", "sleep", "review", "data"];

// =========================
// 日付・時刻ユーティリティ
// =========================
function pad(n) {
  return String(n).padStart(2, "0");
}

function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function todayStr() {
  return toDateStr(new Date());
}

function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

// 月曜日 = 0 〜 日曜日 = 6
function weekdayIndex(s) {
  return (parseDate(s).getDay() + 6) % 7;
}

function diffDays(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

function formatDate(s) {
  const d = parseDate(s);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}（${WEEKDAYS[weekdayIndex(s)]}）`;
}

function formatShort(s) {
  const d = parseDate(s);
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}（${WEEKDAYS[weekdayIndex(s)]}）`;
}

function sleepHours(bed, wake) {
  const [bh, bm] = bed.split(":").map(Number);
  const [wh, wm] = wake.split(":").map(Number);
  let mins = wh * 60 + wm - (bh * 60 + bm);
  if (mins <= 0) {
    mins += 24 * 60;
  }
  return Math.round((mins / 60) * 100) / 100;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// =========================
// データ保存（localStorage）
// =========================
function defaultData() {
  return {
    version: 1,
    nextId: 1,
    habits: [],
    habitLogs: {},
    schedules: [],
    sleepLogs: {},
    settings: { targetSleep: 7 },
  };
}

function normalizeData(obj) {
  const base = defaultData();
  if (!obj || typeof obj !== "object") {
    return base;
  }
  const result = {
    version: 1,
    nextId: Number.isInteger(obj.nextId) && obj.nextId > 0 ? obj.nextId : 1,
    habits: Array.isArray(obj.habits) ? obj.habits : [],
    habitLogs: obj.habitLogs && typeof obj.habitLogs === "object" ? obj.habitLogs : {},
    schedules: Array.isArray(obj.schedules) ? obj.schedules : [],
    sleepLogs: obj.sleepLogs && typeof obj.sleepLogs === "object" ? obj.sleepLogs : {},
    settings: Object.assign(base.settings, obj.settings || {}),
  };
  const maxId = Math.max(
    0,
    ...result.habits.map((h) => Number(h.id) || 0),
    ...result.schedules.map((s) => Number(s.id) || 0)
  );
  if (result.nextId <= maxId) {
    result.nextId = maxId + 1;
  }
  return result;
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultData();
    }
    return normalizeData(JSON.parse(raw));
  } catch (e) {
    console.error(e);
    return defaultData();
  }
}

let data = loadData();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error(e);
    toast("データを保存できませんでした。ブラウザの設定や空き容量を確認してください。", "error");
  }
}

function newId() {
  const id = data.nextId;
  data.nextId += 1;
  return id;
}

// ---------- 習慣 ----------
function sortedHabits(activeOnly) {
  return data.habits
    .filter((h) => !activeOnly || h.active)
    .sort((a, b) => {
      if (!a.targetTime && b.targetTime) return 1;
      if (a.targetTime && !b.targetTime) return -1;
      if (a.targetTime !== b.targetTime) return a.targetTime < b.targetTime ? -1 : 1;
      return a.id - b.id;
    });
}

function habitLabel(h) {
  const time = h.targetTime ? `${h.targetTime}　` : "";
  return `${time}${h.name}（${h.category}）`;
}

function logKey(habitId, dateStr) {
  return `${habitId}|${dateStr}`;
}

function isHabitDone(habitId, dateStr) {
  return data.habitLogs[logKey(habitId, dateStr)] === true;
}

function setHabitDone(habitId, dateStr, done) {
  const key = logKey(habitId, dateStr);
  if (done) {
    data.habitLogs[key] = true;
  } else {
    delete data.habitLogs[key];
  }
  save();
}

function deleteHabit(habitId) {
  data.habits = data.habits.filter((h) => h.id !== habitId);
  const prefix = `${habitId}|`;
  for (const key of Object.keys(data.habitLogs)) {
    if (key.startsWith(prefix)) {
      delete data.habitLogs[key];
    }
  }
  save();
}

function calcStreak(habitId, today) {
  let d = today;
  if (!isHabitDone(habitId, d)) {
    d = addDays(d, -1);
  }
  let streak = 0;
  while (isHabitDone(habitId, d)) {
    streak += 1;
    d = addDays(d, -1);
  }
  return streak;
}

// ---------- 予定 ----------
function schedulesBetween(start, end) {
  return data.schedules
    .filter((s) => s.date >= start && s.date <= end)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.start.localeCompare(b.start) ||
        a.id - b.id
    );
}

function setScheduleDone(id, done) {
  const s = data.schedules.find((x) => x.id === id);
  if (s) {
    s.done = done;
    save();
  }
}

function deleteSchedule(id) {
  data.schedules = data.schedules.filter((s) => s.id !== id);
  save();
}

// =========================
// 共通UI
// =========================
const app = document.getElementById("app");

const state = {
  page: "today",
  todayDate: todayStr(),
  weekStart: todayStr(),
  sleepDate: todayStr(),
  reviewDays: 7,
  charts: [],
};

let toastTimer = null;

function toast(message, type = "success") {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.className = "";
  }, 3000);
}

function categoryOptions(selected) {
  return CATEGORIES.map(
    (c) => `<option value="${c}" ${c === selected ? "selected" : ""}>${c}</option>`
  ).join("");
}

function metric(label, value) {
  return `
    <div class="metric">
      <div class="metric-label">${label}</div>
      <div class="metric-value">${value}</div>
    </div>
  `;
}

function destroyCharts() {
  state.charts.forEach((c) => c.destroy());
  state.charts = [];
}

function makeChart(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    return;
  }
  if (typeof Chart === "undefined") {
    const p = document.createElement("p");
    p.className = "note";
    p.textContent = "グラフライブラリを読み込めなかったため、グラフを表示できません。";
    canvas.replaceWith(p);
    return;
  }
  config.options = Object.assign(
    { responsive: true, maintainAspectRatio: false },
    config.options || {}
  );
  state.charts.push(new Chart(canvas, config));
}

function scheduleItemHtml(s) {
  return `
    <li class="schedule-item ${s.done ? "done" : ""}">
      <label class="inline">
        <input type="checkbox" data-schedule="${s.id}" ${s.done ? "checked" : ""}>
        <span>${escapeHtml(s.start)}〜${escapeHtml(s.end)}　${escapeHtml(s.title)}（${escapeHtml(s.category)}）</span>
      </label>
      <button type="button" class="btn-danger btn-small" data-delete-schedule="${s.id}">削除</button>
      ${s.memo ? `<p class="memo">${escapeHtml(s.memo)}</p>` : ""}
    </li>
  `;
}

function bindScheduleActions(root) {
  root.querySelectorAll("[data-schedule]").forEach((el) => {
    el.addEventListener("change", () => {
      setScheduleDone(Number(el.dataset.schedule), el.checked);
      render();
    });
  });
  root.querySelectorAll("[data-delete-schedule]").forEach((el) => {
    el.addEventListener("click", () => {
      if (confirm("この予定を削除しますか？")) {
        deleteSchedule(Number(el.dataset.deleteSchedule));
        render();
      }
    });
  });
}

// =========================
// ページ：今日
// =========================
function renderToday() {
  const d = state.todayDate;
  const habits = sortedHabits(true);
  const schedules = schedulesBetween(d, d);
  const sleep = data.sleepLogs[d];

  let habitHtml;
  if (habits.length === 0) {
    habitHtml = `<p class="info">「習慣設定」から習慣を登録してください。</p>`;
  } else {
    const doneCount = habits.filter((h) => isHabitDone(h.id, d)).length;
    const rate = Math.round((doneCount / habits.length) * 100);
    habitHtml = `
      <ul class="check-list">
        ${habits
          .map(
            (h) => `
          <li>
            <label class="inline">
              <input type="checkbox" data-habit="${h.id}" ${isHabitDone(h.id, d) ? "checked" : ""}>
              <span>${escapeHtml(habitLabel(h))}</span>
            </label>
          </li>
        `
          )
          .join("")}
      </ul>
      <div class="progress"><div class="progress-bar" style="width: ${rate}%"></div></div>
      <p>達成：${doneCount} / ${habits.length}（${rate}%）</p>
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
    const hours = sleepHours(sleep.bedtime, sleep.wakeTime);
    sleepHtml = `
      <p>
        就寝 ${escapeHtml(sleep.bedtime)} → 起床 ${escapeHtml(sleep.wakeTime)}　
        睡眠時間 ${hours.toFixed(1)} 時間　睡眠の質 ${escapeHtml(sleep.quality)} / 5
      </p>
      ${sleep.memo ? `<p class="memo">${escapeHtml(sleep.memo)}</p>` : ""}
    `;
  }

  app.innerHTML = `
    <h2>今日のチェック</h2>
    <div class="toolbar">
      <input type="date" id="today-date" value="${d}" aria-label="日付">
      <button type="button" id="btn-prev">前日</button>
      <button type="button" id="btn-today">今日</button>
      <button type="button" id="btn-next">翌日</button>
    </div>
    <p class="caption">${formatDate(d)}</p>

    <div class="grid-2">
      <section class="card">
        <h3>習慣</h3>
        ${habitHtml}
      </section>
      <section class="card">
        <h3>予定</h3>
        ${scheduleHtml}
      </section>
    </div>

    <section class="card">
      <h3>睡眠（この日の起床分）</h3>
      ${sleepHtml}
    </section>
  `;

  document.getElementById("today-date").addEventListener("change", (e) => {
    if (e.target.value) {
      state.todayDate = e.target.value;
      render();
    }
  });
  document.getElementById("btn-prev").addEventListener("click", () => {
    state.todayDate = addDays(state.todayDate, -1);
    render();
  });
  document.getElementById("btn-today").addEventListener("click", () => {
    state.todayDate = todayStr();
    render();
  });
  document.getElementById("btn-next").addEventListener("click", () => {
    state.todayDate = addDays(state.todayDate, 1);
    render();
  });

  app.querySelectorAll("[data-habit]").forEach((el) => {
    el.addEventListener("change", () => {
      setHabitDone(Number(el.dataset.habit), d, el.checked);
      render();
    });
  });

  bindScheduleActions(app);
}

// =========================
// ページ：予定管理
// =========================
function renderSchedule() {
  const today = todayStr();
  const weekStart = state.weekStart;
  const weekEnd = addDays(weekStart, 6);
  const schedules = schedulesBetween(weekStart, weekEnd);

  let weekHtml = "";
  if (schedules.length === 0) {
    weekHtml = `<p class="info">この期間の予定はありません。</p>`;
  } else {
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      const daySchedules = schedules.filter((s) => s.date === d);
      weekHtml += `
        <details ${i === 0 ? "open" : ""}>
          <summary>${formatShort(d)}　${daySchedules.length} 件</summary>
          ${
            daySchedules.length === 0
              ? `<p>予定なし</p>`
              : `<ul class="schedule-list">${daySchedules.map(scheduleItemHtml).join("")}</ul>`
          }
        </details>
      `;
    }
  }

  app.innerHTML = `
    <h2>予定管理</h2>

    <form id="schedule-form" class="card" novalidate>
      <h3>予定を追加</h3>
      <div class="form-row">
        <label>予定名
          <input type="text" name="title" maxlength="100">
        </label>
        <label>カテゴリ
          <select name="category">${categoryOptions(CATEGORIES[0])}</select>
        </label>
      </div>
      <div class="form-row">
        <label>日付（繰り返しの場合は開始日）
          <input type="date" name="date" value="${today}">
        </label>
        <label>開始時刻
          <input type="time" name="start" value="09:00" step="300">
        </label>
        <label>終了時刻
          <input type="time" name="end" value="10:00" step="300">
        </label>
      </div>
      <label>メモ（任意）
        <input type="text" name="memo" maxlength="200">
      </label>
      <label class="inline">
        <input type="checkbox" name="repeat" id="repeat-toggle">
        繰り返し登録する
      </label>
      <fieldset id="repeat-options" disabled>
        <legend>繰り返し設定</legend>
        <label>繰り返し終了日
          <input type="date" name="until" value="${addDays(today, 27)}">
        </label>
        <div class="weekday-select">
          ${WEEKDAYS.map(
            (w, i) => `
            <label class="inline">
              <input type="checkbox" name="weekday" value="${i}" ${i < 5 ? "checked" : ""}>
              ${w}
            </label>
          `
          ).join("")}
        </div>
      </fieldset>
      <button type="submit" class="btn-primary">追加</button>
    </form>

    <section class="card">
      <h3>1週間の予定</h3>
      <div class="toolbar">
        <label class="inline">表示開始日
          <input type="date" id="week-start" value="${weekStart}">
        </label>
        <button type="button" id="week-prev">前の週</button>
        <button type="button" id="week-today">今日から</button>
        <button type="button" id="week-next">次の週</button>
      </div>
      ${weekHtml}
    </section>
  `;

  const form = document.getElementById("schedule-form");
  const repeatToggle = document.getElementById("repeat-toggle");
  const repeatOptions = document.getElementById("repeat-options");

  repeatToggle.addEventListener("change", () => {
    repeatOptions.disabled = !repeatToggle.checked;
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const title = String(fd.get("title") || "").trim();
    const category = String(fd.get("category") || CATEGORIES[0]);
    const startDate = String(fd.get("date") || "");
    const start = String(fd.get("start") || "");
    const end = String(fd.get("end") || "");
    const memo = String(fd.get("memo") || "").trim();
    const repeat = repeatToggle.checked;

    if (!title) {
      toast("予定名を入力してください。", "error");
      return;
    }
    if (!startDate) {
      toast("日付を入力してください。", "error");
      return;
    }
    if (!start || !end) {
      toast("開始時刻と終了時刻を入力してください。", "error");
      return;
    }
    if (end <= start) {
      toast("終了時刻は開始時刻より後にしてください。", "error");
      return;
    }

    let dates = [];
    if (repeat) {
      const until = String(fd.get("until") || "");
      const weekdays = fd.getAll("weekday").map(Number);
      if (!until) {
        toast("繰り返し終了日を入力してください。", "error");
        return;
      }
      if (until < startDate) {
        toast("繰り返し終了日は開始日以降にしてください。", "error");
        return;
      }
      if (weekdays.length === 0) {
        toast("繰り返す曜日を選択してください。", "error");
        return;
      }
      if (diffDays(startDate, until) > 366) {
        toast("繰り返し期間は1年以内にしてください。", "error");
        return;
      }
      let d = startDate;
      while (d <= until) {
        if (weekdays.includes(weekdayIndex(d))) {
          dates.push(d);
        }
        d = addDays(d, 1);
      }
    } else {
      dates = [startDate];
    }

    if (dates.length === 0) {
      toast("指定の条件に該当する日がありません。", "error");
      return;
    }

    for (const d of dates) {
      data.schedules.push({
        id: newId(),
        date: d,
        start,
        end,
        title,
        category,
        memo,
        done: false,
      });
    }
    save();
    render();
    toast(`${dates.length} 件の予定を登録しました。`);
  });

  document.getElementById("week-start").addEventListener("change", (e) => {
    if (e.target.value) {
      state.weekStart = e.target.value;
      render();
    }
  });
  document.getElementById("week-prev").addEventListener("click", () => {
    state.weekStart = addDays(state.weekStart, -7);
    render();
  });
  document.getElementById("week-today").addEventListener("click", () => {
    state.weekStart = todayStr();
    render();
  });
  document.getElementById("week-next").addEventListener("click", () => {
    state.weekStart = addDays(state.weekStart, 7);
    render();
  });

  bindScheduleActions(app);
}

// =========================
// ページ：習慣設定
// =========================
function renderHabits() {
  const habits = sortedHabits(false);

  const listHtml =
    habits.length === 0
      ? `<p class="info">まだ習慣が登録されていません。</p>`
      : `
        <ul class="habit-list">
          ${habits
            .map(
              (h) => `
            <li class="habit-row">
              <span class="habit-name ${h.active ? "" : "inactive"}">${escapeHtml(habitLabel(h))}</span>
              <label class="inline">
                <input type="checkbox" data-active="${h.id}" ${h.active ? "checked" : ""}>
                有効
              </label>
              <button type="button" class="btn-danger btn-small" data-delete-habit="${h.id}">削除</button>
            </li>
          `
            )
            .join("")}
        </ul>
        <p class="note">無効にした習慣は「今日」の画面と振り返りの集計に表示されません（記録は残ります）。</p>
      `;

  app.innerHTML = `
    <h2>習慣設定</h2>

    <form id="habit-form" class="card" novalidate>
      <h3>習慣を追加</h3>
      <div class="form-row">
        <label>習慣名（例：7時に起きる、水を2L飲む、ストレッチ）
          <input type="text" name="name" maxlength="100">
        </label>
        <label>カテゴリ
          <select name="category">${categoryOptions(CATEGORIES[0])}</select>
        </label>
      </div>
      <div class="form-row">
        <label class="inline">
          <input type="checkbox" id="use-time">
          目標時刻を設定する
        </label>
        <label>目標時刻
          <input type="time" name="targetTime" id="target-time" value="07:00" step="300" disabled>
        </label>
      </div>
      <button type="submit" class="btn-primary">追加</button>
    </form>

    <section class="card">
      <h3>登録済みの習慣</h3>
      ${listHtml}
    </section>
  `;

  const useTime = document.getElementById("use-time");
  const targetTime = document.getElementById("target-time");
  useTime.addEventListener("change", () => {
    targetTime.disabled = !useTime.checked;
  });

  const form = document.getElementById("habit-form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const name = String(fd.get("name") || "").trim();
    const category = String(fd.get("category") || CATEGORIES[0]);
    const time = useTime.checked ? String(targetTime.value || "") : "";

    if (!name) {
      toast("習慣名を入力してください。", "error");
      return;
    }
    if (useTime.checked && !time) {
      toast("目標時刻を入力してください。", "error");
      return;
    }

    data.habits.push({
      id: newId(),
      name,
      category,
      targetTime: time,
      active: true,
      createdAt: todayStr(),
    });
    save();
    render();
    toast(`「${name}」を追加しました。`);
  });

  app.querySelectorAll("[data-active]").forEach((el) => {
    el.addEventListener("change", () => {
      const h = data.habits.find((x) => x.id === Number(el.dataset.active));
      if (h) {
        h.active = el.checked;
        save();
        render();
      }
    });
  });

  app.querySelectorAll("[data-delete-habit]").forEach((el) => {
    el.addEventListener("click", () => {
      if (confirm("この習慣と、これまでの記録をすべて削除しますか？")) {
        deleteHabit(Number(el.dataset.deleteHabit));
        render();
      }
    });
  });
}

// =========================
// ページ：睡眠記録
// =========================
function renderSleep() {
  const d = state.sleepDate;
  const rec = data.sleepLogs[d];
  const bedtime = rec ? rec.bedtime : "23:00";
  const wakeTime = rec ? rec.wakeTime : "07:00";
  const quality = rec ? Number(rec.quality) : 3;
  const memo = rec ? rec.memo : "";

  const today = todayStr();
  const start = addDays(today, -13);
  const dates = Object.keys(data.sleepLogs)
    .filter((k) => k >= start && k <= today)
    .sort()
    .reverse();

  const tableHtml =
    dates.length === 0
      ? `<p class="info">記録がありません。</p>`
      : `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>日付</th>
                <th>就寝</th>
                <th>起床</th>
                <th>睡眠時間(h)</th>
                <th>質</th>
                <th>メモ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${dates
                .map((k) => {
                  const r = data.sleepLogs[k];
                  return `
                  <tr>
                    <td>${formatShort(k)}</td>
                    <td>${escapeHtml(r.bedtime)}</td>
                    <td>${escapeHtml(r.wakeTime)}</td>
                    <td>${sleepHours(r.bedtime, r.wakeTime).toFixed(1)}</td>
                    <td>${escapeHtml(r.quality)}</td>
                    <td>${escapeHtml(r.memo)}</td>
                    <td><button type="button" class="btn-danger btn-small" data-delete-sleep="${k}">削除</button></td>
                  </tr>
                `;
                })
                .join("")}
            </tbody>
          </table>
        </div>
      `;

  app.innerHTML = `
    <h2>睡眠記録</h2>

    <form id="sleep-form" class="card" novalidate>
      <h3>記録する</h3>
      <div class="form-row">
        <label>起床した日
          <input type="date" id="sleep-date" value="${d}">
        </label>
        <label>就寝時刻
          <input type="time" name="bedtime" value="${escapeHtml(bedtime)}" step="300">
        </label>
        <label>起床時刻
          <input type="time" name="wakeTime" value="${escapeHtml(wakeTime)}" step="300">
        </label>
      </div>
      <label>睡眠の質（1：悪い 〜 5：良い）：<span id="quality-value">${quality}</span>
        <input type="range" name="quality" id="quality" min="1" max="5" step="1" value="${quality}">
      </label>
      <label>メモ（任意）
        <input type="text" name="memo" maxlength="200" value="${escapeHtml(memo)}">
      </label>
      <p class="note">${rec ? "この日の記録があります。保存すると上書きされます。" : "同じ日付の記録は上書きされます。"}</p>
      <button type="submit" class="btn-primary">保存</button>
    </form>

    <section class="card">
      <h3>直近14日間の記録</h3>
      ${tableHtml}
    </section>
  `;

  document.getElementById("sleep-date").addEventListener("change", (e) => {
    if (e.target.value) {
      state.sleepDate = e.target.value;
      render();
    }
  });

  const qualityInput = document.getElementById("quality");
  qualityInput.addEventListener("input", () => {
    document.getElementById("quality-value").textContent = qualityInput.value;
  });

  const form = document.getElementById("sleep-form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const bed = String(fd.get("bedtime") || "");
    const wake = String(fd.get("wakeTime") || "");
    const q = Number(fd.get("quality"));
    const m = String(fd.get("memo") || "").trim();

    if (!bed || !wake) {
      toast("就寝時刻と起床時刻を入力してください。", "error");
      return;
    }
    if (bed === wake) {
      toast("就寝時刻と起床時刻が同じです。", "error");
      return;
    }

    data.sleepLogs[state.sleepDate] = {
      bedtime: bed,
      wakeTime: wake,
      quality: q,
      memo: m,
    };
    save();
    render();
    toast(`保存しました（睡眠時間 ${sleepHours(bed, wake).toFixed(1)} 時間）。`);
  });

  app.querySelectorAll("[data-delete-sleep]").forEach((el) => {
    el.addEventListener("click", () => {
      const key = el.dataset.deleteSleep;
      if (confirm(`${formatShort(key)} の記録を削除しますか？`)) {
        delete data.sleepLogs[key];
        save();
        render();
      }
    });
  });
}

// =========================
// ページ：振り返り
// =========================
function renderReview() {
  const n = state.reviewDays;
  const today = todayStr();
  const start = addDays(today, -(n - 1));
  const days = Array.from({ length: n }, (_, i) => addDays(start, i));
  const labels = days.map(formatShort);

  // ---------- 習慣 ----------
  const habits = sortedHabits(true);
  let habitHtml;
  let habitRates = [];

  if (habits.length === 0) {
    habitHtml = `<p class="info">有効な習慣がありません。</p>`;
  } else {
    habitRates = days.map((d) => {
      const cnt = habits.filter((h) => isHabitDone(h.id, d)).length;
      return Math.round((cnt / habits.length) * 1000) / 10;
    });
    const avg = habitRates.reduce((a, b) => a + b, 0) / habitRates.length;

    const rows = habits.map((h) => {
      const created = h.createdAt || start;
      const targetDays = days.filter((d) => d >= created || isHabitDone(h.id, d));
      const doneDays = targetDays.filter((d) => isHabitDone(h.id, d)).length;
      const rate = targetDays.length > 0 ? (doneDays / targetDays.length) * 100 : 0;
      return `
        <tr>
          <td>${escapeHtml(h.name)}</td>
          <td>${escapeHtml(h.category)}</td>
          <td>${doneDays}</td>
          <td>${targetDays.length}</td>
          <td>${rate.toFixed(1)}</td>
          <td>${calcStreak(h.id, today)}</td>
        </tr>
      `;
    });

    habitHtml = `
      <div class="chart-box"><canvas id="chart-habit"></canvas></div>
      <div class="metrics">${metric("期間平均の達成率", `${avg.toFixed(1)}%`)}</div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>習慣</th>
              <th>カテゴリ</th>
              <th>達成日数</th>
              <th>対象日数</th>
              <th>達成率(%)</th>
              <th>連続達成日数</th>
            </tr>
          </thead>
          <tbody>${rows.join("")}</tbody>
        </table>
      </div>
    `;
  }

  // ---------- 予定 ----------
  const schedules = schedulesBetween(start, today);
  let scheduleHtml;
  const catLabels = [];
  const catRates = [];

  if (schedules.length === 0) {
    scheduleHtml = `<p class="info">この期間の予定はありません。</p>`;
  } else {
    const done = schedules.filter((s) => s.done).length;
    const byCat = {};
    for (const s of schedules) {
      if (!byCat[s.category]) {
        byCat[s.category] = { done: 0, total: 0 };
      }
      byCat[s.category].total += 1;
      if (s.done) {
        byCat[s.category].done += 1;
      }
    }
    for (const [cat, v] of Object.entries(byCat)) {
      catLabels.push(cat);
      catRates.push(Math.round((v.done / v.total) * 1000) / 10);
    }
    scheduleHtml = `
      <div class="metrics">
        ${metric("完了した予定", `${done} / ${schedules.length}`)}
        ${metric("完了率", `${((done / schedules.length) * 100).toFixed(1)}%`)}
      </div>
      <div class="chart-box"><canvas id="chart-schedule"></canvas></div>
    `;
  }

  // ---------- 睡眠 ----------
  const target = Number(data.settings.targetSleep) || 7;
  const sleepDays = days.filter((d) => data.sleepLogs[d]);
  let sleepHtml;
  let sleepValues = [];

  if (sleepDays.length === 0) {
    sleepHtml = `<p class="info">この期間の睡眠記録はありません。</p>`;
  } else {
    sleepValues = days.map((d) => {
      const r = data.sleepLogs[d];
      return r ? sleepHours(r.bedtime, r.wakeTime) : null;
    });
    const recorded = sleepDays.map((d) => {
      const r = data.sleepLogs[d];
      return { hours: sleepHours(r.bedtime, r.wakeTime), quality: Number(r.quality) };
    });
    const avgHours = recorded.reduce((a, b) => a + b.hours, 0) / recorded.length;
    const avgQuality = recorded.reduce((a, b) => a + b.quality, 0) / recorded.length;
    const achieved = recorded.filter((r) => r.hours >= target).length;

    sleepHtml = `
      <div class="toolbar">
        <label class="inline">目標睡眠時間（時間）
          <input type="number" id="target-sleep" min="3" max="12" step="0.5" value="${target}">
        </label>
      </div>
      <div class="chart-box"><canvas id="chart-sleep"></canvas></div>
      <div class="metrics">
        ${metric("平均睡眠時間", `${avgHours.toFixed(1)} 時間`)}
        ${metric("平均の睡眠の質", `${avgQuality.toFixed(1)} / 5`)}
        ${metric("目標達成日数", `${achieved} / ${recorded.length} 日`)}
      </div>
    `;
  }

  app.innerHTML = `
    <h2>振り返り</h2>
    <div class="radio-group">
      <label class="inline">
        <input type="radio" name="period" value="7" ${n === 7 ? "checked" : ""}>
        7日間
      </label>
      <label class="inline">
        <input type="radio" name="period" value="30" ${n === 30 ? "checked" : ""}>
        30日間
      </label>
    </div>

    <section class="card">
      <h3>習慣の達成状況</h3>
      ${habitHtml}
    </section>

    <section class="card">
      <h3>予定の完了状況</h3>
      ${scheduleHtml}
    </section>

    <section class="card">
      <h3>睡眠</h3>
      ${sleepHtml}
    </section>
  `;

  app.querySelectorAll('input[name="period"]').forEach((el) => {
    el.addEventListener("change", () => {
      state.reviewDays = Number(el.value);
      render();
    });
  });

  const targetInput = document.getElementById("target-sleep");
  if (targetInput) {
    targetInput.addEventListener("change", () => {
      const v = Number(targetInput.value);
      if (Number.isFinite(v) && v >= 3 && v <= 12) {
        data.settings.targetSleep = v;
        save();
        render();
      } else {
        toast("目標睡眠時間は3〜12時間の範囲で入力してください。", "error");
      }
    });
  }

  if (habits.length > 0) {
    makeChart("chart-habit", {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "達成率(%)",
            data: habitRates,
            borderColor: "#4f7cff",
            backgroundColor: "rgba(79, 124, 255, 0.15)",
            fill: true,
            tension: 0.2,
          },
        ],
      },
      options: {
        scales: { y: { min: 0, max: 100 } },
      },
    });
  }

  if (schedules.length > 0) {
    makeChart("chart-schedule", {
      type: "bar",
      data: {
        labels: catLabels,
        datasets: [
          {
            label: "カテゴリ別完了率(%)",
            data: catRates,
            backgroundColor: "rgba(47, 158, 68, 0.7)",
          },
        ],
      },
      options: {
        scales: { y: { min: 0, max: 100 } },
      },
    });
  }

  if (sleepDays.length > 0) {
    makeChart("chart-sleep", {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "睡眠時間(h)",
            data: sleepValues,
            borderColor: "#7c3aed",
            backgroundColor: "rgba(124, 58, 237, 0.15)",
            spanGaps: true,
            tension: 0.2,
          },
          {
            label: "目標(h)",
            data: days.map(() => target),
            borderColor: "#e5484d",
            borderDash: [6, 4],
            pointRadius: 0,
          },
        ],
      },
      options: {
        scales: { y: { suggestedMin: 0, suggestedMax: 12 } },
      },
    });
  }
}

// =========================
// ページ：データ
// =========================
function renderData() {
  const stats = {
    habits: data.habits.length,
    habitLogs: Object.keys(data.habitLogs).length,
    schedules: data.schedules.length,
    sleepLogs: Object.keys(data.sleepLogs).length,
  };

  app.innerHTML = `
    <h2>データ管理</h2>

    <section class="card">
      <h3>保存状況</h3>
      <div class="metrics">
        ${metric("習慣", `${stats.habits} 件`)}
        ${metric("習慣の記録", `${stats.habitLogs} 件`)}
        ${metric("予定", `${stats.schedules} 件`)}
        ${metric("睡眠記録", `${stats.sleepLogs} 件`)}
      </div>
      <p class="note">
        データはこのブラウザ内（localStorage）にのみ保存されます。
        別の端末やブラウザでは共有されず、ブラウザのデータを消去すると失われます。
        定期的にエクスポートしてバックアップしてください。
      </p>
    </section>

    <section class="card">
      <h3>エクスポート</h3>
      <button type="button" class="btn-primary" id="btn-export">JSONファイルをダウンロード</button>
    </section>

    <section class="card">
      <h3>インポート</h3>
      <p class="note">エクスポートしたJSONファイルを読み込みます。現在のデータは上書きされます。</p>
      <input type="file" id="import-file" accept="application/json,.json">
    </section>

    <section class="card">
      <h3>全データの削除</h3>
      <button type="button" class="btn-danger" id="btn-reset">すべてのデータを削除</button>
    </section>
  `;

  document.getElementById("btn-export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `habit-planner-backup-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("エクスポートしました。");
  });

  document.getElementById("import-file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.habits)) {
          throw new Error("invalid format");
        }
        if (!confirm("現在のデータを上書きしてインポートしますか？")) {
          e.target.value = "";
          return;
        }
        data = normalizeData(parsed);
        save();
        render();
        toast("インポートしました。");
      } catch (err) {
        console.error(err);
        e.target.value = "";
        toast("ファイルの形式が正しくありません。", "error");
      }
    };
    reader.onerror = () => {
      toast("ファイルを読み込めませんでした。", "error");
    };
    reader.readAsText(file);
  });

  document.getElementById("btn-reset").addEventListener("click", () => {
    if (confirm("すべてのデータを削除します。この操作は元に戻せません。よろしいですか？")) {
      data = defaultData();
      save();
      render();
      toast("すべてのデータを削除しました。");
    }
  });
}

// =========================
// ルーティング
// =========================
const renderers = {
  today: renderToday,
  schedule: renderSchedule,
  habits: renderHabits,
  sleep: renderSleep,
  review: renderReview,
  data: renderData,
};

function render() {
  destroyCharts();
  document.querySelectorAll("#nav a").forEach((a) => {
    a.classList.toggle("active", a.dataset.page === state.page);
  });
  renderers[state.page]();
}

function navigate(page) {
  state.page = PAGES.includes(page) ? page : "today";
  render();
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", () => {
  navigate(location.hash.slice(1));
});

// 別タブでデータが変更されたときに反映する
window.addEventListener("storage", (e) => {
  if (e.key === STORAGE_KEY) {
    data = loadData();
    render();
  }
});

navigate(location.hash.slice(1) || "today");
