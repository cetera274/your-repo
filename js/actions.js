// File: js/actions.js
import { setHabitDoneIn } from "./core/habits.js";
import { findSchedule } from "./core/schedules.js";
import { getData, save } from "./store.js";

// 習慣と、その習慣に連動した同じ日の予定を同時に更新する
export function setHabitDone(habitId, date, done) {
  const data = getData();
  setHabitDoneIn(data, habitId, date, done);
  for (const s of data.schedules) {
    if (s.habitId === habitId && s.date === date) {
      s.done = done;
    }
  }
  save();
}

export function setScheduleDone(id, done) {
  const data = getData();
  const s = findSchedule(data, id);
  if (!s) {
    return;
  }
  s.done = done;
  if (s.habitId && data.habits.some((h) => h.id === s.habitId)) {
    setHabitDoneIn(data, s.habitId, s.date, done);
  }
  save();
}