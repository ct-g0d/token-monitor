'use strict';

const fs = require('node:fs');
const path = require('node:path');

const appData = path.join(process.env.APPDATA, 'Token Monitor');

const ca = JSON.parse(fs.readFileSync(path.join(appData, 'collector-anchor.json'), 'utf8'));
const dha = JSON.parse(fs.readFileSync(path.join(appData, 'daily-history-archive.json'), 'utf8'));

console.log('=== INVESTIGATING 4,631,527,768 ($472.33) ===');

// Check fixedPeriodRanges calculation with live Today from collector-anchor or dailyWithLiveToday
const { derivePeriod } = require('../src/electron/renderer/fixedPeriodRanges');

const range30 = { start: '2026-09-19', end: '2026-10-18' };

// Daily array constructed from dha
const dailyRows = [];
for (const [date, dayData] of Object.entries(dha.days)) {
  let tokens = 0;
  let cost = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let outputTokens = 0;
  const perClient = {};
  const perModel = {};

  for (const obs of Object.values(dayData.observations || {})) {
    const t = obs.tokens || 0;
    const c = obs.cost || 0;
    tokens += t;
    cost += c;
    const cr = obs.cacheReadTokens || 0;
    const cw = obs.cacheWriteTokens || 0;
    const op = obs.outputTokens || 0;
    cacheReadTokens += cr;
    cacheWriteTokens += cw;
    outputTokens += op;

    const cl = obs.client || 'unknown';
    const m = obs.modelId || 'unknown';

    if (!perClient[cl]) perClient[cl] = { tokens: 0, cost: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 };
    perClient[cl].tokens += t;
    perClient[cl].cost += c;
    perClient[cl].cacheReadTokens += cr;
    perClient[cl].cacheWriteTokens += cw;
    perClient[cl].outputTokens += op;

    if (!perModel[m]) perModel[m] = { tokens: 0, cost: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 };
    perModel[m].tokens += t;
    perModel[m].cost += c;
    perModel[m].cacheReadTokens += cr;
    perModel[m].cacheWriteTokens += cw;
    perModel[m].outputTokens += op;
  }

  dailyRows.push({
    date,
    tokens,
    cost,
    cacheReadTokens,
    cacheWriteTokens,
    outputTokens,
    tokenComponentsAvailable: true,
    perClient,
    perModel
  });
}

dailyRows.sort((a, b) => a.date.localeCompare(b.date));

// Test without todayPeriod
const pWithoutToday = derivePeriod(dailyRows, range30);
console.log('30D from archive without live today:');
console.log(`  Total tokens: ${pWithoutToday.totalTokens.toLocaleString()}, Cost: $${pWithoutToday.costUsd.toFixed(2)}`);

// Test with live today from collector-anchor.today
const pWithToday = derivePeriod(dailyRows, range30, {
  liveTodayKey: '2026-10-18',
  todayPeriod: ca.today
});
console.log('30D from archive WITH live today (ca.today):');
console.log(`  Total tokens: ${pWithToday.totalTokens.toLocaleString()}, Cost: $${pWithToday.costUsd.toFixed(2)}`);

// What if live today has different tokens?
console.log('Target tokens: 4,631,527,768 ($472.33)');
console.log('Difference:', 4631527768 - pWithoutToday.totalTokens);
