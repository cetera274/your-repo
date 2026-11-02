// File: js/pages/habits.js
import { newId } from "../core/data.js";
import { formatDuration, todayStr } from "../core/date.js";
import {
  WINDOW_LABELS,
  calcStreak,
  deleteHabitIn,
  habitDoneDates,
  habitLabel,
  moveHabit,
  nextHabitOrder,
  sortHabitsByTime,
  sortedHabits,
  weekdaysLabel,
} from "../core/habits.js";
import { getData, save } from "../store.js";
import { $, announce, choose, escapeHtml, rerender, toast } from "../ui.js";
import { habitFieldsHtml, openHabitEditor, readHabitFields, setupHabitFields } from "./habit-ui.js";

function detailText(h, streak) {
  const parts = [weekdaysLabel(h.weekdays)];
  if (h.duration > 0) {
    parts.push(`所要${formatDuration(h.duration)}`);
    if (!h.targetTime) {
      parts.push(WINDOW_LABELS[h.window]);
    }
  } else {
    parts.push("所要時間なし");
  }
  parts.push(`連続 ${streak}日`);
  return parts.join("・");
}

function habitRowHtml(h, index, total, today) {
  const data = getData();
  const name = escapeHtml(`「${h.name}」`);
  return `
    <li class="habit-row">
      <div class="habit-name ${h.active ? "" : "inactive"}">
        ${escapeHtml(habitLabel(h))}
        <span class="habit-days">${escapeHtml(detailText(h, calcStreak(data, h, today)))}</span>
      </div>
      <label class="inline">
        <input type="checkbox" data-active="${h.id}" ${h.active ? "checked" : ""}>
        有効
      </label>
      <div class="move-buttons">
        <button type="button" class="btn-small" data-move="up:${h.id}" aria-label="${name}を上へ移動" ${index === 0 ? "disabled" : ""}>↑</button>
        <button type="button" class="btn-small" data-move="down:${h.id}" aria-label="${name}を下へ移動" ${index === total - 1 ? "disabled" : ""}>↓</button>
      </div>
      <div class="item-actions">
        <button type="button" class="btn-small" data-edit-habit="${h.id}" aria-label="${name}を編集">編集</button>
        <button type="button" class="btn-danger btn-small" data-delete-habit="${h.id}" aria-label="${name}を削除">削除</button>
      </div>
    </li>
  `;
}

export function renderHabits(app) {
  const data = getData();
  const today = todayStr();
  const habits = sortedHabits(data);

  app.innerHTML = `
    <h2>習慣設定</h2>

    <section class="card" aria-labelledby="habit-add-title">
      <h3 id="habit-add-title">習慣を追加</h3>
      <form id="habit-add-form" novalidate>
        ${habitFieldsHtml(null, "habit-new")}
        <p class="dialog-error" id="habit-add-error" role="alert"></p>
        <button type="submit" class="btn-primary">追加</button>
      </form>
    </section>

    <section class="card" aria-labelledby="habit-list-title">
      <h3 id="habit-list-title">登録済みの習慣（${habits.length} 件）</h3>
      ${
        habits.length === 0
          ? `<p class="info">まだ習慣が登録されていません。</p>`
          : `
        <div class="toolbar">
          <button type="button" class="btn-small" id="btn-sort-time">目標時刻順に並べ替え</button>
        </div>
        <ul class="habit-list">
          ${habits.map((h, i) => habitRowHtml(h, i, habits.length, today)).join("")}
        </ul>
        <p class="note">↑↓ボタンで並び順を変更できます。この並び順は「今日」画面の表示順になります。</p>
      `
      }
    </section>
  `;

  const form = $("habit-add-form");
  setupHabitFields(form);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const r = readHabitFields(new FormData(form));
    if (r.error) {
      $("habit-add-error").textContent = r.error;
      toast(r.error, "error");
      return;
    }
    const d = getData();
    d.habits.push({
      id: newId(d),
      ...r.values,
      active: true,
      createdAt: todayStr(),
      order: nextHabitOrder(d),
    });
    save();
    rerender();
    toast(`習慣「${r.values.name}」を追加しました。`);
  });

  const sortBtn = $("btn-sort-time");
  if (sortBtn) {
    sortBtn.addEventListener("click", async () => {
      const ok = await choose("習慣を目標時刻順に並べ替えます（目標時刻のない習慣は最後になります）。", [
        { label: "並べ替える", value: "ok", className: "btn-primary" },
      ]);
      if (!ok) {
        return;
      }
      sortHabitsByTime(getData());
      save();
      rerender();
      toast("目標時刻順に並べ替えました。");
    });
  }

  app.querySelectorAll("[data-active]").forEach((el) => {
    el.addEventListener("change", () => {
      const h = getData().habits.find((x) => x.id === Number(el.dataset.active));
      if (!h) {
        return;
      }
      h.active = el.checked;
      save();
      rerender();
      toast(h.active ? `「${h.name}」を有効にしました。` : `「${h.name}」を無効にしました。`);
    });
  });

  app.querySelectorAll("[data-move]").forEach((el) => {
    el.addEventListener("click", () => {
      const [dir, idText] = el.dataset.move.split(":");
      const id = Number(idText);
      if (!moveHabit(getData(), id, dir === "up" ? -1 : 1)) {
        return;
      }
      save();
      rerender();
      // 端に移動してボタンが無効になった場合は、反対側のボタンにフォーカスを移す
      if (document.activeElement === document.body || !document.activeElement) {
        const other = document.querySelector(`[data-move="${dir === "up" ? "down" : "up"}:${id}"]`);
        if (other) {
          other.focus();
        }
      }
      const list = sortedHabits(getData());
      const pos = list.findIndex((h) => h.id === id) + 1;
      const h = list[pos - 1];
      announce(`「${h.name}」を${list.length}件中${pos}番目に移動しました。`);
    });
  });

  app.querySelectorAll("[data-edit-habit]").forEach((el) => {
    el.addEventListener("click", () => openHabitEditor(Number(el.dataset.editHabit)));
  });

  app.querySelectorAll("[data-delete-habit]").forEach((el) => {
    el.addEventListener("click", async () => {
      const d = getData();
      const id = Number(el.dataset.deleteHabit);
      const h = d.habits.find((x) => x.id === id);
      if (!h) {
        return;
      }
      const logs = habitDoneDates(d, id).length;
      const ok = await choose(
        `習慣「${h.name}」を削除しますか？\n達成記録（${logs} 件）も削除されます。記録を残したい場合は「有効」のチェックを外してください。`,
        [{ label: "削除", value: "ok", className: "btn-danger" }]
      );
      if (!ok) {
        return;
      }
      deleteHabitIn(getData(), id);
      save();
      rerender();
      toast(`習慣「${h.name}」を削除しました。`);
    });
  });
}