import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  niceScale,
  monotoneTangents,
  smoothCurve,
  curvePath,
  areaPath,
} from "../t3codeexp/extracted_ui/usage/math/usageSpline.ts";

import {
  formatUsd,
  formatTokens,
  formatPercent,
  formatDayShort,
  enumerateDays,
} from "../t3codeexp/extracted_ui/usage/math/usageFormat.ts";

import {
  cacheHitRate,
  costPerMillionTokens,
} from "../t3codeexp/extracted_ui/usage/math/usageBreakdown.ts";

import {
  remainingPercent,
  elapsedShare,
  paceOf,
  formatDuration,
  formatResetsIn,
} from "../t3codeexp/extracted_ui/usage/math/usageLimits.ts";

import {
  mergeUsage,
} from "../t3codeexp/extracted_ui/usage/math/usageMerge.ts";

describe("Adversarial Stress Test: Spline & Geometry", () => {
  it("handles duplicate x-coordinates without divide-by-zero NaN", () => {
    const points = [
      { x: 10, y: 5 },
      { x: 10, y: 15 },
      { x: 20, y: 25 },
    ];
    const tangents = monotoneTangents(points);
    assert.equal(tangents.length, 3);
    for (const t of tangents) {
      assert.ok(!Number.isNaN(t), `Tangent was NaN: ${t}`);
      assert.ok(Number.isFinite(t), `Tangent was infinite: ${t}`);
    }
  });

  it("handles single-point, two-point, and empty point arrays", () => {
    assert.deepEqual(monotoneTangents([]), [0]);
    assert.deepEqual(monotoneTangents([{ x: 1, y: 2 }]), [0]);
    const twoPoints = monotoneTangents([{ x: 0, y: 0 }, { x: 10, y: 10 }]);
    assert.equal(twoPoints.length, 2);
    assert.equal(twoPoints[0], 1);
    assert.equal(twoPoints[1], 1);

    assert.deepEqual(smoothCurve([]), []);
    assert.deepEqual(smoothCurve([{ x: 1, y: 2 }]), []);
    assert.equal(curvePath([]), "");
    assert.equal(areaPath(""), "");
  });

  it("handles huge numbers and astronomical spikes without overflow", () => {
    const points = [
      { x: 0, y: 1e12 },
      { x: 10, y: 1e15 },
      { x: 20, y: 0 },
    ];
    const segments = smoothCurve(points);
    assert.equal(segments.length, 2);
    const path = curvePath(segments);
    assert.ok(path.startsWith("M"));
    assert.ok(!path.includes("NaN"));
    assert.ok(!path.includes("Infinity"));
  });

  it("niceScale handles negative peak, tiny numbers, and extreme values", () => {
    assert.deepEqual(niceScale(-50, 4), { max: 0, ticks: [0] });
    assert.deepEqual(niceScale(0, 4), { max: 0, ticks: [0] });

    const tiny = niceScale(0.0000012, 4);
    assert.ok(tiny.max >= 0.0000012);
    assert.ok(tiny.ticks.length > 1);

    const huge = niceScale(9.87e12, 4);
    assert.ok(huge.max >= 9.87e12);
  });
});

describe("Adversarial Stress Test: Rate Limits & Pace", () => {
  it("handles elapsed time exceeding window duration (elapsedShare clamped to 1.0)", () => {
    const now = new Date("2026-10-18T12:00:00Z");
    const window = {
      id: "test",
      kind: "sliding",
      usedPercent: 80,
      windowDurationMins: 300,
      resetsAt: "2026-10-18T10:00:00Z", // Past! Reset was 2 hours ago
    };
    const share = elapsedShare(window, now);
    assert.equal(share, 1.0);
  });

  it("handles resetsAt in the future longer than windowDuration (clamped to 0.0)", () => {
    const now = new Date("2026-10-18T12:00:00Z");
    const window = {
      id: "test",
      kind: "sliding",
      usedPercent: 80,
      windowDurationMins: 300,
      resetsAt: "2026-10-18T20:00:00Z", // 8 hours in future for 5-hour window
    };
    const share = elapsedShare(window, now);
    assert.equal(share, 0.0);
  });

  it("calculates pace cleanly when window has no resetsAt or windowDurationMins", () => {
    const window = {
      id: "test",
      kind: "calendar",
      usedPercent: 45,
    };
    assert.equal(elapsedShare(window), null);
    assert.equal(paceOf(window), null);
  });

  it("handles negative and >100 usedPercent", () => {
    assert.equal(remainingPercent({ id: "w", kind: "sliding", usedPercent: -10 }), 100);
    assert.equal(remainingPercent({ id: "w", kind: "sliding", usedPercent: 150 }), 0);
  });
});

describe("Adversarial Stress Test: Token Invariants & Formatting", () => {
  it("cacheHitRate handles zero total input tokens without NaN", () => {
    const model = {
      model: "test-model",
      provider: "claude",
      costUsd: 0,
      totalTokens: 0,
      tokens: { uncachedInputTokens: 0, cachedInputTokens: 0, cacheCreationTokens: 0, outputTokens: 0, reasoningTokens: 0 },
      records: 0,
      unpricedRecords: 0,
      unpricedTokens: 0,
      costShare: 0,
      tokenShare: 0,
    };
    assert.equal(cacheHitRate(model), null);
    assert.equal(costPerMillionTokens(model), null);
  });

  it("formatUsd handles negative, zero, and fractional cents", () => {
    assert.equal(formatUsd(-12.5), "-$12.50");
    assert.equal(formatUsd(0.004), "$0.00");
    assert.equal(formatUsd(1e9), "$1,000,000,000.00");
  });

  it("formatTokens handles negative and extreme counts", () => {
    assert.equal(formatTokens(-500), "-500");
    assert.equal(formatTokens(0), "0");
    assert.equal(formatTokens(12.34), "12");
  });
});

describe("Adversarial Stress Test: Usage Deduplication & Merge", () => {
  it("handles empty sources array", () => {
    const result = mergeUsage([], 6);
    assert.equal(result.records, 0);
    assert.equal(result.providers.length, 0);
  });

  it("preserves buckets with disjoint day and model", () => {
    const s1 = {
      environmentId: "env1",
      label: "MacBook",
      summary: {
        contractVersion: 6,
        readAt: "2026-10-18T00:00:00Z",
        sinceDay: "2026-10-18",
        untilDay: "2026-10-18",
        buckets: [{
          day: "2026-10-18",
          provider: "claude",
          model: "claude-3-7-sonnet",
          totals: { uncachedInputTokens: 1000, cachedInputTokens: 0, cacheCreationTokens: 0, outputTokens: 500, reasoningTokens: 0 },
          costUsd: 0.05,
          cacheSavingsUsd: 0,
          records: 1,
          unpricedRecords: 0,
          sessions: 1,
          costSource: "modelPriced",
        }],
        sources: [{ status: "ok", fingerprint: { hostId: "mac-1", provider: "claude", resolvedHomePath: "/Users/x", volumeId: "vol1" }, distinctSessions: 1 }],
      }
    };
    const s2 = {
      environmentId: "env2",
      label: "Linux",
      summary: {
        contractVersion: 6,
        readAt: "2026-10-18T01:00:00Z",
        sinceDay: "2026-10-18",
        untilDay: "2026-10-18",
        buckets: [{
          day: "2026-10-18",
          provider: "codex",
          model: "gpt-4o",
          totals: { uncachedInputTokens: 2000, cachedInputTokens: 0, cacheCreationTokens: 0, outputTokens: 1000, reasoningTokens: 0 },
          costUsd: 0.08,
          cacheSavingsUsd: 0,
          records: 2,
          unpricedRecords: 0,
          sessions: 2,
          costSource: "modelPriced",
        }],
        sources: [{ status: "ok", fingerprint: { hostId: "linux-1", provider: "codex", resolvedHomePath: "/home/x", volumeId: "vol2" }, distinctSessions: 2 }],
      }
    };
    const merged = mergeUsage([s1, s2], 6);
    assert.equal(merged.records, 3);
    assert.equal(merged.sessions, 3);
    assert.ok(Math.abs(merged.costUsd - 0.13) < 1e-5);
    assert.equal(merged.providers.length, 2);
  });
});
