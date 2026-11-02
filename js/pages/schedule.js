// File: js/pages/schedule.js
import { addDays, formatDate, formatShort, todayStr, weekdayIndex, normalizeTime } from "../core/date.js";
import { createSchedules, groupItems, schedulesBetween } from "../core/schedules.js";
import { state } from "../state.js";
import { getData, save } from "../store.js";
import { $, categoryOptions, escapeHtml, rerender, toast, weekdayCheckboxes } from "../ui.js";
import {
  bindScheduleActions,
  openRuleEditor,
  requestDeleteRule,
  ruleSummary,
  scheduleItemHtml,
} from "./schedule-ui.js";

function weekHtml(data) {
  const start = state.weekStart;
  const end = addDays(start, 6);
  const list = schedulesBetween(data, start, end);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(start, i);
    const items = list.filter((s) => s.date === date);
    days.push(`
      <h4>${formatDate(date)}</h4>
      ${
        items.length > 0
          ? `<ul class="schedule-list">${items.map(scheduleItemHtml).join("")}</ul>`
          : `<p class="note">予定はありません。</p>`
      }
    `);
  }
  return days.join("");
}

function rulesHtml(data) {
  if (data.recurrences.length === 0) {
    return `<p class="note">繰り返し予定はありません。</p>`;
  }
  const rules = [...data.recurrences].sort(
    (a, b) => a.startDate.localeCompare(b.startDate) || a.id - b.id
  );
  return `
    <ul class="schedule-list">
      ${rules
        .map((r) => {
          const count = groupItems(data, r.id).length;
          const excluded = r.excludedDates.length > 0 ? `（除外 ${r.excludedDates.length} 日）` : "";
          const name = escapeHtml(`繰り返し予定「${r.title}」`);
          return `
            <li class="schedule-item">
              <div>
                <span class="item-text">${escapeHtml(r.title)}（${escapeHtml(r.category)}）</span>
                <p class="note">${escapeHtml(ruleSummary(r))}　${count} 件${excluded}</p>
              </div>
              <div class="item-actions">
                <button type="button" class="btn-small" data-rule-edit="${r.id}" aria-label="${name}の繰り返し設定を変更">繰り返し設定</button>
                <button type="button" class="btn-danger btn-small" data-rule-delete="${r.id}" aria-label="${name}を削除">削除</button>
              </div>
            </li>
          `;
        })
        .join("")}
    </ul>
  `;
}

export function renderSchedule(app) {
  const data = getData();
  const defaultDate = state.todayDate;
  const defaultUntil = addDays(defaultDate, 27);

  app.innerHTML = `
    <h2>予定管理</h2>

    <section class="card" aria-labelledby="sch-add-title">
      <h3 id="sch-add-title">予定を登録</h3>
      <form id="sch-add-form" novalidate>
        <div class="form-row">
          <label>予定名
            <input type="text" name="title" id="sch-title" maxlength="100" required>
          </label>
          <label>カテゴリ
            <select name="category" id="sch-category">${categoryOptions("")}</select>
          </label>
        </div>
        <div class="form-row">
          <label>日付（繰り返しの場合は開始日）
            <input type="date" name="date" id="sch-date" value="${defaultDate}">
          </label>
          <label>開始時刻
            <input type="time" name="start" id="sch-start" value="09:00" step="300">
          </label>
          <label>終了時刻
            <input type="time" name="end" id="sch-end" value="10:00" step="300">
          </label>
        </div>
        <label>メモ（任意）
          <input type="text" name="memo" id="sch-memo" maxlength="200">
        </label>
        <label class="inline">
          <input type="checkbox" name="repeat" id="sch-repeat">
          繰り返し登録する
        </label>
        <fieldset id="sch-repeat-box" disabled>
          <legend>繰り返しの条件</legend>
          <label>繰り返し終了日（1年以内）
            <input type="date" name="until" id="sch-until" value="${defaultUntil}">
          </label>
          <div class="weekday-select">${weekdayCheckboxes("weekday", [weekdayIndex(defaultDate)], "sch-wd")}</div>
        </fieldset>
        <p class="dialog-error" id="sch-error" role="alert"></p>
        <button type="submit" class="btn-primary">登録</button>
      </form>
    </section>

    <section class="card" aria-labelledby="sch-week-title">
      <h3 id="sch-week-title">1週間の予定（${formatShort(state.weekStart)}〜${formatShort(addDays(state.weekStart, 6))}）</h3>
      <div class="toolbar">
        <button type="button" id="btn-week-prev">前の週</button>
        <button type="button" id="btn-week-this">今日から</button>
        <button type="button" id="btn-week-next">次の週</button>
      </div>
      ${weekHtml(data)}
    </section>

    <section class="card" id="rule-list" aria-labelledby="sch-rule-title">
      <h3 id="sch-rule-title">繰り返し予定の一覧</h3>
      ${rulesHtml(data)}
    </section>
  `;

  const form = $("sch-add-form");
  const repeat = $("sch-repeat");
  const repeatBox = $("sch-repeat-box");
  const dateInput = $("sch-date");

  repeat.addEventListener("change", () => {
    repeatBox.disabled = !repeat.checked;
  });
  dateInput.addEventListener("change", () => {
    if (!dateInput.value || repeat.checked) {
      return;
    }
    const wd = weekdayIndex(dateInput.value);
    form.querySelectorAll('[name="weekday"]').forEach((cb) => {
      cb.checked = Number(cb.value) === wd;
    });
    $("sch-until").value = addDays(dateInput.value, 27);
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const input = {
      title: String(fd.get("title") || ""),
      category: String(fd.get("category") || ""),
      memo: String(fd.get("memo") || ""),
      date: String(fd.get("date") || ""),
      start: normalizeTime(fd.get("start")),
      end: normalizeTime(fd.get("end")),
      repeat:
        fd.get("repeat") === "on"
          ? { until: String(fd.get("until") || ""), weekdays: fd.getAll("weekday").map(Number) }
          : null,
    };
    const r = createSchedules(getData(), input);
    if (r.error) {
      $("sch-error").textContent = r.error;
      toast(r.error, "error");
      return;
    }
    save();
    rerender();
    toast(`${r.count} 件の予定を登録しました。`);
  });

  $("btn-week-prev").addEventListener("click", () => {
    state.weekStart = addDays(state.weekStart, -7);
    rerender();
  });
  $("btn-week-this").addEventListener("click", () => {
    state.weekStart = todayStr();
    rerender();
  });
  $("btn-week-next").addEventListener("click", () => {
    state.weekStart = addDays(state.weekStart, 7);
    rerender();
  });

  app.querySelectorAll("[data-rule-edit]").forEach((el) => {
    el.addEventListener("click", () => openRuleEditor(Number(el.dataset.ruleEdit)));
  });
  app.querySelectorAll("[data-rule-delete]").forEach((el) => {
    el.addEventListener("click", () => requestDeleteRule(Number(el.dataset.ruleDelete)));
  });

  bindScheduleActions(app);
}