const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeHistory } = require('../../src/shared/history.js');
const { overlayLedgerHistory } = require('../../src/shared/usage/tokenLedger.js');

test('overlayLedgerHistory counts days with cost > 0 but tokens === 0 as active days', () => {
  const history = overlayLedgerHistory({
    daily: [
      { date: '2026-06-01', tokens: 100, cost: 0.05, messages: 1 },
      { date: '2026-06-02', tokens: 0, cost: 0.10, messages: 1 },
      { date: '2026-06-03', tokens: 0, cost: 0, messages: 0 },
      { date: '2026-06-04', tokens: 50, cost: 0, messages: 1 }
    ]
  }, [], '2026-06-04');

  assert.equal(history.summary.activeDays, 3);
});

test('normalizeHistory counts unique days with either tokens or cost > 0', () => {
  const h = normalizeHistory({
    contributions: [
      { date: '2026-06-01', tokens: 0, cost: 0.05, client: 'claude', model: 'opus', messages: 1 },
      { date: '2026-06-02', tokens: 500, cost: 0, client: 'codex', model: 'gpt', messages: 1 },
      { date: '2026-06-03', tokens: 0, cost: 0, client: 'codex', model: 'gpt', messages: 0 }
    ]
  }, { todayKey: '2026-06-03' });

  assert.equal(h.summary.activeDays, 2);
});

test('resolveWindowKey resolves correctly for 24H, 7D, 30D, 90D, and ALL', () => {
  function resolveWindowKey(input) {
    if (!input) return "90";
    if (("days" in input && input.days === 0) || ("windowDays" in input && input.windowDays === 0)) {
      return "all";
    }
    if ("days" in input && (input.days === 1 || input.days === 7 || input.days === 30 || input.days === 90)) {
      return String(input.days);
    }
    if ("windowDays" in input && (input.windowDays === 1 || input.windowDays === 7 || input.windowDays === 30 || input.windowDays === 90)) {
      return String(input.windowDays);
    }
    if (input.resolution === "hour") {
      return "1";
    }
    if (input.sinceDay && input.untilDay) {
      if (input.sinceDay === "1970-01-01" || String(input.sinceDay).startsWith("1970")) {
        return "all";
      }
      const start = new Date(String(input.sinceDay)).getTime();
      const end = new Date(String(input.untilDay)).getTime();
      const diff = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
      if (diff <= 2) return "1";
      if (diff <= 10) return "7";
      if (diff <= 45) return "30";
      if (diff <= 95) return "90";
      return "all";
    }
    return "90";
  }

  assert.equal(resolveWindowKey({ days: 1 }), "1");
  assert.equal(resolveWindowKey({ resolution: "hour" }), "1");
  assert.equal(resolveWindowKey({ days: 7 }), "7");
  assert.equal(resolveWindowKey({ days: 30 }), "30");
  assert.equal(resolveWindowKey({ days: 90 }), "90");
  assert.equal(resolveWindowKey({ days: 0 }), "all");
  assert.equal(resolveWindowKey({ windowDays: 0 }), "all");
  assert.equal(resolveWindowKey({ sinceDay: "1970-01-01", untilDay: "2026-10-26" }), "all");
  assert.equal(resolveWindowKey({ sinceDay: "2026-06-15", untilDay: "2026-10-26" }), "all"); // 134 days > 95
  assert.equal(resolveWindowKey({ sinceDay: "2026-08-01", untilDay: "2026-10-26" }), "90"); // ~87 days <= 95
});
