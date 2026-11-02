// File: js/pages/settings.js
import { DATA_VERSION, defaultData, normalizeData } from "../core/data.js";
import { formatDateTime, todayStr } from "../core/date.js";
import { countHabitLogs } from "../core/habits.js";
import { habitLogsCsv, schedulesCsv, sleepCsv } from "../core/csv.js";
import { getData, getPrefs, replaceData, resetSyncPrefs, save, savePrefs } from "../store.js";
import {
  SyncError,
  applyRemote,
  clearSyncError,
  fetchRemote,
  pushRemote,
  runSync,
  syncTask,
  updateSyncStatus,
} from "../sync.js";
import {
  notificationStatusText,
  notificationSupported,
  notify,
  requestNotificationPermission,
  startReminders,
} from "../reminders.js";
import { getInstallPrompt, promptInstall, serviceWorkerAvailable } from "../pwa.js";
import { $, applyTheme, choose, downloadFile, escapeHtml, metric, rerender, toast } from "../ui.js";

const THEMES = [
  ["system", "端末の設定に合わせる"],
  ["light", "ライト"],
  ["dark", "ダーク"],
];

function parseGistId(value) {
  const v = String(value || "").trim();
  if (!v) {
    return "";
  }
  return v.replace(/[?#].*$/, "").split("/").filter(Boolean).pop() || "";
}

function pwaHtml() {
  if (getInstallPrompt()) {
    return `
      <p>このアプリを端末にインストールできます。</p>
      <button type="button" class="btn-primary" id="btn-install">インストール</button>
    `;
  }
  if (!serviceWorkerAvailable()) {
    return `<p class="note">この環境ではオフライン動作を利用できません（HTTPSで公開する必要があります）。</p>`;
  }
  return `<p class="note">インストール済みか、このブラウザではメニューからインストールする必要があります（iPhone・iPadの場合はSafariの共有メニューの「ホーム画面に追加」）。</p>`;
}

export function renderSettings(app) {
  const data = getData();
  const prefs = getPrefs();
  const r = prefs.reminder;
  const s = prefs.sync;

  app.innerHTML = `
    <h2>設定</h2>

    <section class="card" aria-labelledby="set-theme">
      <h3 id="set-theme">表示</h3>
      <fieldset class="radio-group">
        <legend class="sr-only">テーマ</legend>
        ${THEMES.map(
          ([v, label]) => `
          <label class="inline">
            <input type="radio" name="theme" id="theme-${v}" value="${v}" ${prefs.theme === v ? "checked" : ""}>
            ${label}
          </label>
        `
        ).join("")}
      </fieldset>
    </section>

    <section class="card" aria-labelledby="set-reminder">
      <h3 id="set-reminder">リマインダー</h3>
      <label class="inline">
        <input type="checkbox" id="rem-enabled" ${r.enabled ? "checked" : ""} ${notificationSupported() ? "" : "disabled"}>
        リマインダーを使う
      </label>
      <div class="form-row">
        <label>予定の何分前に通知するか（0〜120）
          <input type="number" id="rem-minutes" min="0" max="120" step="5" value="${Number(r.scheduleMinutes) || 0}">
        </label>
      </div>
      <label class="inline">
        <input type="checkbox" id="rem-habits" ${r.habits ? "checked" : ""}>
        目標時刻のある習慣も通知する
      </label>
      <p class="note">通知の許可：${escapeHtml(notificationStatusText())}</p>
      <button type="button" id="btn-rem-test" ${notificationSupported() ? "" : "disabled"}>テスト通知を送る</button>
      <p class="note">リマインダーはアプリを開いている間だけ動作します。アプリを閉じている間は通知されません。</p>
    </section>

    <section class="card" aria-labelledby="set-sync">
      <h3 id="set-sync">複数端末での同期（GitHub Gist）</h3>
      <form id="sync-form" novalidate>
        <label>アクセストークン（gist 権限）
          <input type="password" id="sync-token" name="token" autocomplete="off" value="${escapeHtml(s.token)}">
        </label>
        <label>Gist ID（空欄の場合は最初の同期で新しく作成します。GistのURLも入力できます）
          <input type="text" id="sync-gist" name="gistId" autocomplete="off" value="${escapeHtml(s.gistId)}">
        </label>
        <label class="inline">
          <input type="checkbox" id="sync-auto" name="auto" ${s.auto ? "checked" : ""}>
          自動同期（起動時、画面に戻ったとき、データ変更の5秒後）
        </label>
        <p class="dialog-error" id="sync-error" role="alert"></p>
        <button type="submit" class="btn-primary">同期設定を保存</button>
      </form>
      <div class="toolbar">
        <button type="button" id="btn-sync-now">今すぐ同期</button>
        <button type="button" id="btn-sync-push">この端末のデータでクラウドを上書き</button>
        <button type="button" id="btn-sync-pull">クラウドのデータでこの端末を上書き</button>
        <button type="button" class="btn-danger" id="btn-sync-reset">同期設定を削除</button>
      </div>
      <p class="note" id="sync-status" role="status"></p>
      <p class="note">
        トークンはこの端末のブラウザにだけ保存されます。共有の端末では使わないでください。
        2台目以降の端末では、1台目と同じGist IDを入力してから同期してください。
      </p>
    </section>

    <section class="card" aria-labelledby="set-data">
      <h3 id="set-data">データ</h3>
      <div class="metrics">
        ${metric("習慣", `${data.habits.length} 件`)}
        ${metric("習慣の達成記録", `${countHabitLogs(data)} 件`)}
        ${metric("予定", `${data.schedules.length} 件`)}
        ${metric("繰り返し設定", `${data.recurrences.length} 件`)}
        ${metric("睡眠記録", `${Object.keys(data.sleepLogs).length} 件`)}
      </div>
      <p class="note">最終更新：${formatDateTime(data.updatedAt)}　データ形式のバージョン：${DATA_VERSION}</p>

      <h4>バックアップ（JSON）</h4>
      <div class="toolbar">
        <button type="button" id="btn-export-json">JSONでエクスポート</button>
        <label class="inline">JSONをインポート
          <input type="file" id="import-file" accept="application/json,.json">
        </label>
      </div>

      <h4>CSVで出力（表計算ソフト用）</h4>
      <div class="toolbar">
        <button type="button" id="btn-csv-schedules">予定</button>
        <button type="button" id="btn-csv-habits">習慣の記録</button>
        <button type="button" id="btn-csv-sleep">睡眠記録</button>
      </div>

      <h4>初期化</h4>
      <button type="button" class="btn-danger" id="btn-reset">すべてのデータを削除</button>
    </section>

    <section class="card" aria-labelledby="set-pwa">
      <h3 id="set-pwa">アプリのインストール</h3>
      ${pwaHtml()}
    </section>
  `;

  app.querySelectorAll('[name="theme"]').forEach((el) => {
    el.addEventListener("change", () => {
      prefs.theme = el.value;
      savePrefs();
      applyTheme(el.value);
      rerender();
    });
  });

  $("rem-enabled").addEventListener("change", async (e) => {
    const el = e.target;
    if (el.checked) {
      const ok = await requestNotificationPermission();
      if (!ok) {
        el.checked = false;
        toast("通知が許可されていません。ブラウザのサイト設定を確認してください。", "error");
        rerender();
        return;
      }
    }
    prefs.reminder.enabled = el.checked;
    savePrefs();
    startReminders();
    rerender();
    toast(el.checked ? "リマインダーを有効にしました。" : "リマインダーを無効にしました。");
  });

  $("rem-minutes").addEventListener("change", (e) => {
    const n = Number(e.target.value);
    if (!Number.isInteger(n) || n < 0 || n > 120) {
      e.target.value = String(Number(prefs.reminder.scheduleMinutes) || 0);
      toast("0〜120の整数で入力してください。", "error");
      return;
    }
    prefs.reminder.scheduleMinutes = n;
    savePrefs();
    toast("通知のタイミングを保存しました。");
  });

  $("rem-habits").addEventListener("change", (e) => {
    prefs.reminder.habits = e.target.checked;
    savePrefs();
  });

  $("btn-rem-test").addEventListener("click", async () => {
    const ok = await requestNotificationPermission();
    if (!ok) {
      toast("通知が許可されていません。", "error");
      rerender();
      return;
    }
    await notify("生活習慣プランナー", "テスト通知です。", "test");
    rerender();
  });

  $("sync-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const token = String(fd.get("token") || "").trim();
    const gistId = parseGistId(fd.get("gistId"));
    if (gistId && !/^[0-9a-zA-Z]+$/.test(gistId)) {
      $("sync-error").textContent = "Gist IDの形式が正しくありません。";
      return;
    }
    if (gistId !== prefs.sync.gistId) {
      // 別のGistに切り替えた場合、前回の同期時点は使えない
      prefs.sync.lastSyncedAt = "";
    }
    prefs.sync.token = token;
    prefs.sync.gistId = gistId;
    prefs.sync.auto = fd.get("auto") === "on";
    savePrefs();
    clearSyncError();
    rerender();
    toast("同期設定を保存しました。");
  });

  $("btn-sync-now").addEventListener("click", () => runSync(syncTask));

  $("btn-sync-push").addEventListener("click", async () => {
    const ok = await choose("クラウドのデータを、この端末のデータで上書きします。\nクラウドにだけある変更は失われます。", [
      { label: "上書きする", value: "ok", className: "btn-danger" },
    ]);
    if (!ok) {
      return;
    }
    await runSync(async () => {
      await pushRemote();
      return "この端末のデータでクラウドを上書きしました。";
    });
    updateSyncStatus();
  });

  $("btn-sync-pull").addEventListener("click", async () => {
    const ok = await choose("この端末のデータを、クラウドのデータで上書きします。\nこの端末にだけある変更は失われます。", [
      { label: "上書きする", value: "ok", className: "btn-danger" },
    ]);
    if (!ok) {
      return;
    }
    await runSync(async () => {
      const remote = await fetchRemote();
      if (!remote) {
        throw new SyncError("クラウドにデータがありません。");
      }
      applyRemote(remote);
      return "クラウドのデータでこの端末を上書きしました。";
    });
  });

  $("btn-sync-reset").addEventListener("click", async () => {
    const ok = await choose("この端末の同期設定（トークン、Gist ID）を削除します。\nデータとクラウドのGistは削除されません。", [
      { label: "削除する", value: "ok", className: "btn-danger" },
    ]);
    if (!ok) {
      return;
    }
    resetSyncPrefs();
    clearSyncError();
    rerender();
    toast("同期設定を削除しました。");
  });

  $("btn-export-json").addEventListener("click", () => {
    downloadFile(`habit-planner-${todayStr()}.json`, JSON.stringify(getData(), null, 2), "application/json");
  });

  $("import-file").addEventListener("change", async (e) => {
    const input = e.target;
    const file = input.files && input.files[0];
    if (!file) {
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch (err) {
      input.value = "";
      toast("JSONファイルを読み込めませんでした。", "error");
      return;
    }
    input.value = "";
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      toast("このアプリのデータではありません。", "error");
      return;
    }
    if (Number(parsed.version) > DATA_VERSION) {
      toast("新しいバージョンのアプリで保存されたデータです。アプリを更新してから読み込んでください。", "error");
      return;
    }
    const next = normalizeData(parsed);
    const ok = await choose(
      `「${file.name}」を読み込みます。\n習慣 ${next.habits.length} 件、予定 ${next.schedules.length} 件、睡眠記録 ${Object.keys(next.sleepLogs).length} 件\n現在のデータはすべて置き換えられます。`,
      [{ label: "読み込む", value: "ok", className: "btn-danger" }]
    );
    if (!ok) {
      return;
    }
    replaceData(next);
    save();
    rerender();
    toast("データを読み込みました。");
  });

  const csvType = "text/csv;charset=utf-8";
  $("btn-csv-schedules").addEventListener("click", () => {
    downloadFile(`schedules-${todayStr()}.csv`, schedulesCsv(getData()), csvType);
  });
  $("btn-csv-habits").addEventListener("click", () => {
    downloadFile(`habit-logs-${todayStr()}.csv`, habitLogsCsv(getData(), todayStr()), csvType);
  });
  $("btn-csv-sleep").addEventListener("click", () => {
    downloadFile(`sleep-${todayStr()}.csv`, sleepCsv(getData()), csvType);
  });

  $("btn-reset").addEventListener("click", async () => {
    const ok = await choose(
      "すべての習慣、記録、予定、睡眠記録を削除します。元に戻せません。\n自動同期を使っている場合は、クラウドのデータも空のデータで上書きされます。",
      [{ label: "すべて削除する", value: "ok", className: "btn-danger" }]
    );
    if (!ok) {
      return;
    }
    replaceData(defaultData());
    save();
    rerender();
    toast("すべてのデータを削除しました。");
  });

  const installBtn = $("btn-install");
  if (installBtn) {
    installBtn.addEventListener("click", () => promptInstall());
  }

  updateSyncStatus();
}