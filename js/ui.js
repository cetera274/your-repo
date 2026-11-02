// File: js/ui.js
import { CATEGORIES } from "./core/data.js";
import { WEEKDAYS } from "./core/date.js";

export const $ = (id) => document.getElementById(id);

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") {
    root.dataset.theme = theme;
  } else {
    delete root.dataset.theme;
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", cssVar("--card") || "#4f7cff");
  }
}

export function prefersReducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

// ---------- トーストと読み上げ ----------
let toastTimer = null;
let announceTimer = null;

export function announce(message, assertive = false) {
  const el = $(assertive ? "live-assertive" : "live-polite");
  if (!el) {
    return;
  }
  el.textContent = "";
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => {
    el.textContent = message;
  }, 100);
}

export function toast(message, type = "success") {
  const el = $("toast");
  if (el) {
    el.textContent = message;
    el.className = `show ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.className = "";
    }, 4000);
  }
  announce(message, type === "error");
}

// ---------- HTMLの部品 ----------
export function metric(label, value) {
  return `
    <div class="metric">
      <div class="metric-label">${label}</div>
      <div class="metric-value">${value}</div>
    </div>
  `;
}

export function categoryOptions(selected) {
  const list = !selected || CATEGORIES.includes(selected) ? CATEGORIES : [...CATEGORIES, selected];
  return list
    .map(
      (c) =>
        `<option value="${escapeHtml(c)}" ${c === selected ? "selected" : ""}>${escapeHtml(c)}</option>`
    )
    .join("");
}

export function weekdayCheckboxes(name, selected, idPrefix) {
  return WEEKDAYS.map(
    (w, i) => `
      <label class="inline">
        <input type="checkbox" id="${idPrefix}-${i}" name="${name}" value="${i}" ${selected.includes(i) ? "checked" : ""}>
        ${w}
      </label>
    `
  ).join("");
}

export function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- 再描画とフォーカスの復元 ----------
const FOCUS_ATTRS = [
  "data-habit",
  "data-schedule",
  "data-edit-schedule",
  "data-edit-rule",
  "data-delete-schedule",
  "data-rule-edit",
  "data-rule-delete",
  "data-active",
  "data-edit-habit",
  "data-delete-habit",
  "data-move",
  "data-date",
  "data-delete-sleep",
  "data-plan-habit",
];

export function focusKey(el) {
  if (!el || el === document.body || el === document.documentElement) {
    return null;
  }
  if (el.id) {
    return `#${CSS.escape(el.id)}`;
  }
  for (const attr of FOCUS_ATTRS) {
    const value = el.getAttribute(attr);
    if (value !== null) {
      return `[${attr}="${CSS.escape(value)}"]`;
    }
  }
  return null;
}

export function restoreFocus(key) {
  if (!key) {
    return false;
  }
  const el = document.querySelector(key);
  if (!el || el.disabled || typeof el.focus !== "function") {
    return false;
  }
  el.focus({ preventScroll: true });
  return true;
}

let renderer = () => {};

export function setRenderer(fn) {
  renderer = fn;
}

// 画面を描き直し、直前にフォーカスしていた要素にフォーカスを戻す
export function rerender() {
  const key = focusKey(document.activeElement);
  renderer();
  restoreFocus(key);
}

export function focusHeading() {
  const h = document.querySelector("#app h2");
  if (h) {
    h.setAttribute("tabindex", "-1");
    h.focus({ preventScroll: true });
  }
}

// ---------- ダイアログ ----------
let formDialogHandler = null;
let formDialogReturn = null;

export function initDialogs() {
  const dlg = $("form-dialog");
  const form = $("form-dialog-form");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!formDialogHandler) {
      dlg.close();
      return;
    }
    const error = formDialogHandler(new FormData(form));
    if (error) {
      $("form-dialog-error").textContent = error;
      return;
    }
    dlg.close();
  });

  $("form-dialog-cancel").addEventListener("click", () => dlg.close());

  dlg.addEventListener("close", () => {
    formDialogHandler = null;
    $("form-dialog-body").innerHTML = "";
    const key = formDialogReturn;
    formDialogReturn = null;
    restoreFocus(key);
  });
}

// onSubmit は FormData を受け取り、エラーがあればメッセージを、なければ null を返す
export function openFormDialog(title, bodyHtml, onSubmit, setup) {
  const dlg = $("form-dialog");
  if (dlg.open) {
    dlg.close();
  }
  formDialogReturn = focusKey(document.activeElement);
  $("form-dialog-title").textContent = title;
  $("form-dialog-body").innerHTML = bodyHtml;
  $("form-dialog-error").textContent = "";
  formDialogHandler = onSubmit;
  if (setup) {
    setup($("form-dialog-body"));
  }
  dlg.showModal();
}

// 選択肢を表示し、選ばれた value を返す（キャンセル時は null）
export function choose(message, options) {
  return new Promise((resolve) => {
    const dlg = $("choice-dialog");
    if (dlg.open) {
      resolve(null);
      return;
    }
    const returnKey = focusKey(document.activeElement);
    $("choice-message").textContent = message;
    const actions = $("choice-actions");
    actions.innerHTML = "";

    const cancel = document.createElement("button");
    cancel.type = "submit";
    cancel.value = "cancel";
    cancel.textContent = "キャンセル";
    actions.appendChild(cancel);

    for (const o of options) {
      const b = document.createElement("button");
      b.type = "submit";
      b.value = o.value;
      b.textContent = o.label;
      if (o.className) {
        b.className = o.className;
      }
      actions.appendChild(b);
    }

    dlg.returnValue = "";
    dlg.addEventListener(
      "close",
      () => {
        const v = dlg.returnValue;
        restoreFocus(returnKey);
        resolve(v && v !== "cancel" ? v : null);
      },
      { once: true }
    );
    dlg.showModal();
  });
}

// ---------- グラフ ----------
let charts = [];

export function destroyCharts() {
  charts.forEach((c) => c.destroy());
  charts = [];
}

// description はスクリーンリーダー向けのグラフの説明
export function makeChart(canvasId, config, description) {
  const canvas = $(canvasId);
  if (!canvas) {
    return;
  }
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", description);

  const ChartLib = window.Chart;
  if (typeof ChartLib === "undefined") {
    const p = document.createElement("p");
    p.className = "note";
    p.textContent = `グラフを表示できません（vendor/chart.umd.js を読み込めませんでした）。${description}`;
    canvas.replaceWith(p);
    return;
  }
  ChartLib.defaults.color = cssVar("--muted");
  ChartLib.defaults.borderColor = cssVar("--border");
  const base = { responsive: true, maintainAspectRatio: false };
  if (prefersReducedMotion()) {
    base.animation = false;
  }
  config.options = Object.assign(base, config.options || {});
  charts.push(new ChartLib(canvas, config));
}