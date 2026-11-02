// File: js/core/planner.js
import { addDays, formatClock, formatDuration, minutesOf, minutesToTime } from "./date.js";
import { habitsForDate, isHabitDone } from "./habits.js";
import { createSchedules, schedulesBetween } from "./schedules.js";
import { sleepStats } from "./sleep.js";

export const DAY_END = 1439;
export const STEP = 5;
const EDGE_WINDOW = 90;

export function roundUp(min) {
  return Math.ceil(min / STEP) * STEP;
}

function roundNearest(min) {
  return Math.round(min / STEP) * STEP;
}

// wake: 起床予定（分）、bed: 就寝予定（分、24時以降は1440以上）、end: その日に割り当てられる最後の時刻
export function planBounds(settings) {
  const wake = minutesOf(settings.planner.wakeTime);
  const bed = wake + 1440 - Math.round(settings.targetSleep * 60);
  return { wake, bed, end: Math.min(bed, DAY_END) };
}

function windowRange(key, b) {
  switch (key) {
    case "afterWake":
      return [b.wake, b.wake + EDGE_WINDOW];
    case "morning":
      return [b.wake, 720];
    case "afternoon":
      return [720, 1080];
    case "evening":
      return [1080, b.end];
    case "beforeBed":
      return [b.bed - EDGE_WINDOW, b.end];
    default:
      return [b.wake, b.end];
  }
}

function bedGap(category, planner) {
  if (category === "運動") return planner.exerciseGapMin;
  if (category === "食事") return planner.mealGapMin;
  return 0;
}

// busy の各区間と buffer 分以上離れた、from〜to に収まる最も早い開始時刻
export function findSlot(busy, from, to, duration, buffer = 0) {
  const candidates = [from, ...busy.map(([, end]) => end + buffer)]
    .map(roundUp)
    .filter((s) => s >= from && s + duration <= to)
    .sort((a, b) => a - b);
  for (const s of candidates) {
    const e = s + duration;
    if (busy.every(([b0, b1]) => e + buffer <= b0 || s >= b1 + buffer)) {
      return s;
    }
  }
  return null;
}

function freeTime(busy, from, to) {
  if (to <= from) {
    return 0;
  }
  const clipped = busy
    .map(([s, e]) => [Math.max(s, from), Math.min(e, to)])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  let used = 0;
  let curStart = null;
  let curEnd = null;
  for (const [s, e] of clipped) {
    if (curEnd === null || s > curEnd) {
      if (curEnd !== null) used += curEnd - curStart;
      curStart = s;
      curEnd = e;
    } else {
      curEnd = Math.max(curEnd, e);
    }
  }
  if (curEnd !== null) used += curEnd - curStart;
  return to - from - used;
}

// notBefore: この時刻（分）より前には割り当てない（今日の計画用）
export function buildPlan(data, date, { notBefore = null } = {}) {
  const planner = data.settings.planner;
  const bounds = planBounds(data.settings);
  const buffer = planner.bufferMin;
  const schedules = schedulesBetween(data, date, date);
  const items = [];
  const warnings = [];
  const unplaced = [];
  const doneHabits = [];
  const noDuration = [];
  const busy = [];

  for (const s of schedules) {
    const start = minutesOf(s.start);
    const end = minutesOf(s.end);
    items.push({
      kind: "schedule",
      start,
      end,
      title: s.title,
      category: s.category,
      scheduleId: s.id,
      habitId: s.habitId,
      done: s.done,
    });
    busy.push([start, end]);

    const gap = bedGap(s.category, planner);
    if (start < bounds.wake) {
      warnings.push(`予定「${s.title}」（${s.start}〜）は、起床予定時刻（${formatClock(bounds.wake)}）より前です。`);
    }
    if (end > bounds.bed) {
      warnings.push(`予定「${s.title}」（〜${s.end}）は、就寝予定時刻（${formatClock(bounds.bed)}）より後まで続きます。`);
    } else if (gap > 0 && end > bounds.bed - gap) {
      warnings.push(`予定「${s.title}」（${s.category}）は、就寝前${gap}分以内にかかっています。`);
    }
  }

  for (let i = 0; i < schedules.length; i++) {
    for (let j = i + 1; j < schedules.length; j++) {
      const a = schedules[i];
      const b = schedules[j];
      if (a.start < b.end && b.start < a.end) {
        warnings.push(`予定「${a.title}」と「${b.title}」の時間が重なっています。`);
      }
    }
  }

  const linked = new Set(schedules.map((s) => s.habitId).filter(Boolean));
  const flexible = [];

  for (const h of habitsForDate(data, date)) {
    if (linked.has(h.id)) continue;
    const done = isHabitDone(data, h.id, date);
    if (h.targetTime) {
      const start = minutesOf(h.targetTime);
      const end = start + h.duration;
      items.push({ kind: "fixed", start, end, title: h.name, category: h.category, habitId: h.id, done });
      if (h.duration > 0) {
        const hit = schedules.find((s) => start < minutesOf(s.end) && minutesOf(s.start) < end);
        if (hit) {
          warnings.push(`習慣「${h.name}」（${h.targetTime}〜）が予定「${hit.title}」と重なっています。`);
        }
        busy.push([start, end]);
      }
      continue;
    }
    if (h.duration <= 0) {
      noDuration.push(h);
      continue;
    }
    if (done) {
      doneHabits.push(h);
      continue;
    }
    flexible.push(h);
  }

  const lower = notBefore === null ? 0 : roundUp(notBefore);
  const ranges = flexible.map((h) => {
    const [from, to] = windowRange(h.window, bounds);
    const gap = bedGap(h.category, planner);
    return {
      h,
      from: Math.max(from, bounds.wake, lower),
      to: Math.min(to, bounds.end, gap > 0 ? bounds.bed - gap : Infinity),
    };
  });
  // 条件の厳しい習慣から先に割り当てる
  ranges.sort(
    (a, b) =>
      a.to - a.from - (b.to - b.from) ||
      b.h.duration - a.h.duration ||
      a.h.order - b.h.order
  );

  for (const r of ranges) {
    const fits = r.to - r.from >= r.h.duration;
    const start = fits ? findSlot(busy, r.from, r.to, r.h.duration, buffer) : null;
    if (start === null) {
      unplaced.push({
        habit: r.h,
        reason: fits
          ? "指定した時間帯に十分な空き時間がありません。"
          : "指定した時間帯（現在時刻以降、就寝前の制限を含む）に収まりません。",
      });
      continue;
    }
    const end = start + r.h.duration;
    busy.push([start, end]);
    items.push({ kind: "planned", start, end, title: r.h.name, category: r.h.category, habitId: r.h.id, done: false });
  }

  items.sort((a, b) => a.start - b.start || a.end - b.end);

  return {
    date,
    bounds,
    items,
    unplaced,
    doneHabits,
    noDuration,
    warnings,
    freeMinutes: freeTime(busy, Math.max(bounds.wake, lower), bounds.end),
  };
}

// 計画の「おすすめ」を、習慣と連動した予定として登録する
export function commitPlan(data, plan) {
  let count = 0;
  for (const item of plan.items) {
    if (item.kind !== "planned") continue;
    const r = createSchedules(data, {
      title: item.title,
      category: item.category,
      memo: "プランナーで作成",
      date: plan.date,
      start: minutesToTime(item.start),
      end: minutesToTime(item.end),
      habitId: item.habitId,
      repeat: null,
    });
    if (!r.error) {
      count += r.count;
    }
  }
  return count;
}

export function sleepAdvice(data, today, days = 14) {
  const bounds = planBounds(data.settings);
  let recommendedBed = bounds.bed;
  if (recommendedBed >= 2160) {
    recommendedBed -= 1440;
  }
  const dates = [];
  for (let i = days - 1; i >= 0; i--) {
    dates.push(addDays(today, -i));
  }
  const stats = sleepStats(data.sleepLogs, dates);
  const messages = [];
  let tonight = recommendedBed;

  if (!stats) {
    messages.push("睡眠記録がないため、目標の起床時刻と目標睡眠時間から計算した時刻だけを表示しています。");
    return { recommendedBed, recommendedWake: bounds.wake, tonight, stats, messages };
  }

  const diff = Math.round(stats.avgBed - recommendedBed);
  if (diff > 15) {
    tonight = Math.max(recommendedBed, roundNearest(stats.avgBed - 15));
    messages.push(
      `直近${stats.count}日の平均就寝時刻（${formatClock(Math.round(stats.avgBed))}）は、推奨より約${formatDuration(diff)}遅くなっています。`
    );
    messages.push(`一度に大きく変えず少しずつ近づける場合、今夜の目安は ${formatClock(tonight)} です（平均より約15分早い時刻）。`);
  } else if (diff < -15) {
    messages.push(`直近${stats.count}日の平均就寝時刻は、推奨より約${formatDuration(-diff)}早くなっています。`);
  } else {
    messages.push(`直近${stats.count}日の平均就寝時刻は、推奨とほぼ同じです。`);
  }

  const target = data.settings.targetSleep;
  const hoursDiff = Math.round((stats.avgHours - target) * 60);
  if (hoursDiff < -15) {
    messages.push(`平均睡眠時間は目標より約${formatDuration(-hoursDiff)}短くなっています。`);
  } else if (hoursDiff > 15) {
    messages.push(`平均睡眠時間は目標より約${formatDuration(hoursDiff)}長くなっています。`);
  }
  if (stats.count >= 3 && stats.sdBed >= 60) {
    messages.push(`就寝時刻のばらつき（標準偏差）は約${Math.round(stats.sdBed)}分です。`);
  }
  if (stats.weekdayWake !== null && stats.weekendWake !== null) {
    const gap = Math.round(Math.abs(stats.weekendWake - stats.weekdayWake));
    if (gap >= 60) {
      messages.push(`平日と週末で、平均起床時刻に約${formatDuration(gap)}の差があります。`);
    }
  }
  return { recommendedBed, recommendedWake: bounds.wake, tonight, stats, messages };
}