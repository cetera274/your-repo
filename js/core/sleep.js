// File: js/core/sleep.js
import { minutesOf, weekdayIndex } from "./date.js";

export function sleepMinutes(bed, wake) {
  let mins = minutesOf(wake) - minutesOf(bed);
  if (mins <= 0) {
    mins += 1440;
  }
  return mins;
}

export function sleepHours(bed, wake) {
  return Math.round((sleepMinutes(bed, wake) / 60) * 100) / 100;
}

// 正午を起点にした就寝時刻（分）。0:00〜11:59は24時以降として扱う
export function bedtimeFromNoon(bed) {
  const m = minutesOf(bed);
  return m < 720 ? m + 1440 : m;
}

function mean(list) {
  if (list.length === 0) {
    return null;
  }
  return list.reduce((a, b) => a + b, 0) / list.length;
}

function stdev(list) {
  if (list.length < 2) {
    return 0;
  }
  const avg = mean(list);
  return Math.sqrt(mean(list.map((v) => (v - avg) ** 2)));
}

export function sleepStats(sleepLogs, dates) {
  const records = dates
    .filter((d) => sleepLogs[d])
    .map((d) => ({ date: d, ...sleepLogs[d] }));
  if (records.length === 0) {
    return null;
  }
  const beds = records.map((r) => bedtimeFromNoon(r.bedtime));
  const wakes = records.map((r) => minutesOf(r.wakeTime));
  const weekdayWakes = records
    .filter((r) => weekdayIndex(r.date) < 5)
    .map((r) => minutesOf(r.wakeTime));
  const weekendWakes = records
    .filter((r) => weekdayIndex(r.date) >= 5)
    .map((r) => minutesOf(r.wakeTime));

  return {
    count: records.length,
    avgHours: mean(records.map((r) => sleepHours(r.bedtime, r.wakeTime))),
    avgQuality: mean(records.map((r) => Number(r.quality))),
    avgBed: mean(beds),
    avgWake: mean(wakes),
    sdBed: stdev(beds),
    sdWake: stdev(wakes),
    weekdayWake: mean(weekdayWakes),
    weekendWake: mean(weekendWakes),
  };
}