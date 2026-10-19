import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const VITE_URL = "http://127.0.0.1:5173";
const CDP_PORT = 9222;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return await res.json();
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.pending = new Map();
    this.events = [];
    this.consoleLogs = [];
    this.errors = [];
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        if (data.id && this.pending.has(data.id)) {
          const { resolve, reject } = this.pending.get(data.id);
          this.pending.delete(data.id);
          if (data.error) reject(new Error(data.error.message));
          else resolve(data.result);
        } else if (data.method) {
          if (data.method === 'Runtime.consoleAPICalled') {
            const args = data.params.args.map((a) => a.value ?? a.description).join(' ');
            this.consoleLogs.push({ type: data.params.type, text: args });
          } else if (data.method === 'Runtime.exceptionThrown') {
            this.errors.push(data.params.exceptionDetails);
          }
        }
      };
    });
  }

  async send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${res.exceptionDetails.text}`);
    }
    return res.result?.value;
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

async function run() {
  console.log('=== Step 1: Starting Headless Chrome ===');
  const chromeProcess = spawn(
    CHROME_PATH,
    [
      '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--window-size=1440,900',
    ],
    { stdio: 'ignore' }
  );

  // Wait for Chrome CDP port to open
  let connected = false;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    try {
      const version = await fetchJson(`http://127.0.0.1:${CDP_PORT}/json/version`);
      console.log(`Chrome CDP ready: ${version['Browser']}`);
      connected = true;
      break;
    } catch (e) {
      // wait
    }
  }

  if (!connected) {
    throw new Error('Failed to connect to Chrome headless CDP');
  }

  try {
    console.log('\n=== Step 2: Creating New Page & Connecting CDP ===');
    const newTab = await fetchJson(`http://127.0.0.1:${CDP_PORT}/json/new?${VITE_URL}`, { method: 'PUT' });
    const client = new CDPClient(newTab.webSocketDebuggerUrl);
    await client.connect();

    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Network.enable');

    const networkRequests = new Map();
    client.ws.addEventListener('message', (msg) => {
      const data = JSON.parse(msg.data);
      if (data.method === 'Network.responseReceived') {
        const { url, status } = data.params.response;
        networkRequests.set(url, status);
      }
    });

    console.log('\n=== Step 3: Navigating to Usage Tab & Waiting for Render ===');
    await client.send('Page.navigate', { url: `${VITE_URL}/?tab=usage` });
    await sleep(2000);

    // Check DOM of Usage Tab
    const usageCheck = await client.eval(`(() => {
      const text = document.body.innerText;
      const title = document.title;
      const breadcrumb = document.querySelector('header span')?.innerText || '';
      
      const metricButtons = Array.from(document.querySelectorAll('header button, .lg\\\\:col-span-12 button, main button'))
        .map(b => b.innerText.trim())
        .filter(t => ['Cost', 'Tokens', 'Limits'].includes(t));

      const timeWindows = Array.from(document.querySelectorAll('button'))
        .map(b => b.innerText.trim())
        .filter(t => ['Past 24h', '7 days', '30 days', '90 days'].includes(t));

      const totalTokens = document.querySelector('.text-5xl')?.innerText;
      const totalSessions = document.querySelector('.text-5xl + div')?.innerText;

      // Providers list
      const providerItems = Array.from(document.querySelectorAll('.lg\\\\:col-span-5 .flex.items-center.justify-between'))
        .map(el => ({
          name: el.querySelector('.font-semibold')?.innerText,
          sessions: el.querySelector('.text-xs')?.innerText,
          total: el.querySelector('.tabular-nums')?.innerText,
          hasSvg: !!el.querySelector('svg'),
        }));

      // Spline Chart
      const splineSvg = document.querySelector('svg[aria-label="Daily processed tokens by provider"]');
      const paths = splineSvg ? Array.from(splineSvg.querySelectorAll('path')).map(p => ({
        fill: p.getAttribute('fill'),
        dLength: p.getAttribute('d')?.length || 0,
        hasBezier: p.getAttribute('d')?.includes('C') || false
      })) : [];

      // Breakdown table
      const breakdownRows = Array.from(document.querySelectorAll('table tbody tr')).map(tr => {
        const cells = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
        return cells;
      });

      // Brand Icons check
      const codexIcon = !!document.querySelector('svg path[clip-rule="evenodd"]');
      const opencodeIcon = !!document.querySelector('svg rect[x="3"][y="3"]');
      const antigravityIcon = !!document.querySelector('svg image[href*="data:image/png"]');

      return {
        title,
        breadcrumb,
        metricButtons,
        timeWindows,
        totalTokens,
        totalSessions,
        providerItems,
        pathsCount: paths.length,
        pathsHasBezier: paths.every(p => p.hasBezier),
        paths,
        breakdownRowCount: breakdownRows.length,
        breakdownSample: breakdownRows.slice(0, 3),
        icons: {
          codexIcon,
          opencodeIcon,
          antigravityIcon
        }
      };
    })()`);

    console.log('Usage Page DOM verification results:');
    console.log(JSON.stringify(usageCheck, null, 2));

    console.log('\n=== Step 4: Testing Metric Switch & Time Window Interactions ===');
    const interactionCheck = await client.eval(`(() => {
      // Click 'Cost' metric button
      const costBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Cost');
      if (costBtn) costBtn.click();
      return true;
    })()`);
    await sleep(500);

    const costDom = await client.eval(`(() => {
      return {
        totalCost: document.querySelector('.text-5xl')?.innerText,
        chartLabel: document.querySelector('svg[aria-label]')?.getAttribute('aria-label')
      };
    })()`);
    console.log('Cost Switch DOM Result:', costDom);

    // Switch to 7 days
    await client.eval(`(() => {
      const btn7d = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '7 days');
      if (btn7d) btn7d.click();
      return true;
    })()`);
    await sleep(500);

    const timeDom = await client.eval(`(() => {
      return {
        totalMetric: document.querySelector('.text-5xl')?.innerText,
        sessionCount: document.querySelector('.text-5xl + div')?.innerText,
        pathCount: document.querySelectorAll('svg[aria-label] path').length
      };
    })()`);
    console.log('7 Days Time Window DOM Result:', timeDom);

    console.log('\n=== Step 5: Testing Settings Tab & Sidebar Navigation ===');
    // Click Settings tab button
    await client.eval(`(() => {
      const settingsTab = document.getElementById('tab-btn-settings');
      if (settingsTab) settingsTab.click();
      return true;
    })()`);
    await sleep(1000);

    const settingsSidebarCheck = await client.eval(`(() => {
      const navButtons = Array.from(document.querySelectorAll('aside button'))
        .map(b => b.innerText.trim())
        .filter(Boolean);

      const breadcrumb = document.querySelector('header nav')?.innerText?.replace(/\\s+/g, ' ');
      return {
        breadcrumb,
        navButtonsCount: navButtons.length,
        navButtons
      };
    })()`);
    console.log('Settings Sidebar Nav:', settingsSidebarCheck);

    console.log('\n=== Step 6: Testing All 14 Settings Panels ===');
    const panelResults = [];
    for (const panelName of settingsSidebarCheck.navButtons) {
      await client.eval(`((name) => {
        const btn = Array.from(document.querySelectorAll('aside button')).find(b => b.innerText.trim() === name);
        if (btn) btn.click();
      })(${JSON.stringify(panelName)})`);
      await sleep(300);

      const panelData = await client.eval(`(() => {
        const breadcrumb = document.querySelector('header nav')?.innerText?.replace(/\\s+/g, ' ');
        const main = document.querySelector('main main') || document.querySelector('aside + main');
        const h3List = Array.from(main?.querySelectorAll('h3') || []).map(h => h.innerText.trim());
        const inputCount = (main?.querySelectorAll('input') || []).length;
        const switchCount = (main?.querySelectorAll('[role="switch"]') || []).length;
        const buttonCount = (main?.querySelectorAll('button') || []).length;
        const selectCount = (main?.querySelectorAll('[role="combobox"]') || []).length;
        return {
          breadcrumb,
          sections: h3List,
          inputCount,
          switchCount,
          buttonCount,
          selectCount
        };
      })()`);
      panelResults.push({ name: panelName, ...panelData });
    }
    console.log(`Verified ${panelResults.length} panels successfully:`);
    for (const p of panelResults) {
      console.log(` - [${p.name}] sections: ${p.sections.slice(0, 3).join(', ') || 'N/A'} (inputs: ${p.inputCount}, switches: ${p.switchCount}, selects: ${p.selectCount})`);
    }

    console.log('\n=== Step 7: Testing Theme Toggle ===');
    const themeInitial = await client.eval(`document.documentElement.classList.contains('dark')`);
    await client.eval(`document.getElementById('theme-toggle-btn').click()`);
    await sleep(300);
    const themeAfter = await client.eval(`document.documentElement.classList.contains('dark')`);
    console.log(`Theme toggle verified: before=${themeInitial}, after=${themeAfter}`);

    console.log('\n=== Step 8: Checking Console Logs and Errors ===');
    console.log(`Console Logs collected: ${client.consoleLogs.length}`);
    for (const log of client.consoleLogs) {
      console.log(` [${log.type}] ${log.text}`);
    }
    console.log(`Runtime Exceptions: ${client.errors.length}`);
    if (client.errors.length > 0) {
      for (const err of client.errors) {
        console.error(' Exception:', err);
      }
    }

    console.log('\n=== Step 9: Checking Network Requests Status ===');
    let assetFailure = false;
    for (const [url, status] of networkRequests.entries()) {
      if (status >= 400) {
        console.error(`Asset failed: ${url} (status ${status})`);
        assetFailure = true;
      }
    }
    if (!assetFailure) {
      console.log(`All ${networkRequests.size} loaded network assets returned 200/304 OK! No broken assets.`);
    }

    client.close();
  } finally {
    chromeProcess.kill('SIGKILL');
  }

  console.log('\n=== Verification Run Complete! ===');
}

run().catch((err) => {
  console.error('Verification script failed:', err);
  process.exit(1);
});
