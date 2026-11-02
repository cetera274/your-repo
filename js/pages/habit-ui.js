// File: js/pages/habit-ui.js
import { CATEGORIES, MAX_DURATION } from "../core/data.js";
import { ALL_WEEKDAYS, isTimeStr, normalizeTime } from "../core/date.js";
import { WINDOW_KEYS, WINDOW_LABELS } from "../core/habits.js";
import { getData, save } from "../store.js";
import { categoryOptions, escapeHtml, openFormDialog, rerender, toast, weekdayCheckboxes } from "../ui.js";

const PRESETS = {
  all: ALL_WEEKDAYS,
  weekday: [0, 1, 2, 3, 4],
  weekend: [5, 6],
};

export function habitFieldsHtml(h, prefix) {
  const v = h || {
    name: "",
    category: CATEGORIES[0],
    targetTime: "",
    weekdays: ALL_WEEKDAYS,
    duration: 0,
    window: "any",
  };
  const useTime = Boolean(v.targetTime);
  return `
    <div class="form-row">
      <label>習慣名（例：7時に起きる、ストレッチ、読書）
        <input type="text" name="name" id="${prefix}-name" maxlength="100" value="${escapeHtml(v.name)}" required>
      </label>
      <label>カテゴリ
        <select name="category" id="${prefix}-category">${categoryOptions(v.category)}</select>
      </label>
    </div>
    <div class="form-row">
      <label class="inline">
        <input type="checkbox" name="useTime" id="${prefix}-use-time" ${useTime ? "checked" : ""}>
        目標時刻を設定する
      </label>
      <label>目標時刻
        <input type="time" name="targetTime" id="${prefix}-target-time" value="${escapeHtml(v.targetTime || "07:00")}" step="300" ${useTime ? "" : "disabled"}>
      </label>
    </div>
    <div class="form-row">
      <label>所要時間（分、0〜${MAX_DURATION}）
        <input type="number" name="duration" id="${prefix}-duration" min="0" max="${MAX_DURATION}" step="5" value="${v.duration}" aria-describedby="${prefix}-duration-note">
      </label>
      <label>おすすめする時間帯（目標時刻がない場合）
        <select name="window" id="${prefix}-window">
          ${WINDOW_KEYS.map(
            (k) => `<option value="${k}" ${k === v.window ? "selected" : ""}>${WINDOW_LABELS[k]}</option>`
          ).join("")}
        </select>
      </label>
    </div>
    <p class="note" id="${prefix}-duration-note">
      所要時間を1分以上にすると、プランナーが予定の空き時間からおすすめの時間を計算します。
      目標時刻がある場合は、その時刻から所要時間の分だけ時間を確保します。0の場合は時間を確保しません。
    </p>
    <fieldset>
      <legend>実施する曜日</legend>
      <div class="toolbar">
        <button type="button" class="btn-small" data-preset="all">毎日</button>
        <button type="button" class="btn-small" data-preset="weekday">平日</button>
        <button type="button" class="btn-small" data-preset="weekend">週末</button>
      </div>
      <div class="weekday-select">${weekdayCheckboxes("weekday", v.weekdays, `${prefix}-wd`)}</div>
    </fieldset>
  `;
}

export function setupHabitFields(root) {
  const useTime = root.querySelector('[name="useTime"]');
  const targetTime = root.querySelector('[name="targetTime"]');
  useTime.addEventListener("change", () => {
    targetTime.disabled = !useTime.checked;
  });
  root.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const set = PRESETS[btn.dataset.preset];
      root.querySelectorAll('[name="weekday"]').forEach((cb) => {
        cb.checked = set.includes(Number(cb.value));
      });
    });
  });
}

export function readHabitFields(fd) {
  const name = String(fd.get("name") || "").trim();
  const category = String(fd.get("category") || CATEGORIES[0]);
  const useTime = fd.get("useTime") === "on";
  const targetTime = useTime ? normalizeTime(fd.get("targetTime")) : "";
  const durationRaw = String(fd.get("duration") ?? "").trim();
  const duration = durationRaw === "" ? 0 : Number(durationRaw);
  const windowKey = String(fd.get("window") || "any");
  const weekdays = fd
    .getAll("weekday")
    .map(Number)
    .sort((a, b) => a - b);

  if (!name) return { error: "習慣名を入力してください。" };
  if (useTime && !isTimeStr(targetTime)) return { error: "目標時刻を入力してください。" };
  if (!Number.isInteger(duration) || duration < 0 || duration > MAX_DURATION) {
    return { error: `所要時間は0〜${MAX_DURATION}の整数で入力してください。` };
  }
  if (weekdays.length === 0) return { error: "実施する曜日を1つ以上選択してください。" };

  return {
    values: {
      name,
      category,
      targetTime,
      weekdays,
      duration,
      window: WINDOW_KEYS.includes(windowKey) ? windowKey : "any",
    },
  };
}

export function openHabitEditor(id) {
  const h = getData().habits.find((x) => x.id === id);
  if (!h) {
    return;
  }
  openFormDialog(
    "習慣を編集",
    habitFieldsHtml(h, "habit-edit"),
    (fd) => {
      const r = readHabitFields(fd);
      if (r.error) {
        return r.error;
      }
      Object.assign(h, r.values);
      save();
      rerender();
      toast("習慣を更新しました。");
      return null;
    },
    setupHabitFields
  );
}