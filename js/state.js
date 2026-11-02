// File: js/state.js
import { todayStr } from "./core/date.js";

const today = todayStr();

// 画面の表示状態（保存しない）
export const state = {
  page: "today",
  todayDate: today,
  weekStart: today,
  sleepDate: today,
  calMonth: today.slice(0, 7),
  planDate: today,
  planAfterNow: true,
  reviewDays: 7,
};