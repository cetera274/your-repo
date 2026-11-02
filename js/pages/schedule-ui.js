// File: js/pages/schedule-ui.js
import { formatDate, formatShort, isDateStr, normalizeTime, todayStr } from "../core/date.js";
import { weekdaysLabel } from "../core/habits.js";
import {
  applyRuleChange,
  deleteByScope,
  deleteRuleFrom,
  editByScope,
  findRule,
  findSchedule,
  groupCounts,
  groupItems,
} from "../core/schedules.js";
import { setScheduleDone } from "../actions.js";
import { getData, save } from "../store.js";
import {
  categoryOptions,
  choose,
  escapeHtml,
  openFormDialog,
  rerender,
  toast,
  weekdayCheckboxes,
} from "../ui.js";

export function ruleSummary(rule) {
  return `${weekdaysLabel(rule.weekdays)}　${rule.start}〜${rule.end}　${formatDate(rule.startDate)}〜${formatDate(rule.until)}`;
}

export function scheduleItemHtml(s) {
  const data = getData();
  const habit = s.habitId ? data.habits.find((h) => h.id === s.habitId) : null;
  const text = `${s.start}〜${s.end}　${s.title}（${s.category}）`;
  const name = escapeHtml(`「${s.title}」（${s.start}）`);
  return `
    <li class="schedule-item ${s.done ? "done" : ""}">
      <label class="inline">
        <input type="checkbox" data-schedule="${s.id}" ${s.done ? "checked" : ""}>
        <span class="item-text">${escapeHtml(text)}</span>
        ${s.groupId ? `<span class="badge">繰り返し</span>` : ""}
        ${habit ? `<span class="badge">習慣</span>` : ""}
      </label>
      <div class="item-actions">
        <button type="button" class="btn-small" data-edit-schedule="${s.id}" aria-label="${name}を編集">編集</button>
        ${
          s.groupId
            ? `<button type="button" class="btn-small" data-edit-rule="${s.id}" aria-label="${name}の繰り返し設定を変更">繰り返し設定</button>`
            : ""
        }
        <button type="button" class="btn-danger btn-small" data-delete-schedule="${s.id}" aria-label="${name}を削除">削除</button>
      </div>
      ${s.memo ? `<p class="memo">${escapeHtml(s.memo)}</p>` : ""}
    </li>
  `;
}

export function bindScheduleActions(root) {
  root.querySelectorAll("[data-schedule]").forEach((el) => {
    el.addEventListener("change", () => {
      setScheduleDone(Number(el.dataset.schedule), el.checked);
      rerender();
    });
  });
  root.querySelectorAll("[data-edit-schedule]").forEach((el) => {
    el.addEventListener("click", () => openScheduleEditor(Number(el.dataset.editSchedule)));
  });
  root.querySelectorAll("[data-edit-rule]").forEach((el) => {
    el.addEventListener("click", () => {
      const s = findSchedule(getData(), Number(el.dataset.editRule));
      if (s && s.groupId) {
        openRuleEditor(s.groupId);
      }
    });
  });
  root.querySelectorAll("[data-delete-schedule]").forEach((el) => {
    el.addEventListener("click", () => requestDeleteSchedule(Number(el.dataset.deleteSchedule)));
  });
}

export async function requestDeleteSchedule(id) {
  const s = findSchedule(getData(), id);
  if (!s) {
    return;
  }
  const counts = groupCounts(getData(), s);
  let scope;
  if (counts.all > 1) {
    scope = await choose(
      `「${s.title}」は繰り返し登録された予定です（全 ${counts.all} 件）。\n削除する範囲を選んでください。`,
      [
        { label: "この予定のみ", value: "single" },
        { label: `この日以降（${counts.future} 件）`, value: "future" },
        { label: `すべて（${counts.all} 件）`, value: "all", className: "btn-danger" },
      ]
    );
  } else {
    scope = await choose(`「${s.title}」を削除しますか？`, [
      { label: "削除", value: "single", className: "btn-danger" },
    ]);
  }
  if (!scope) {
    return;
  }
  const n = deleteByScope(getData(), id, scope);
  save();
  rerender();
  toast(`${n} 件の予定を削除しました。`);
}

export function openScheduleEditor(id) {
  const s = findSchedule(getData(), id);
  if (!s) {
    return;
  }
  const counts = groupCounts(getData(), s);
  const isGroup = counts.all > 1;

  const body = `
    <div class="form-row">
      <label>予定名
        <input type="text" name="title" id="sch-edit-title" maxlength="100" value="${escapeHtml(s.title)}" required>
      </label>
      <label>カテゴリ
        <select name="category" id="sch-edit-category">${categoryOptions(s.category)}</select>
      </label>
    </div>
    <div class="form-row">
      <label>日付
        <input type="date" name="date" id="sch-edit-date" value="${s.date}">
      </label>
      <label>開始時刻
        <input type="time" name="start" id="sch-edit-start" value="${s.start}" step="300">
      </label>
      <label>終了時刻
        <input type="time" name="end" id="sch-edit-end" value="${s.end}" step="300">
      </label>
    </div>
    <label>メモ（任意）
      <input type="text" name="memo" id="sch-edit-memo" maxlength="200" value="${escapeHtml(s.memo)}">
    </label>
    ${
      isGroup
        ? `
      <fieldset>
        <legend>変更する範囲（繰り返し 全 ${counts.all} 件）</legend>
        <label class="inline"><input type="radio" name="scope" value="single" checked> この予定のみ</label>
        <label class="inline"><input type="radio" name="scope" value="future"> この日以降（${counts.future} 件）</label>
        <label class="inline"><input type="radio" name="scope" value="all"> すべて（${counts.all} 件）</label>
        <p class="note">
          「この予定のみ」で日付を変えると、この予定は繰り返しから外れます。
          「この日以降」を選ぶと、繰り返し設定がこの日を境に分かれます。
          曜日や期間を変えたい場合は「繰り返し設定」を使ってください。
        </p>
      </fieldset>
    `
        : ""
    }
  `;

  openFormDialog(
    "予定を編集",
    body,
    (fd) => {
      const values = {
        title: String(fd.get("title") || ""),
        category: String(fd.get("category") || ""),
        date: String(fd.get("date") || s.date),
        start: normalizeTime(fd.get("start")),
        end: normalizeTime(fd.get("end")),
        memo: String(fd.get("memo") || ""),
      };
      if (!isDateStr(values.date)) {
        values.date = s.date;
      }
      const r = editByScope(getData(), id, values, String(fd.get("scope") || "single"));
      if (r.error) {
        return r.error;
      }
      save();
      rerender();
      toast(`${r.count} 件の予定を更新しました。`);
      return null;
    },
    (root) => {
      const dateInput = root.querySelector('[name="date"]');
      root.querySelectorAll('[name="scope"]').forEach((el) => {
        el.addEventListener("change", () => {
          const checked = root.querySelector('[name="scope"]:checked');
          dateInput.disabled = Boolean(checked) && checked.value !== "single";
        });
      });
    }
  );
}

export function openRuleEditor(ruleId) {
  const data = getData();
  const rule = findRule(data, ruleId);
  if (!rule) {
    return;
  }
  const count = groupItems(data, ruleId).length;
  const today = todayStr();

  const body = `
    <p class="note">現在の設定：${escapeHtml(ruleSummary(rule))}（${count} 件）</p>
    <div class="form-row">
      <label>予定名
        <input type="text" name="title" id="rule-title" maxlength="100" value="${escapeHtml(rule.title)}" required>
      </label>
      <label>カテゴリ
        <select name="category" id="rule-category">${categoryOptions(rule.category)}</select>
      </label>
    </div>
    <div class="form-row">
      <label>開始時刻
        <input type="time" name="start" id="rule-start" value="${rule.start}" step="300">
      </label>
      <label>終了時刻
        <input type="time" name="end" id="rule-end" value="${rule.end}" step="300">
      </label>
    </div>
    <label>メモ（任意）
      <input type="text" name="memo" id="rule-memo" maxlength="200" value="${escapeHtml(rule.memo)}">
    </label>
    <div class="form-row">
      <label>開始日
        <input type="date" name="startDate" id="rule-start-date" value="${rule.startDate}">
      </label>
      <label>終了日
        <input type="date" name="until" id="rule-until" value="${rule.until}">
      </label>
    </div>
    <fieldset>
      <legend>繰り返す曜日</legend>
      <div class="weekday-select">${weekdayCheckboxes("weekday", rule.weekdays, "rule-wd")}</div>
    </fieldset>
    <label class="inline">
      <input type="checkbox" name="keepPast" id="rule-keep-past" checked>
      今日（${formatShort(today)}）より前の予定は変更しない
    </label>
    ${
      rule.excludedDates.length > 0
        ? `
      <label class="inline">
        <input type="checkbox" name="restoreExcluded" id="rule-restore">
        個別に削除・移動した日（${rule.excludedDates.length} 件）も繰り返しに戻す
      </label>
    `
        : ""
    }
    <p class="note">
      変更後の条件に合わない日の予定は削除され、新しく条件に合う日の予定が追加されます。
      残る予定には新しい内容が反映され、完了状態は保持されます。
    </p>
  `;

  openFormDialog("繰り返し設定を変更", body, (fd) => {
    const input = {
      title: String(fd.get("title") || ""),
      category: String(fd.get("category") || ""),
      memo: String(fd.get("memo") || ""),
      start: normalizeTime(fd.get("start")),
      end: normalizeTime(fd.get("end")),
      startDate: String(fd.get("startDate") || ""),
      until: String(fd.get("until") || ""),
      weekdays: fd.getAll("weekday").map(Number),
    };
    const r = applyRuleChange(getData(), ruleId, input, {
      keepPast: fd.get("keepPast") === "on",
      today,
      restoreExcluded: fd.get("restoreExcluded") === "on",
    });
    if (r.error) {
      return r.error;
    }
    save();
    rerender();
    toast(`繰り返し設定を変更しました（追加 ${r.added} 件、削除 ${r.removed} 件、更新 ${r.updated} 件）。`);
    return null;
  });
}

export async function requestDeleteRule(ruleId) {
  const data = getData();
  const rule = findRule(data, ruleId);
  if (!rule) {
    return;
  }
  const items = groupItems(data, ruleId);
  const today = todayStr();
  const future = items.filter((s) => s.date >= today).length;
  const scope = await choose(
    `繰り返し予定「${rule.title}」を削除します（全 ${items.length} 件）。\n削除する範囲を選んでください。`,
    [
      { label: `今日以降（${future} 件）`, value: "future" },
      { label: `すべて（${items.length} 件）`, value: "all", className: "btn-danger" },
    ]
  );
  if (!scope) {
    return;
  }
  const n = deleteRuleFrom(getData(), ruleId, scope === "future" ? today : null);
  save();
  rerender();
  toast(`${n} 件の予定を削除しました。`);
}