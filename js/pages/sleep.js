// File: js/pages/sleep.js
import { addDays, formatDate, formatDuration, isDateStr, isTimeStr, normalizeTime, todayStr } from "../core/date.js";
import { sleepHours, sleepMinutes } from "../core/sleep.js";
import { state } from "../state.js";
import { getData, save } from "../store.js";
import { $, choose, escapeHtml, rerender, toast } from "../ui.js";

const RECENT_LIMIT = 30;

function qualityOptions(selected) {
  const labels = { 1: "1（悪い）", 2: "2", 3: "3（普通）", 4: "4", 5: "5（良い）" };
  return [1, 2, 3, 4, 5]
    .map((q) => `<option value="${q}" ${q === selected ? "selected" : ""}>${labels[q]}</option>`)
    .join("");
}

function previewText(bed, wake) {
  if (!isTimeStr(bed) || !isTimeStr(wake)) {
    return "就寝時刻と起床時刻を入力すると、睡眠時間を計算します。";
  }
  return `睡眠時間：${formatDuration(sleepMinutes(bed, wake))}`;
}

export function renderSleep(app) {
  const data = getData();
  const d = state.sleepDate;
  const rec = data.sleepLogs[d];
  const bed = rec ? rec.bedtime : "23:00";
  const wake = rec ? rec.wakeTime : data.settings.planner.wakeTime;
  const recent = Object.keys(data.sleepLogs).sort().reverse().slice(0, RECENT_LIMIT);

  app.innerHTML = `
    <h2>睡眠記録</h2>

    <section class="card" aria-labelledby="sleep-form-title">
      <h3 id="sleep-form-title">${rec ? "記録を編集" : "記録を追加"}（${formatDate(d)}）</h3>
      <div class="toolbar">
        <button type="button" id="btn-sleep-prev">前日</button>
        <button type="button" id="btn-sleep-today">今日</button>
        <button type="button" id="btn-sleep-next">翌日</button>
      </div>
      <form id="sleep-form" novalidate>
        <div class="form-row">
          <label>日付（起床した日）
            <input type="date" name="date" id="sleep-date" value="${d}">
          </label>
          <label>就寝時刻
            <input type="time" name="bedtime" id="sleep-bed" value="${bed}" step="300">
          </label>
          <label>起床時刻
            <input type="time" name="wakeTime" id="sleep-wake" value="${wake}" step="300">
          </label>
          <label>睡眠の質
            <select name="quality" id="sleep-quality">${qualityOptions(rec ? rec.quality : 3)}</select>
          </label>
        </div>
        <label>メモ（任意）
          <input type="text" name="memo" id="sleep-memo" maxlength="200" value="${escapeHtml(rec ? rec.memo : "")}">
        </label>
        <p class="note" id="sleep-preview" aria-live="polite">${previewText(bed, wake)}</p>
        <p class="dialog-error" id="sleep-error" role="alert"></p>
        <div class="toolbar">
          <button type="submit" class="btn-primary">保存</button>
          ${rec ? `<button type="button" class="btn-danger" id="btn-sleep-delete">この日の記録を削除</button>` : ""}
        </div>
      </form>
      <p class="note">記録は起床した日の日付で保存します（例：1日の23時に寝て2日の7時に起きた場合は2日の記録）。目標睡眠時間は「プランナー」の設定で変更できます。</p>
    </section>

    <section class="card" aria-labelledby="sleep-list-title">
      <h3 id="sleep-list-title">最近の記録（最大${RECENT_LIMIT}件）</h3>
      ${
        recent.length === 0
          ? `<p class="info">まだ記録がありません。</p>`
          : `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">日付</th>
                <th scope="col">就寝</th>
                <th scope="col">起床</th>
                <th scope="col">睡眠時間</th>
                <th scope="col">質</th>
                <th scope="col">メモ</th>
                <th scope="col"><span class="sr-only">操作</span></th>
              </tr>
            </thead>
            <tbody>
              ${recent
                .map((k) => {
                  const r = data.sleepLogs[k];
                  return `
                    <tr>
                      <td><button type="button" class="btn-small" data-date="${k}" aria-label="${formatDate(k)}の記録を編集">${formatDate(k)}</button></td>
                      <td>${escapeHtml(r.bedtime)}</td>
                      <td>${escapeHtml(r.wakeTime)}</td>
                      <td>${sleepHours(r.bedtime, r.wakeTime).toFixed(1)} 時間</td>
                      <td>${escapeHtml(r.quality)}</td>
                      <td>${escapeHtml(r.memo)}</td>
                      <td><button type="button" class="btn-danger btn-small" data-delete-sleep="${k}" aria-label="${formatDate(k)}の記録を削除">削除</button></td>
                    </tr>
                  `;
                })
                .join("")}
            </tbody>
          </table>
        </div>
      `
      }
    </section>
  `;

  const setDate = (date) => {
    state.sleepDate = date;
    rerender();
  };
  $("btn-sleep-prev").addEventListener("click", () => setDate(addDays(state.sleepDate, -1)));
  $("btn-sleep-today").addEventListener("click", () => setDate(todayStr()));
  $("btn-sleep-next").addEventListener("click", () => setDate(addDays(state.sleepDate, 1)));
  $("sleep-date").addEventListener("change", (e) => {
    if (isDateStr(e.target.value)) {
      setDate(e.target.value);
    }
  });

  const updatePreview = () => {
    $("sleep-preview").textContent = previewText(
      normalizeTime($("sleep-bed").value),
      normalizeTime($("sleep-wake").value)
    );
  };
  $("sleep-bed").addEventListener("input", updatePreview);
  $("sleep-wake").addEventListener("input", updatePreview);

  $("sleep-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const date = String(fd.get("date") || "");
    const bedtime = normalizeTime(fd.get("bedtime"));
    const wakeTime = normalizeTime(fd.get("wakeTime"));
    const quality = Number(fd.get("quality"));
    let error = null;
    if (!isDateStr(date)) error = "日付を入力してください。";
    else if (!isTimeStr(bedtime) || !isTimeStr(wakeTime)) error = "就寝時刻と起床時刻を入力してください。";
    else if (!Number.isInteger(quality) || quality < 1 || quality > 5) error = "睡眠の質を選択してください。";
    if (error) {
      $("sleep-error").textContent = error;
      return;
    }
    getData().sleepLogs[date] = {
      bedtime,
      wakeTime,
      quality,
      memo: String(fd.get("memo") || "").trim(),
    };
    state.sleepDate = date;
    save();
    rerender();
    toast(`${formatDate(date)}の睡眠記録を保存しました。`);
  });

  const deleteRecord = async (date) => {
    const ok = await choose(`${formatDate(date)}の睡眠記録を削除しますか？`, [
      { label: "削除", value: "ok", className: "btn-danger" },
    ]);
    if (!ok) {
      return;
    }
    delete getData().sleepLogs[date];
    save();
    rerender();
    toast("睡眠記録を削除しました。");
  };

  const delBtn = $("btn-sleep-delete");
  if (delBtn) {
    delBtn.addEventListener("click", () => deleteRecord(d));
  }
  app.querySelectorAll("[data-date]").forEach((el) => {
    el.addEventListener("click", () => {
      setDate(el.dataset.date);
      $("sleep-bed").focus();
    });
  });
  app.querySelectorAll("[data-delete-sleep]").forEach((el) => {
    el.addEventListener("click", () => deleteRecord(el.dataset.deleteSleep));
  });
}