// File: tests/sync.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { decideSync } from "../js/core/sync-logic.js";

const t1 = "2024-01-01T00:00:00.000Z";
const t2 = "2024-01-02T00:00:00.000Z";
const t3 = "2024-01-03T00:00:00.000Z";

test("クラウドにデータがなければ保存する", () => {
  assert.equal(decideSync({ remoteExists: false, localUpdatedAt: t1, remoteUpdatedAt: "", base: "" }), "push");
});

test("どちらも変更がなければ何もしない", () => {
  assert.equal(decideSync({ remoteExists: true, localUpdatedAt: t1, remoteUpdatedAt: t1, base: t1 }), "noop");
});

test("この端末だけ変更があれば保存する", () => {
  assert.equal(decideSync({ remoteExists: true, localUpdatedAt: t2, remoteUpdatedAt: t1, base: t1 }), "push");
});

test("クラウドだけ変更があれば読み込む", () => {
  assert.equal(decideSync({ remoteExists: true, localUpdatedAt: t1, remoteUpdatedAt: t2, base: t1 }), "pull");
});

test("両方で同じ更新日時なら同じデータとみなす", () => {
  assert.equal(decideSync({ remoteExists: true, localUpdatedAt: t2, remoteUpdatedAt: t2, base: t1 }), "same");
});

test("両方で変更があれば競合とする", () => {
  assert.equal(decideSync({ remoteExists: true, localUpdatedAt: t2, remoteUpdatedAt: t3, base: t1 }), "conflict");
});

test("初めて同期する端末（前回の同期時点なし）で両方にデータがあれば競合とする", () => {
  assert.equal(decideSync({ remoteExists: true, localUpdatedAt: t2, remoteUpdatedAt: t3, base: "" }), "conflict");
});