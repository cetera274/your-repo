// File: js/core/schedules.js
import { addDays, datesByWeekdays, diffDays, isDateStr, isTimeStr } from "./date.js";
import { newId } from "./data.js";

export const MAX_REPEAT_DAYS = 366;

export function schedulesBetween(data, start, end) {
  return data.schedules
    .filter((s) => s.date >= start && s.date <= end)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.start.localeCompare(b.start) ||
        a.id - b.id
    );
}

export function findSchedule(data, id) {
  return data.schedules.find((s) => s.id === id);
}

export function findRule(data, id) {
  return data.recurrences.find((r) => r.id === id);
}

export function groupItems(data, groupId) {
  return data.schedules.filter((s) => s.groupId === groupId);
}

export function ruleDates(rule) {
  const excluded = new Set(rule.excludedDates);
  return datesByWeekdays(rule.startDate, rule.until, rule.weekdays).filter((d) => !excluded.has(d));
}

export function validateContent(v) {
  if (!String(v.title ?? "").trim()) return "予定名を入力してください。";
  if (!isTimeStr(v.start) || !isTimeStr(v.end)) return "開始時刻と終了時刻を入力してください。";
  if (v.end <= v.start) return "終了時刻は開始時刻より後にしてください。";
  return null;
}

export function validateRange(startDate, until, weekdays) {
  if (!isDateStr(startDate)) return "開始日を入力してください。";
  if (!isDateStr(until)) return "繰り返し終了日を入力してください。";
  if (until < startDate) return "繰り返し終了日は開始日以降にしてください。";
  if (!Array.isArray(weekdays) || weekdays.length === 0) return "繰り返す曜日を選択してください。";
  if (diffDays(startDate, until) > MAX_REPEAT_DAYS) return "繰り返し期間は1年以内にしてください。";
  return null;
}

function pickContent(v) {
  return {
    title: String(v.title).trim(),
    category: v.category,
    memo: String(v.memo ?? "").trim(),
    start: v.start,
    end: v.end,
  };
}

function sortedWeekdays(list) {
  return [...new Set(list.map(Number))].sort((a, b) => a - b);
}

function newOccurrence(data, date, content, groupId, habitId = null) {
  return { id: newId(data), date, ...content, done: false, groupId, habitId };
}

function addExcluded(rule, date) {
  if (!rule.excludedDates.includes(date)) {
    rule.excludedDates.push(date);
    rule.excludedDates.sort();
  }
}

function removeRuleIfEmpty(data, ruleId) {
  if (!data.schedules.some((s) => s.groupId === ruleId)) {
    data.recurrences = data.recurrences.filter((r) => r.id !== ruleId);
  }
}

// input: { title, category, memo, date, start, end, habitId?, repeat: null | { until, weekdays } }
export function createSchedules(data, input) {
  const error = validateContent(input);
  if (error) return { error };
  if (!isDateStr(input.date)) return { error: "日付を入力してください。" };
  const content = pickContent(input);

  if (!input.repeat) {
    data.schedules.push(newOccurrence(data, input.date, content, null, input.habitId ?? null));
    return { count: 1 };
  }

  const weekdays = sortedWeekdays(input.repeat.weekdays || []);
  const rangeError = validateRange(input.date, input.repeat.until, weekdays);
  if (rangeError) return { error: rangeError };

  const dates = datesByWeekdays(input.date, input.repeat.until, weekdays);
  if (dates.length === 0) return { error: "指定の条件に該当する日がありません。" };
  if (dates.length === 1) {
    data.schedules.push(newOccurrence(data, dates[0], content, null));
    return { count: 1 };
  }

  const rule = {
    id: newId(data),
    ...content,
    startDate: input.date,
    until: input.repeat.until,
    weekdays,
    excludedDates: [],
  };
  data.recurrences.push(rule);
  for (const d of dates) {
    data.schedules.push(newOccurrence(data, d, content, rule.id));
  }
  return { count: dates.length, ruleId: rule.id };
}

// scope: "single" = この予定のみ / "future" = この日以降 / "all" = すべて
export function scopeMatches(base, s, scope) {
  if (scope === "single" || !base.groupId) {
    return s.id === base.id;
  }
  if (s.groupId !== base.groupId) {
    return false;
  }
  return scope === "all" || s.date >= base.date;
}

export function groupCounts(data, s) {
  if (!s.groupId) {
    return { all: 1, future: 1 };
  }
  const group = groupItems(data, s.groupId);
  return {
    all: group.length,
    future: group.filter((x) => x.date >= s.date).length,
  };
}

// fromDate が null のときは繰り返し全体を削除する
export function deleteRuleFrom(data, ruleId, fromDate) {
  const before = data.schedules.length;
  data.schedules = data.schedules.filter(
    (s) => !(s.groupId === ruleId && (!fromDate || s.date >= fromDate))
  );
  const removed = before - data.schedules.length;

  if (!fromDate) {
    data.recurrences = data.recurrences.filter((r) => r.id !== ruleId);
    return removed;
  }
  const rule = findRule(data, ruleId);
  if (rule) {
    rule.until = addDays(fromDate, -1);
    rule.excludedDates = rule.excludedDates.filter((d) => d < fromDate);
    const rest = groupItems(data, ruleId);
    if (rest.length > 0 && rule.until < rule.startDate) {
      rule.startDate = rest.reduce((m, s) => (s.date < m ? s.date : m), rest[0].date);
    }
  }
  removeRuleIfEmpty(data, ruleId);
  return removed;
}

export function deleteByScope(data, id, scope) {
  const base = findSchedule(data, id);
  if (!base) {
    return 0;
  }
  if (!base.groupId || scope === "single") {
    data.schedules = data.schedules.filter((s) => s.id !== id);
    if (base.groupId) {
      const rule = findRule(data, base.groupId);
      if (rule) {
        addExcluded(rule, base.date);
      }
      removeRuleIfEmpty(data, base.groupId);
    }
    return 1;
  }
  return deleteRuleFrom(data, base.groupId, scope === "future" ? base.date : null);
}

// values: { title, category, memo, date, start, end }
export function editByScope(data, id, values, scope) {
  const base = findSchedule(data, id);
  if (!base) return { error: "予定が見つかりません。" };
  const error = validateContent(values);
  if (error) return { error };
  const content = pickContent(values);

  if (!base.groupId || scope === "single") {
    if (!isDateStr(values.date)) return { error: "日付を入力してください。" };
    // 繰り返しの1件の日付を変えた場合は、繰り返しから切り離す
    if (base.groupId && values.date !== base.date) {
      const groupId = base.groupId;
      const rule = findRule(data, groupId);
      if (rule) {
        addExcluded(rule, base.date);
      }
      base.groupId = null;
      removeRuleIfEmpty(data, groupId);
    }
    Object.assign(base, content, { date: values.date });
    return { count: 1 };
  }

  const rule = findRule(data, base.groupId);
  const items = groupItems(data, base.groupId);
  const earliest = items.reduce((m, s) => (s.date < m ? s.date : m), base.date);

  if (scope === "all" || base.date === earliest || !rule) {
    const targets = scope === "all" || base.date === earliest ? items : items.filter((s) => s.date >= base.date);
    targets.forEach((s) => Object.assign(s, content));
    if (rule && targets.length === items.length) {
      Object.assign(rule, content);
    }
    return { count: targets.length };
  }

  // この日以降：繰り返し設定をこの日で2つに分ける
  const targets = items.filter((s) => s.date >= base.date);
  const lastDate = targets.reduce((m, s) => (s.date > m ? s.date : m), base.date);
  const next = {
    ...rule,
    ...content,
    id: newId(data),
    startDate: base.date,
    until: rule.until > lastDate ? rule.until : lastDate,
    weekdays: [...rule.weekdays],
    excludedDates: rule.excludedDates.filter((d) => d >= base.date),
  };
  rule.until = addDays(base.date, -1);
  rule.excludedDates = rule.excludedDates.filter((d) => d < base.date);
  if (rule.until < rule.startDate) {
    rule.startDate = earliest;
  }
  data.recurrences.push(next);
  targets.forEach((s) => Object.assign(s, content, { groupId: next.id }));
  return { count: targets.length };
}

// 繰り返し設定（期間・曜日・内容）を変更し、予定を作り直す
// keepPast: today より前の予定は追加・変更・削除しない
// restoreExcluded: 個別に削除・移動した日も繰り返しに戻す
export function applyRuleChange(data, ruleId, input, { keepPast = true, today, restoreExcluded = false } = {}) {
  const rule = findRule(data, ruleId);
  if (!rule) return { error: "繰り返し設定が見つかりません。" };
  const weekdays = sortedWeekdays(input.weekdays || []);
  const error = validateContent(input) || validateRange(input.startDate, input.until, weekdays);
  if (error) return { error };

  const content = pickContent(input);
  const excludedDates = restoreExcluded
    ? []
    : rule.excludedDates.filter((d) => d >= input.startDate && d <= input.until);
  const draft = { ...rule, ...content, startDate: input.startDate, until: input.until, weekdays, excludedDates };

  const isLocked = (d) => keepPast && d < today;
  const targetDates = ruleDates(draft);
  const editableDates = targetDates.filter((d) => !isLocked(d));
  const items = groupItems(data, ruleId);
  const lockedItems = items.filter((s) => isLocked(s.date));
  if (editableDates.length === 0 && lockedItems.length === 0) {
    return { error: "指定の条件に該当する日がありません。" };
  }

  Object.assign(rule, draft);
  const targetSet = new Set(targetDates);
  const covered = new Set();
  const removeIds = new Set();
  let updated = 0;
  let added = 0;

  for (const s of items) {
    if (isLocked(s.date)) {
      covered.add(s.date);
      continue;
    }
    if (targetSet.has(s.date) && !covered.has(s.date)) {
      Object.assign(s, content);
      covered.add(s.date);
      updated += 1;
    } else {
      removeIds.add(s.id);
    }
  }
  if (removeIds.size > 0) {
    data.schedules = data.schedules.filter((s) => !removeIds.has(s.id));
  }
  for (const d of editableDates) {
    if (!covered.has(d)) {
      data.schedules.push(newOccurrence(data, d, content, ruleId));
      added += 1;
    }
  }
  removeRuleIfEmpty(data, ruleId);
  return { added, removed: removeIds.size, updated };
}