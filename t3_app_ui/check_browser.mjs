import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const debuggingPort = 9222;

const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${debuggingPort}`,
  '--disable-gpu',
  '--no-sandbox',
  '--window-size=1280,800',
  '--user-data-dir=C:\\Users\\user2\\AppData\\Local\\Temp\\chrome-test-profile'
]);

await new Promise(r => setTimeout(r, 1500));

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

const versionInfo = await fetchJson(`http://127.0.0.1:${debuggingPort}/json/version`);
const ws = new WebSocket(versionInfo.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);

let idCounter = 1;
function send(method, params = {}) {
  const id = idCounter++;
  return new Promise((resolve) => {
    const handler = (event) => {
      const data = JSON.parse(event.data);
      if (data.id === id) {
        ws.removeEventListener('message', handler);
        resolve(data.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const target = await send('Target.createTarget', { url: 'about:blank' });
const targetWs = new WebSocket(`ws://127.0.0.1:${debuggingPort}/devtools/page/${target.targetId}`);
await new Promise(r => targetWs.onopen = r);

function sendTarget(method, params = {}) {
  const id = idCounter++;
  return new Promise((resolve) => {
    const handler = (event) => {
      const data = JSON.parse(event.data);
      if (data.id === id) {
        targetWs.removeEventListener('message', handler);
        resolve(data.result);
      }
    };
    targetWs.addEventListener('message', handler);
    targetWs.send(JSON.stringify({ id, method, params }));
  });
}

targetWs.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  if (data.method === 'Runtime.consoleAPICalled') {
    console.log(`[CONSOLE ${data.params.type}]`, ...data.params.args.map(a => a.value ?? a.description));
  }
  if (data.method === 'Runtime.exceptionThrown') {
    console.error(`[EXCEPTION]`, JSON.stringify(data.params.exceptionDetails, null, 2));
  }
});

await sendTarget('Page.enable');
await sendTarget('Runtime.enable');

// 1. Capture Usage Page
console.log('Navigating to Usage Page...');
await sendTarget('Page.navigate', { url: 'http://127.0.0.1:5173/?tab=usage' });
await new Promise(r => setTimeout(r, 3000));

// Click Cost button
await sendTarget('Runtime.evaluate', {
  expression: `(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const costBtn = btns.find(b => b.innerText.trim() === 'Cost');
    if (costBtn) costBtn.click();
  })()`
});
await new Promise(r => setTimeout(r, 1000));

let usageScreenshot = await sendTarget('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('d:\\TokeX\\t3_app_ui\\screenshot_usage.png', Buffer.from(usageScreenshot.data, 'base64'));
console.log('Saved screenshot_usage.png');

// 2. Capture Settings Page
console.log('Navigating to Settings Page...');
await sendTarget('Page.navigate', { url: 'http://127.0.0.1:5173/?tab=settings' });
await new Promise(r => setTimeout(r, 3000));

let settingsScreenshot = await sendTarget('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('d:\\TokeX\\t3_app_ui\\screenshot_settings.png', Buffer.from(settingsScreenshot.data, 'base64'));
console.log('Saved screenshot_settings.png');

targetWs.close();
ws.close();
chrome.kill();
process.exit(0);
