// File: app.js
"use strict";

const STORAGE_KEY = "liferhythm-data-v1";

const DEFAULT_SETTINGS = {
  sleep_goal: 7.5,
  target_bedtime: "23:00",
  target_wake: "06:30",
  water_goal: 2000,
  steps_goal: 8000,
  exercise_goal: 30,
  screen_goal: 120,
};

const SETTING_LIMITS = {
  sleep_goal: [4, 12],
  water_goal: [500, 5000],
  steps_goal: [1000, 30000],
  exercise_goal: [5, 300],
  screen_goal: [10, 720],
};

const DEFAULT_HABITS = [
  "起床後に朝日を浴びる",
  "朝食をとる",
  "ストレッチ5分",
  "読書10分",
  "就寝1時間前にスマホを置く",
];

const SCORE_WEIGHTS = {
  "睡眠時間": 20,
  "就寝リズム": 10,
  "水分": 10,
  "歩数": 15,
  "運動": 15,
  "スクリーン": 10,
  "気分": 5,
  "習慣": 15,
};

const PAGES = {
  dashboard: "🌿 ダッシュボード",
  log: "📝 今日の記録",
  habits: "✅ 習慣トラッカー",
  analysis: "🔍 分析",
  settings: "⚙️ 設定",
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const app = document.getElementById("app");
let state = loadState();
let charts = [];
let logDate = todayStr();
let analysisPeriod = 30;
let lastPage = null;
let flash = null;

// ---------------------------------------------------------------------------
// 日付・時刻ユーティリティ
// ---------------------------------------------------------------------------
function pad(n) {
  return String(n).padStart(2, "0");
}

function fmtDate(dt) {
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function todayStr() {
  return fmtDate(new Date());
}

function parseDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(s, n) {
  const dt = parseDate(s);
  dt.setDate(dt.getDate() + n);
  return fmtDate(dt);
}

function daysBetween(a, b) {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

function dateRange(start, end) {
  const out = [];
  let d = start;
  while (d <= end) {
    out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

function shortDate(s) {
  return s.slice(5).replace("-", "/");
}

function formatJpDate(s) {
  const [y, m, d] = s.split("-");
  return `${y}年${m}月${d}日`;
}

function mod(a, n) {
  return ((a % n) + n) % n;
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function sleepHours(bedtime, wake) {
  return mod(toMinutes(wake) - toMinutes(bedtime), 1440) / 60;
}

function circularDiff(a, b) {
  const d = mod(Math.abs(toMinutes(a) - toMinutes(b)), 1440);
  return Math.min(d, 1440 - d);
}

function bedClock(bedtime) {
  return mod(toMinutes(bedtime) - 720, 1440) / 60 + 12;
}

function clockLabel(v) {
  const total = Math.round(v * 60);
  return `${pad(Math.floor(total / 60) % 24)}:${pad(mod(total, 60))}`;
}

// ---------------------------------------------------------------------------
// 統計ユーティリティ
// ---------------------------------------------------------------------------
function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

function std(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1));
}

function corr(xs, ys) {
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}

function clampNum(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// データ保存（localStorage）
// ---------------------------------------------------------------------------
function sanitizeSettings(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const s = { ...DEFAULT_SETTINGS };
  for (const [key, [min, max]] of Object.entries(SETTING_LIMITS)) {
    const v = clampNum(r[key], DEFAULT_SETTINGS[key], min, max);
    s[key] = key === "sleep_goal" ? v : Math.round(v);
  }
  for (const key of ["target_bedtime", "target_wake"]) {
    if (typeof r[key] === "string" && TIME_RE.test(r[key])) s[key] = r[key];
  }
  return s;
}

function defaultLog(date, settings) {
  return {
    date,
    bedtime: settings.target_bedtime,
    wake_time: settings.target_wake,
    sleep_quality: 3,
    water_ml: 0,
    steps: 0,
    exercise_min: 0,
    screen_min: 0,
    mood: 3,
    energy: 3,
    meals: 3,
    vegetables: false,
    alcohol: false,
    late_caffeine: false,
    note: "",
  };
}

function sanitizeLog(date, raw, settings) {
  const d = defaultLog(date, settings);
  const r = raw && typeof raw === "object" ? raw : {};
  const time = (v, def) => (typeof v === "string" && TIME_RE.test(v) ? v : def);
  const int = (v, def, min, max) => Math.round(clampNum(v, def, min, max));
  return {
    date,
    bedtime: time(r.bedtime, d.bedtime),
    wake_time: time(r.wake_time, d.wake_time),
    sleep_quality: int(r.sleep_quality, 3, 1, 5),
    water_ml: int(r.water_ml, 0, 0, 10000),
    steps: int(r.steps, 0, 0, 100000),
    exercise_min: int(r.exercise_min, 0, 0, 600),
    screen_min: int(r.screen_min, 0, 0, 1440),
    mood: int(r.mood, 3, 1, 5),
    energy: int(r.energy, 3, 1, 5),
    meals: int(r.meals, 3, 0, 6),
    vegetables: Boolean(r.vegetables),
    alcohol: Boolean(r.alcohol),
    late_caffeine: Boolean(r.late_caffeine),
    note: typeof r.note === "string" ? r.note : "",
  };
}

function normalizeState(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const today = todayStr();
  const settings = sanitizeSettings(r.settings);

  const logs = {};
  if (r.logs && typeof r.logs === "object") {
    for (const [d, log] of Object.entries(r.logs)) {
      if (DATE_RE.test(d)) logs[d] = sanitizeLog(d, log, settings);
    }
  }

  let habits = [];
  if (Array.isArray(r.habits)) {
    const seenNames = new Set();
    const seenIds = new Set();
    for (const h of r.habits) {
      if (!h || !Number.isInteger(h.id) || typeof h.name !== "string") continue;
      const name = h.name.trim();
      if (!name || seenNames.has(name) || seenIds.has(h.id)) continue;
      seenNames.add(name);
      seenIds.add(h.id);
      habits.push({
        id: h.id,
        name,
        active: h.active !== false,
        createdAt: typeof h.createdAt === "string" && DATE_RE.test(h.createdAt) ? h.createdAt : today,
      });
    }
  } else {
    habits = DEFAULT_HABITS.map((name, i) => ({ id: i + 1, name, active: true, createdAt: today }));
  }

  const ids = new Set(habits.map((h) => String(h.id)));
  const habitLogs = {};
  if (r.habitLogs && typeof r.habitLogs === "object") {
    for (const [d, entry] of Object.entries(r.habitLogs)) {
      if (!DATE_RE.test(d) || !entry || typeof entry !== "object") continue;
      const e = {};
      for (const [id, v] of Object.entries(entry)) {
        if (v && ids.has(id)) e[id] = 1;
      }
      if (Object.keys(e).length) habitLogs[d] = e;
    }
  }

  const maxId = habits.reduce((m, h) => Math.max(m, h.id), 0);
  const nextHabitId = Math.max(Number.isInteger(r.nextHabitId) ? r.nextHabitId : 0, maxId + 1);
  return { settings, logs, habits, habitLogs, nextHabitId };
}

function loadState() {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch (e) {
    raw = null;
  }
  const s = normalizeState(raw || {});
  persist(s);
  return s;
}

function persist(s) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch (e) {
    console.error("保存に失敗しました", e);
  }
}

function save() {
  persist(state);
}

// ---------------------------------------------------------------------------
// 記録・習慣の操作
// ---------------------------------------------------------------------------
function getLog(date) {
  return state.logs[date] || null;
}

function saveLog(log) {
  state.logs[log.date] = sanitizeLog(log.date, log, state.settings);
  save();
}

function addWater(date, ml) {
  const log = getLog(date) || defaultLog(date, state.settings);
  saveLog({ ...log, water_ml: Math.max(0, log.water_ml + ml) });
}

function activeHabits() {
  return state.habits.filter((h) => h.active);
}

function isDone(id, date) {
  return Boolean(state.habitLogs[date] && state.habitLogs[date][id]);
}

function setDone(id, date, done) {
  if (!state.habitLogs[date]) state.habitLogs[date] = {};
  if (done) {
    state.habitLogs[date][id] = 1;
  } else {
    delete state.habitLogs[date][id];
  }
  if (Object.keys(state.habitLogs[date]).length === 0) delete state.habitLogs[date];
  save();
}

function habitRate(date) {
  const hs = activeHabits();
  if (!hs.length) return null;
  return hs.filter((h) => isDone(h.id, date)).length / hs.length;
}

function doneDates(id) {
  return Object.keys(state.habitLogs)
    .filter((d) => state.habitLogs[d][id])
    .sort();
}

function currentStreak(id) {
  let d = todayStr();
  if (!isDone(id, d)) d = addDays(d, -1);
  let n = 0;
  while (isDone(id, d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

function bestStreak(id) {
  let best = 0;
  let cur = 0;
  let prev = null;
  for (const d of doneDates(id)) {
    cur = prev && daysBetween(prev, d) === 1 ? cur + 1 : 1;
    best = Math.max(best, cur);
    prev = d;
  }
  return best;
}

function addHabit(name) {
  if (state.habits.some((h) => h.name === name)) return false;
  state.habits.push({ id: state.nextHabitId, name, active: true, createdAt: todayStr() });
  state.nextHabitId++;
  save();
  return true;
}

function deleteHabit(id) {
  state.habits = state.habits.filter((h) => h.id !== id);
  for (const d of Object.keys(state.habitLogs)) {
    delete state.habitLogs[d][id];
    if (Object.keys(state.habitLogs[d]).length === 0) delete state.habitLogs[d];
  }
  save();
}

// ---------------------------------------------------------------------------
// スコア・分析
// ---------------------------------------------------------------------------
function computeScore(log, settings, rate) {
  const parts = {};

  const hours = sleepHours(log.bedtime, log.wake_time);
  const goal = settings.sleep_goal;
  let s;
  if (hours < goal) {
    s = hours / goal;
  } else if (hours <= goal + 1.5) {
    s = 1;
  } else {
    s = Math.max(0, 1 - (hours - goal - 1.5) / 3);
  }
  parts["睡眠時間"] = s;
  parts["就寝リズム"] = Math.max(0, 1 - circularDiff(log.bedtime, settings.target_bedtime) / 120);
  parts["水分"] = Math.min(log.water_ml / settings.water_goal, 1);
  parts["歩数"] = Math.min(log.steps / settings.steps_goal, 1);
  parts["運動"] = Math.min(log.exercise_min / settings.exercise_goal, 1);

  const sg = settings.screen_goal;
  parts["スクリーン"] = log.screen_min <= sg ? 1 : Math.max(0, 1 - (log.screen_min - sg) / Math.max(sg, 1));
  parts["気分"] = (log.mood - 1) / 4;
  if (rate !== null) parts["習慣"] = rate;

  let totalWeight = 0;
  let total = 0;
  const breakdown = {};
  for (const [k, v] of Object.entries(parts)) {
    totalWeight += SCORE_WEIGHTS[k];
    total += SCORE_WEIGHTS[k] * v;
    breakdown[k] = Math.round(v * 100);
  }
  return { score: Math.round((total / totalWeight) * 100), breakdown };
}

function buildDaily(start, end) {
  return Object.keys(state.logs)
    .filter((d) => d >= start && d <= end)
    .sort()
    .map((d) => {
      const log = state.logs[d];
      const rate = habitRate(d);
      const { score, breakdown } = computeScore(log, state.settings, rate);
      return {
        ...log,
        sleep_h: sleepHours(log.bedtime, log.wake_time),
        bed_clock: bedClock(log.bedtime),
        wake_clock: toMinutes(log.wake_time) / 60,
        habit_rate: rate,
        score,
        breakdown,
      };
    });
}

function scoreLabel(score) {
  if (score >= 85) return "素晴らしい 🌟";
  if (score >= 70) return "良好 👍";
  if (score >= 50) return "まずまず 🙂";
  return "立て直しどき 💪";
}

function generateAdvice(rows) {
  const s = state.settings;
  if (!rows.length) {
    return ["まずは「今日の記録」から1日分のデータを入力しましょう。記録が増えるほど提案が具体的になります。"];
  }

  const tips = [];
  const avgSleep = mean(rows.map((r) => r.sleep_h));
  if (avgSleep < s.sleep_goal - 0.5) {
    tips.push(`😴 直近の平均睡眠は ${avgSleep.toFixed(1)} 時間で、目標の ${s.sleep_goal} 時間を下回っています。就寝時刻を15分ずつ前倒しすると無理なく調整できます。`);
  }

  if (rows.length >= 3) {
    const bedStd = std(rows.map((r) => r.bed_clock)) * 60;
    if (bedStd > 60) {
      tips.push(`🕒 就寝時刻のばらつきが約 ${bedStd.toFixed(0)} 分あります。毎日同じ時刻に寝起きすることを優先しましょう。`);
    }
  }

  const avgDev = mean(rows.map((r) => circularDiff(r.bedtime, s.target_bedtime)));
  if (avgDev > 60) {
    tips.push(`🌙 目標就寝時刻 ${s.target_bedtime} から平均 ${avgDev.toFixed(0)} 分ずれています。就寝30分前にアラームを設定すると切り替えやすくなります。`);
  }

  const avgWater = mean(rows.map((r) => r.water_ml));
  if (avgWater < s.water_goal * 0.8) {
    tips.push(`💧 水分摂取が平均 ${avgWater.toFixed(0)}ml です。起床直後と食事ごとにコップ1杯を習慣にしましょう。`);
  }

  const avgSteps = mean(rows.map((r) => r.steps));
  if (avgSteps < s.steps_goal * 0.7) {
    tips.push(`🚶 平均歩数は ${Math.round(avgSteps).toLocaleString()} 歩です。昼食後の10分散歩や一駅分歩くことを取り入れてみましょう。`);
  }

  if (mean(rows.map((r) => r.exercise_min)) < s.exercise_goal * 0.5) {
    tips.push("🏃 運動時間が目標の半分未満です。まずは1日10分の軽い運動から始めましょう。");
  }

  const avgScreen = mean(rows.map((r) => r.screen_min));
  if (avgScreen > s.screen_goal) {
    tips.push(`📱 スクリーンタイムが平均 ${avgScreen.toFixed(0)} 分で目標を超えています。通知のオフや寝室にスマホを持ち込まない工夫が有効です。`);
  }

  if (sum(rows.map((r) => (r.late_caffeine ? 1 : 0))) >= 3) {
    tips.push("☕ 15時以降のカフェイン摂取が多めです。午後はノンカフェイン飲料に切り替えてみましょう。");
  }

  if (sum(rows.map((r) => (r.alcohol ? 1 : 0))) >= 3) {
    tips.push("🍺 飲酒日が多めです。休肝日を週に数日設けましょう。");
  }

  if (mean(rows.map((r) => (r.vegetables ? 1 : 0))) < 0.5) {
    tips.push("🥗 野菜を食べた日が半分未満です。1食に1品、野菜のおかずを足してみましょう。");
  }

  if (mean(rows.map((r) => r.mood)) <= 2.5) {
    tips.push("🙂 気分の低い日が続いています。睡眠と日中の活動量を見直し、つらさが続く場合は専門家への相談も検討してください。");
  }

  if (!tips.length) tips.push("🎉 すべての項目が良好です。この調子で継続しましょう。");
  return tips;
}

// ---------------------------------------------------------------------------
// グラフ
// ---------------------------------------------------------------------------
function destroyCharts() {
  charts.forEach((c) => c.destroy());
  charts = [];
}

function makeChart(id, config) {
  const el = document.getElementById(id);
  if (!el) return;
  if (typeof Chart === "undefined") {
    el.parentElement.innerHTML = '<p class="muted">グラフライブラリを読み込めませんでした。ネットワーク接続を確認してください。</p>';
    return;
  }
  config.options = { maintainAspectRatio: false, ...(config.options || {}) };
  charts.push(new Chart(el, config));
}

function scoreColor(v) {
  return `hsl(${Math.round(v * 1.2)}, 65%, 48%)`;
}

function seriesFor(rows, dates, key) {
  const m = new Map(rows.map((r) => [r.date, r[key]]));
  return dates.map((d) => (m.has(d) ? m.get(d) : null));
}

function breakdownConfig(breakdown) {
  const labels = Object.keys(breakdown);
  const values = labels.map((k) => breakdown[k]);
  return {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "達成度", data: values, backgroundColor: values.map(scoreColor), borderRadius: 6 }],
    },
    options: {
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: { x: { min: 0, max: 100 } },
    },
  };
}

// ---------------------------------------------------------------------------
// UI 部品
// ---------------------------------------------------------------------------
function metric(label, value, sub) {
  return `
    <div class="metric">
      <div class="metric-label">${label}</div>
      <div class="metric-value">${value}</div>
      ${sub ? `<div class="metric-sub">${sub}</div>` : ""}
    </div>`;
}

function progressHtml(pct, text) {
  return `
    <div class="progress-wrap">
      <div class="progress-text">${text}</div>
      <div class="progress"><div class="progress-bar" style="width:${Math.max(0, Math.min(100, pct))}%"></div></div>
    </div>`;
}

function checklistHtml(date) {
  const hs = activeHabits();
  if (!hs.length) {
    return '<p class="muted">習慣が登録されていません。「設定」から追加してください。</p>';
  }
  const done = hs.filter((h) => isDone(h.id, date)).length;
  const items = hs
    .map((h) => {
      const streak = currentStreak(h.id);
      return `
        <li>
          <label>
            <input type="checkbox" data-habit-id="${h.id}" data-date="${date}" ${isDone(h.id, date) ? "checked" : ""}>
            <span>${escapeHtml(h.name)}</span>
          </label>
          ${streak > 0 ? `<span class="streak">🔥 ${streak}日連続</span>` : ""}
        </li>`;
    })
    .join("");
  return `${progressHtml((done / hs.length) * 100, `達成 ${done} / ${hs.length}`)}<ul class="checklist">${items}</ul>`;
}

function checklistBlock(date) {
  return `<div data-checklist-date="${date}">${checklistHtml(date)}</div>`;
}

function adviceHtml(rows) {
  return `<ul class="advice">${generateAdvice(rows).map((t) => `<li>${t}</li>`).join("")}</ul>`;
}

function flashHtml() {
  if (!flash) return "";
  const html = `<div class="${flash.type === "warn" ? "alert-warn" : "alert-success"}">${escapeHtml(flash.text)}</div>`;
  flash = null;
  return html;
}

// ---------------------------------------------------------------------------
// CSV / ダウンロード
// ---------------------------------------------------------------------------
const CSV_COLUMNS = [
  "date", "bedtime", "wake_time", "sleep_h", "sleep_quality", "water_ml", "steps",
  "exercise_min", "screen_min", "meals", "vegetables", "alcohol", "late_caffeine",
  "mood", "energy", "habit_rate", "score", "note",
];

function toCsv(rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) => {
    const out = {
      ...r,
      sleep_h: r.sleep_h.toFixed(2),
      vegetables: r.vegetables ? 1 : 0,
      alcohol: r.alcohol ? 1 : 0,
      late_caffeine: r.late_caffeine ? 1 : 0,
      habit_rate: r.habit_rate === null ? "" : r.habit_rate.toFixed(2),
    };
    return CSV_COLUMNS.map((c) => esc(out[c])).join(",");
  });
  return "\uFEFF" + [CSV_COLUMNS.join(","), ...lines].join("\r\n");
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// ページ: ダッシュボード
// ---------------------------------------------------------------------------
function renderDashboard() {
  const t = todayStr();
  const s = state.settings;
  const start = addDays(t, -13);
  const rows = buildDaily(start, t);
  const tr = rows.find((r) => r.date === t);
  const yr = rows.find((r) => r.date === addDays(t, -1));

  let summary;
  if (tr) {
    let delta = "";
    if (yr) {
      const d = tr.score - yr.score;
      const cls = d > 0 ? "up" : d < 0 ? "down" : "";
      delta = `<span class="${cls}">前日比 ${d > 0 ? "+" : ""}${d}</span>`;
    }
    summary = `
      <div class="grid cols-4">
        ${metric("今日のスコア", `${tr.score} 点`, delta)}
        ${metric("睡眠時間", `${tr.sleep_h.toFixed(1)} h`, `目標 ${s.sleep_goal} h`)}
        ${metric("水分", `${tr.water_ml.toLocaleString()} ml`, `目標 ${s.water_goal.toLocaleString()} ml`)}
        ${metric("歩数", `${tr.steps.toLocaleString()} 歩`, `目標 ${s.steps_goal.toLocaleString()} 歩`)}
      </div>
      ${progressHtml(tr.score, `総合評価: ${scoreLabel(tr.score)}`)}`;
  } else {
    summary = '<div class="notice">今日の記録がまだありません。「今日の記録」ページから入力するとスコアが表示されます。</div>';
  }

  const waterButtons = [200, 350, 500, -200]
    .map((v) => `<button class="btn btn-block" data-water="${v}">${v > 0 ? "+" : ""}${v} ml</button>`)
    .join("");

  app.innerHTML = `
    <h1>🌿 ダッシュボード</h1>
    <p class="muted">${formatJpDate(t)}</p>
    <section class="card">${summary}</section>
    <section class="card">
      <h2>💧 水分クイック記録</h2>
      <div class="grid cols-4">${waterButtons}</div>
    </section>
    <div class="grid cols-2">
      <section class="card">
        <h2>✅ 今日の習慣</h2>
        ${checklistBlock(t)}
      </section>
      <section class="card">
        <h2>📊 項目別達成度</h2>
        ${tr ? '<div class="chart-box"><canvas id="chart-breakdown"></canvas></div>' : '<p class="muted">記録すると表示されます。</p>'}
      </section>
    </div>
    <section class="card">
      <h2>📈 直近14日間のスコア</h2>
      ${rows.length ? '<div class="chart-box"><canvas id="chart-score"></canvas></div>' : '<p class="muted">データがありません。</p>'}
    </section>
    <section class="card">
      <h2>💡 改善アドバイス（直近7日間）</h2>
      ${adviceHtml(rows.filter((r) => r.date >= addDays(t, -6)))}
    </section>`;

  app.querySelectorAll("[data-water]").forEach((btn) => {
    btn.addEventListener("click", () => {
      addWater(t, Number(btn.dataset.water));
      renderPage();
    });
  });

  if (tr) makeChart("chart-breakdown", breakdownConfig(tr.breakdown));
  if (rows.length) {
    const dates = dateRange(start, t);
    makeChart("chart-score", {
      type: "line",
      data: {
        labels: dates.map(shortDate),
        datasets: [{
          label: "スコア",
          data: seriesFor(rows, dates, "score"),
          borderColor: "#2f8f5b",
          backgroundColor: "#2f8f5b",
          tension: 0.3,
          spanGaps: true,
        }],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: { y: { min: 0, max: 100 } },
      },
    });
  }
}

// ---------------------------------------------------------------------------
// ページ: 今日の記録
// ---------------------------------------------------------------------------
function numberField(name, label, value, min, max, step) {
  return `<label>${label}<input type="number" name="${name}" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
}

function rangeField(name, label, value) {
  return `
    <label>
      <span class="label-row">${label}<span class="range-value" data-range-out="${name}">${value}</span></span>
      <input type="range" name="${name}" min="1" max="5" step="1" value="${value}">
    </label>`;
}

function checkField(name, label, checked) {
  return `<label class="check-label"><input type="checkbox" name="${name}" ${checked ? "checked" : ""}>${label}</label>`;
}

function renderLog() {
  const t = todayStr();
  if (!DATE_RE.test(logDate) || logDate > t) logDate = t;
  const d = logDate;
  const log = getLog(d) || defaultLog(d, state.settings);

  app.innerHTML = `
    <h1>📝 今日の記録</h1>
    <div class="toolbar">
      <label for="log-date">記録する日付</label>
      <input type="date" id="log-date" value="${d}" max="${t}">
      ${getLog(d) ? '<span class="muted small">保存済みの記録を編集中</span>' : '<span class="muted small">未記録</span>'}
    </div>
    <form id="log-form" class="card">
      <h2>😴 睡眠</h2>
      <div class="form-grid cols-3">
        <label>就寝時刻（前夜）<input type="time" name="bedtime" step="300" value="${log.bedtime}"></label>
        <label>起床時刻<input type="time" name="wake_time" step="300" value="${log.wake_time}"></label>
        ${rangeField("sleep_quality", "睡眠の質", log.sleep_quality)}
      </div>

      <h2>🏃 活動</h2>
      <div class="form-grid cols-4">
        ${numberField("water_ml", "水分 (ml)", log.water_ml, 0, 10000, 100)}
        ${numberField("steps", "歩数", log.steps, 0, 100000, 500)}
        ${numberField("exercise_min", "運動 (分)", log.exercise_min, 0, 600, 5)}
        ${numberField("screen_min", "娯楽スクリーン (分)", log.screen_min, 0, 1440, 10)}
      </div>

      <h2>🍽️ 食事・嗜好品</h2>
      <div class="form-grid cols-4">
        ${numberField("meals", "食事回数", log.meals, 0, 6, 1)}
        ${checkField("vegetables", "野菜を食べた", log.vegetables)}
        ${checkField("alcohol", "飲酒した", log.alcohol)}
        ${checkField("late_caffeine", "15時以降にカフェイン", log.late_caffeine)}
      </div>

      <h2>🧠 コンディション</h2>
      <div class="form-grid cols-2">
        ${rangeField("mood", "気分 (1=悪い / 5=良い)", log.mood)}
        ${rangeField("energy", "エネルギー (1=低い / 5=高い)", log.energy)}
      </div>
      <div class="form-grid">
        <label>メモ・振り返り<textarea name="note" placeholder="良かったこと、気づいたことなど">${escapeHtml(log.note)}</textarea></label>
      </div>
      <button type="submit" class="btn btn-primary btn-block">💾 保存する</button>
      <div id="log-result"></div>
    </form>
    <section class="card">
      <h2>✅ この日の習慣</h2>
      ${checklistBlock(d)}
    </section>`;

  document.getElementById("log-date").addEventListener("change", (e) => {
    if (e.target.value) {
      logDate = e.target.value;
      renderPage();
    }
  });

  const form = document.getElementById("log-form");
  form.addEventListener("input", (e) => {
    if (e.target.type === "range") {
      const out = form.querySelector(`[data-range-out="${e.target.name}"]`);
      if (out) out.textContent = e.target.value;
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = form.elements;
    const data = sanitizeLog(d, {
      bedtime: f.bedtime.value,
      wake_time: f.wake_time.value,
      sleep_quality: f.sleep_quality.value,
      water_ml: f.water_ml.value,
      steps: f.steps.value,
      exercise_min: f.exercise_min.value,
      screen_min: f.screen_min.value,
      meals: f.meals.value,
      vegetables: f.vegetables.checked,
      alcohol: f.alcohol.checked,
      late_caffeine: f.late_caffeine.checked,
      mood: f.mood.value,
      energy: f.energy.value,
      note: f.note.value,
    }, state.settings);
    saveLog(data);

    const { score, breakdown } = computeScore(data, state.settings, habitRate(d));
    destroyCharts();
    document.getElementById("log-result").innerHTML = `
      <div class="alert-success">保存しました。この日のスコアは ${score} 点（${scoreLabel(score)}）です。</div>
      <div class="chart-box"><canvas id="chart-log-breakdown"></canvas></div>`;
    makeChart("chart-log-breakdown", breakdownConfig(breakdown));
    updateSidebar();
  });
}

// ---------------------------------------------------------------------------
// ページ: 習慣トラッカー
// ---------------------------------------------------------------------------
function renderHabits() {
  const t = todayStr();
  const hs = activeHabits();
  const start = addDays(t, -29);

  let statsHtml = "";
  let heatHtml = "";
  if (hs.length) {
    const rows = hs
      .map((h) => {
        const periodStart = h.createdAt > start ? h.createdAt : start;
        const days = Math.max(1, daysBetween(periodStart, t) + 1);
        const done = doneDates(h.id).filter((d) => d >= periodStart && d <= t).length;
        return `
          <tr>
            <td>${escapeHtml(h.name)}</td>
            <td>${Math.round((done / days) * 100)}%</td>
            <td>${done} / ${days}</td>
            <td>${currentStreak(h.id)} 日</td>
            <td>${bestStreak(h.id)} 日</td>
          </tr>`;
      })
      .join("");
    statsHtml = `
      <section class="card">
        <h2>🏆 習慣ごとの成績（直近30日）</h2>
        <div class="table-scroll">
          <table>
            <thead><tr><th>習慣</th><th>達成率</th><th>達成日数</th><th>現在の連続</th><th>最長連続</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>`;

    const dates = dateRange(start, t);
    const head = `<div></div>${dates.map((d) => `<div class="heat-head">${Number(d.slice(8))}</div>`).join("")}`;
    const body = hs
      .map((h) => {
        const cells = dates
          .map((d) => {
            const done = isDone(h.id, d);
            return `<div class="heat-cell ${done ? "done" : ""}" title="${escapeHtml(h.name)} ${d} ${done ? "達成" : "未達成"}"></div>`;
          })
          .join("");
        return `<div class="heat-label" title="${escapeHtml(h.name)}">${escapeHtml(h.name)}</div>${cells}`;
      })
      .join("");
    heatHtml = `
      <section class="card">
        <h2>🗓️ 30日ヒートマップ</h2>
        <p class="muted small">${formatJpDate(start)} 〜 ${formatJpDate(t)}（緑 = 達成）</p>
        <div class="heat-scroll">
          <div class="heatmap" style="grid-template-columns: minmax(120px, 180px) repeat(${dates.length}, minmax(18px, 1fr));">
            ${head}${body}
          </div>
        </div>
      </section>`;
  }

  app.innerHTML = `
    <h1>✅ 習慣トラッカー</h1>
    <section class="card">
      <h2>今日のチェック</h2>
      ${checklistBlock(t)}
    </section>
    ${statsHtml}
    ${heatHtml}`;
}

// ---------------------------------------------------------------------------
// ページ: 分析
// ---------------------------------------------------------------------------
function renderAnalysis() {
  const t = todayStr();
  const s = state.settings;
  const start = addDays(t, -(analysisPeriod - 1));
  const rows = buildDaily(start, t);
  const options = [7, 30, 90]
    .map((p) => `<option value="${p}" ${p === analysisPeriod ? "selected" : ""}>直近 ${p} 日</option>`)
    .join("");

  const header = `
    <h1>🔍 分析</h1>
    <div class="toolbar">
      <label for="period">期間</label>
      <select id="period">${options}</select>
    </div>`;

  if (!rows.length) {
    app.innerHTML = `${header}<div class="notice">この期間のデータがありません。</div>`;
    bindPeriod();
    return;
  }

  let corrHtml = '<p class="muted small">相関係数は5日以上かつ値にばらつきがあるデータで計算されます。</p>';
  const sleeps = rows.map((r) => r.sleep_h);
  const moods = rows.map((r) => r.mood);
  if (rows.length >= 5 && std(sleeps) > 0 && std(moods) > 0) {
    corrHtml = `<p>睡眠時間と気分の相関係数: ${corr(sleeps, moods).toFixed(2)}（-1〜1。1に近いほど、よく眠れた日ほど気分が良い傾向）</p>`;
  }

  app.innerHTML = `
    ${header}
    <section class="card">
      <div class="grid cols-4">
        ${metric("平均スコア", `${Math.round(mean(rows.map((r) => r.score)))} 点`)}
        ${metric("平均睡眠", `${mean(sleeps).toFixed(1)} h`)}
        ${metric("平均歩数", `${Math.round(mean(rows.map((r) => r.steps))).toLocaleString()} 歩`)}
        ${metric("記録日数", `${rows.length} / ${analysisPeriod} 日`)}
      </div>
    </section>
    <section class="card">
      <h2>📈 スコア推移</h2>
      <div class="chart-box short"><canvas id="chart-a-score"></canvas></div>
    </section>
    <section class="card">
      <h2>😴 睡眠時間</h2>
      <p class="muted small">青 = 目標達成、赤 = 目標未満、破線 = 目標 ${s.sleep_goal} 時間</p>
      <div class="chart-box short"><canvas id="chart-a-sleep"></canvas></div>
    </section>
    <section class="card">
      <h2>🕒 就寝・起床リズム</h2>
      <div class="chart-box"><canvas id="chart-a-rhythm"></canvas></div>
    </section>
    <div class="grid cols-2">
      <section class="card">
        <h2>🚶 歩数</h2>
        <div class="chart-box short"><canvas id="chart-a-steps"></canvas></div>
      </section>
      <section class="card">
        <h2>🏃 運動 (分)</h2>
        <div class="chart-box short"><canvas id="chart-a-exercise"></canvas></div>
      </section>
    </div>
    <section class="card">
      <h2>🔗 睡眠と気分の関係</h2>
      <div class="chart-box"><canvas id="chart-a-scatter"></canvas></div>
      ${corrHtml}
    </section>
    <section class="card">
      <h2>💡 この期間のアドバイス</h2>
      ${adviceHtml(rows)}
    </section>
    <button id="export-period" class="btn">⬇️ この期間のデータをCSVでダウンロード</button>`;

  bindPeriod();
  document.getElementById("export-period").addEventListener("click", () => {
    download(`lifestyle_${start}_${t}.csv`, toCsv(rows), "text/csv;charset=utf-8");
  });

  const dates = dateRange(start, t);
  const labels = dates.map(shortDate);
  const noLegend = { legend: { display: false } };

  makeChart("chart-a-score", {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "スコア",
        data: seriesFor(rows, dates, "score"),
        borderColor: "#2f8f5b",
        backgroundColor: "rgba(47, 143, 91, 0.15)",
        fill: true,
        tension: 0.3,
        spanGaps: true,
      }],
    },
    options: { plugins: noLegend, scales: { y: { min: 0, max: 100 } } },
  });

  const sleepData = seriesFor(rows, dates, "sleep_h");
  makeChart("chart-a-sleep", {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          type: "line",
          label: "目標",
          data: dates.map(() => s.sleep_goal),
          borderColor: "#888",
          borderDash: [6, 4],
          borderWidth: 1.5,
          pointRadius: 0,
        },
        {
          label: "睡眠時間",
          data: sleepData,
          backgroundColor: sleepData.map((v) => (v !== null && v >= s.sleep_goal ? "#4c78a8" : "#e45756")),
          borderRadius: 4,
        },
      ],
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${Number(ctx.parsed.y).toFixed(1)} h` } },
      },
      scales: { y: { beginAtZero: true } },
    },
  });

  makeChart("chart-a-rhythm", {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "就寝",
          data: seriesFor(rows, dates, "bed_clock"),
          borderColor: "#6f4fb8",
          backgroundColor: "#6f4fb8",
          spanGaps: true,
          tension: 0.2,
        },
        {
          label: "起床",
          data: seriesFor(rows, dates, "wake_clock"),
          borderColor: "#f2a541",
          backgroundColor: "#f2a541",
          spanGaps: true,
          tension: 0.2,
        },
      ],
    },
    options: {
      plugins: {
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${clockLabel(ctx.parsed.y)}` } },
      },
      scales: { y: { ticks: { callback: (v) => clockLabel(v) } } },
    },
  });

  makeChart("chart-a-steps", {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "歩数", data: seriesFor(rows, dates, "steps"), backgroundColor: "#54a24b", borderRadius: 4 }],
    },
    options: { plugins: noLegend, scales: { y: { beginAtZero: true } } },
  });

  makeChart("chart-a-exercise", {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "運動 (分)", data: seriesFor(rows, dates, "exercise_min"), backgroundColor: "#f58518", borderRadius: 4 }],
    },
    options: { plugins: noLegend, scales: { y: { beginAtZero: true } } },
  });

  makeChart("chart-a-scatter", {
    type: "scatter",
    data: {
      datasets: [{
        label: "日ごとの記録",
        data: rows.map((r) => ({ x: r.sleep_h, y: r.mood, date: r.date })),
        backgroundColor: "rgba(76, 120, 168, 0.7)",
        pointRadius: 6,
      }],
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.raw.date}: 睡眠 ${ctx.raw.x.toFixed(1)} h / 気分 ${ctx.raw.y}`,
          },
        },
      },
      scales: {
        x: { title: { display: true, text: "睡眠時間 (h)" } },
        y: { min: 1, max: 5, ticks: { stepSize: 1 }, title: { display: true, text: "気分" } },
      },
    },
  });
}

function bindPeriod() {
  document.getElementById("period").addEventListener("change", (e) => {
    analysisPeriod = Number(e.target.value);
    renderPage();
  });
}

// ---------------------------------------------------------------------------
// ページ: 設定
// ---------------------------------------------------------------------------
function renderSettings() {
  const s = state.settings;
  const habitRows = state.habits
    .map((h) => `
      <li class="habit-row">
        <span>${escapeHtml(h.name)}</span>
        <label class="check-label"><input type="checkbox" data-toggle-habit="${h.id}" ${h.active ? "checked" : ""}>有効</label>
        <button class="btn btn-small btn-danger" data-delete-habit="${h.id}">削除</button>
      </li>`)
    .join("");

  app.innerHTML = `
    <h1>⚙️ 設定</h1>
    ${flashHtml()}
    <form id="settings-form" class="card">
      <h2>🎯 目標</h2>
      <div class="form-grid cols-3">
        ${numberField("sleep_goal", "目標睡眠時間 (h)", s.sleep_goal, 4, 12, 0.5)}
        <label>目標就寝時刻<input type="time" name="target_bedtime" step="300" value="${s.target_bedtime}"></label>
        <label>目標起床時刻<input type="time" name="target_wake" step="300" value="${s.target_wake}"></label>
      </div>
      <div class="form-grid cols-4">
        ${numberField("water_goal", "水分 (ml)", s.water_goal, 500, 5000, 100)}
        ${numberField("steps_goal", "歩数", s.steps_goal, 1000, 30000, 500)}
        ${numberField("exercise_goal", "運動 (分)", s.exercise_goal, 5, 300, 5)}
        ${numberField("screen_goal", "スクリーン上限 (分)", s.screen_goal, 10, 720, 10)}
      </div>
      <button type="submit" class="btn btn-primary">💾 目標を保存</button>
    </form>

    <section class="card">
      <h2>📋 習慣の管理</h2>
      <form id="habit-form" class="inline-form">
        <input type="text" name="name" maxlength="50" placeholder="例: 夜にストレッチ10分">
        <button type="submit" class="btn btn-primary">追加</button>
      </form>
      ${state.habits.length ? `<ul class="habit-list">${habitRows}</ul>` : '<p class="muted">習慣がありません。</p>'}
      <p class="muted small">「有効」を外すと記録を残したまま非表示になります。「削除」は記録も消去します。</p>
    </section>

    <section class="card">
      <h2>💾 データ</h2>
      <p class="muted small">記録はこのブラウザ内（localStorage）に保存されます。別の端末やブラウザへ移す場合や、ブラウザのデータ消去に備える場合は、JSONでバックアップしてください。</p>
      <div class="btn-row">
        <button id="export-csv" class="btn" ${Object.keys(state.logs).length ? "" : "disabled"}>⬇️ 全記録をCSVでダウンロード</button>
        <button id="export-json" class="btn">⬇️ バックアップ (JSON)</button>
        <button id="import-json" class="btn">⬆️ バックアップから復元</button>
        <input type="file" id="import-file" accept="application/json,.json" hidden>
        <button id="reset-all" class="btn btn-danger">🗑️ すべてのデータを削除</button>
      </div>
    </section>`;

  document.getElementById("settings-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target.elements;
    state.settings = sanitizeSettings({
      sleep_goal: f.sleep_goal.value,
      target_bedtime: f.target_bedtime.value,
      target_wake: f.target_wake.value,
      water_goal: f.water_goal.value,
      steps_goal: f.steps_goal.value,
      exercise_goal: f.exercise_goal.value,
      screen_goal: f.screen_goal.value,
    });
    save();
    flash = { type: "success", text: "目標を保存しました。" };
    renderPage();
  });

  document.getElementById("habit-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = e.target.elements.name.value.trim();
    if (!name) {
      flash = { type: "warn", text: "習慣名を入力してください。" };
    } else if (addHabit(name)) {
      flash = { type: "success", text: `「${name}」を追加しました。` };
    } else {
      flash = { type: "warn", text: "同じ名前の習慣がすでに存在します。" };
    }
    renderPage();
  });

  app.querySelectorAll("[data-toggle-habit]").forEach((el) => {
    el.addEventListener("change", () => {
      const h = state.habits.find((x) => x.id === Number(el.dataset.toggleHabit));
      if (h) {
        h.active = el.checked;
        save();
        updateSidebar();
      }
    });
  });

  app.querySelectorAll("[data-delete-habit]").forEach((el) => {
    el.addEventListener("click", () => {
      const h = state.habits.find((x) => x.id === Number(el.dataset.deleteHabit));
      if (h && confirm(`「${h.name}」を削除しますか？この習慣の記録もすべて消去されます。`)) {
        deleteHabit(h.id);
        renderPage();
      }
    });
  });

  document.getElementById("export-csv").addEventListener("click", () => {
    const rows = buildDaily("0000-01-01", "9999-12-31");
    download("lifestyle_all.csv", toCsv(rows), "text/csv;charset=utf-8");
  });

  document.getElementById("export-json").addEventListener("click", () => {
    download(`liferhythm_backup_${todayStr()}.json`, JSON.stringify(state, null, 2), "application/json");
  });

  const fileInput = document.getElementById("import-file");
  document.getElementById("import-json").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("invalid");
        if (!confirm("現在のデータをバックアップの内容で上書きします。よろしいですか？")) return;
        state = normalizeState(data);
        save();
        flash = { type: "success", text: "バックアップから復元しました。" };
      } catch (err) {
        flash = { type: "warn", text: "ファイルを読み込めませんでした。このアプリで作成したJSONファイルを選択してください。" };
      }
      renderPage();
    };
    reader.readAsText(file);
  });

  document.getElementById("reset-all").addEventListener("click", () => {
    if (!confirm("すべての記録・習慣・設定を削除します。元に戻せません。よろしいですか？")) return;
    state = normalizeState({});
    save();
    flash = { type: "success", text: "データを初期化しました。" };
    renderPage();
  });
}

// ---------------------------------------------------------------------------
// ルーティング・共通処理
// ---------------------------------------------------------------------------
const RENDERERS = {
  dashboard: renderDashboard,
  log: renderLog,
  habits: renderHabits,
  analysis: renderAnalysis,
  settings: renderSettings,
};

function currentPage() {
  const key = location.hash.slice(1);
  return Object.prototype.hasOwnProperty.call(PAGES, key) ? key : "dashboard";
}

function updateSidebar() {
  const t = todayStr();
  const log = getLog(t);
  const el = document.getElementById("side-score");
  if (log) {
    const { score } = computeScore(log, state.settings, habitRate(t));
    el.innerHTML = `
      <div class="metric-label">今日のスコア</div>
      <div class="side-score-value">${score} 点</div>
      <div class="muted small">${scoreLabel(score)}</div>`;
  } else {
    el.innerHTML = '<span class="muted small">今日はまだ記録がありません。</span>';
  }
  document.getElementById("side-goal").textContent =
    `目標就寝 ${state.settings.target_bedtime} / 起床 ${state.settings.target_wake}`;
}

function renderPage() {
  const page = currentPage();
  destroyCharts();
  document.querySelectorAll("#nav a").forEach((a) => {
    a.classList.toggle("active", a.dataset.page === page);
  });
  RENDERERS[page]();
  updateSidebar();
  if (page !== lastPage) {
    window.scrollTo(0, 0);
    lastPage = page;
  }
}

function onHabitCheck(e) {
  const el = e.target;
  if (!el.matches("input[data-habit-id]")) return;
  setDone(Number(el.dataset.habitId), el.dataset.date, el.checked);
  if (currentPage() === "log") {
    document.querySelectorAll("[data-checklist-date]").forEach((box) => {
      box.innerHTML = checklistHtml(box.dataset.checklistDate);
    });
    updateSidebar();
  } else {
    renderPage();
  }
}

function init() {
  if (typeof Chart !== "undefined") {
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.color = "#4a5a50";
  }
  document.getElementById("nav").innerHTML = Object.entries(PAGES)
    .map(([key, label]) => `<a href="#${key}" data-page="${key}">${label}</a>`)
    .join("");

  window.addEventListener("hashchange", renderPage);
  app.addEventListener("change", onHabitCheck);
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) {
      state = loadState();
      renderPage();
    }
  });
  renderPage();
}

init();
