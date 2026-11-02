// File: js/pwa.js
import { $, announce, toast } from "./ui.js";

let deferredPrompt = null;
let onChange = () => {};
let updateRequested = false;

export function serviceWorkerAvailable() {
  return "serviceWorker" in navigator && window.isSecureContext;
}

export function getInstallPrompt() {
  return deferredPrompt;
}

export async function promptInstall() {
  if (!deferredPrompt) {
    return;
  }
  const p = deferredPrompt;
  deferredPrompt = null;
  p.prompt();
  try {
    await p.userChoice;
  } catch (e) {
    console.error(e);
  }
  onChange();
}

function showUpdateBanner(worker) {
  const banner = $("update-banner");
  const btn = $("btn-update");
  if (!banner || !btn) {
    return;
  }
  banner.hidden = false;
  btn.disabled = false;
  btn.onclick = () => {
    updateRequested = true;
    btn.disabled = true;
    worker.postMessage({ type: "SKIP_WAITING" });
  };
  $("btn-update-later").onclick = () => {
    banner.hidden = true;
  };
  announce("新しいバージョンがあります。画面上部の「更新する」ボタンで更新できます。");
}

function registerServiceWorker() {
  if (!serviceWorkerAvailable()) {
    return;
  }
  // 「更新する」を押したときだけ再読み込みする（初回インストール時は再読み込みしない）
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (updateRequested) {
      updateRequested = false;
      location.reload();
    }
  });

  navigator.serviceWorker
    .register("sw.js")
    .then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) {
        showUpdateBanner(reg.waiting);
      }
      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        if (!worker) {
          return;
        }
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            showUpdateBanner(worker);
          }
        });
      });
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          reg.update().catch(() => undefined);
        }
      });
    })
    .catch((e) => {
      console.error("Service Workerの登録に失敗しました", e);
    });
}

export function initPwa(callback) {
  onChange = callback;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    onChange();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    toast("アプリをインストールしました。");
    onChange();
  });
  registerServiceWorker();
}