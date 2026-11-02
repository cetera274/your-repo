// File: js/reminders.js
import { minutesOf, nowMinutes, todayStr } from "./core/date.js";
import { habitsForDate, isHabitDone } from "./core/habits.js";
import { schedulesBetween } from "./core/schedules.js";
import { getData, getPrefs } from "./store.js";

const NOTIFIED_KEY = "habitPlanner.notified";
const WINDOW_MIN = 15;
let timer = null;

export function notificationSupported() {
  return "Notification" in window;
}

export function notificationStatusText() {
  if (!notificationSupported()) {
    return "このブラウザは通知に対応していません。";
  }
  const map = {
    granted: "許可されています。",
    denied: "拒否されています。ブラウザのサイト設定から許可してください。",
    default: "まだ許可されていません。",
  };
  return map[Notification.permission] || "";
}

export async function requestNotificationPermission() {
  if (!notificationSupported()) {
    return false;
  }
  if (Notification.permission === "granted") {
    return true;
  }
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch (e) {
    console.error(e);
    return false;
  }
}

export async function notify(title, body, tag) {
  const options = { body, tag, icon: "icons/icon-192.png" };
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && reg.active) {
        await reg.showNotification(title, options);
        return;
      }
    }
    new Notification(title, options);
  } catch (e) {
    console.error(e);
  }
}

function loadNotified() {
  try {
    return JSON.parse(localStorage.getItem(NOTIFIED_KEY) || "{}") || {};
  } catch (e) {
    return {};
  }
}

export function checkReminders() {
  const prefs = getPrefs();
  if (!prefs.reminder.enabled || !notificationSupported() || Notification.permission !== "granted") {
    return;
  }
  const data = getData();
  const today = todayStr();
  const now = nowMinutes();
  const notified = loadNotified();

  for (const key of Object.keys(notified)) {
    if (notified[key] !== today) {
      delete notified[key];
    }
  }

  const inWindow = (trigger) => now >= trigger && now < trigger + WINDOW_MIN;
  const before = Number(prefs.reminder.scheduleMinutes) || 0;

  for (const s of schedulesBetween(data, today, today)) {
    if (s.done) continue;
    const key = `s:${s.id}:${s.start}`;
    if (notified[key] || !inWindow(minutesOf(s.start) - before)) continue;
    notified[key] = today;
    const when = before > 0 ? `${before}分後に始まります` : "開始時刻です";
    notify(`予定：${s.title}`, `${s.start}〜${s.end}（${when}）`, key);
  }

  if (prefs.reminder.habits) {
    for (const h of habitsForDate(data, today)) {
      if (!h.targetTime || isHabitDone(data, h.id, today)) continue;
      const key = `h:${h.id}:${h.targetTime}`;
      if (notified[key] || !inWindow(minutesOf(h.targetTime))) continue;
      notified[key] = today;
      notify(`習慣：${h.name}`, `目標時刻 ${h.targetTime} になりました`, key);
    }
  }

  try {
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify(notified));
  } catch (e) {
    console.error(e);
  }
}

export function startReminders() {
  clearInterval(timer);
  timer = null;
  if (!getPrefs().reminder.enabled) {
    return;
  }
  checkReminders();
  timer = setInterval(checkReminders, 30000);
}