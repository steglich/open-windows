// Uso: node measure.mjs <chromium> <distDir> <abas> <segundos>
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';

const [chromium, dist, tabsArg, secondsArg] = process.argv.slice(2);
const tabs = Number(tabsArg);
const seconds = Number(secondsArg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ico': 'image/x-icon' };

const server = createServer((req, res) => {
  const path = req.url.split('?')[0];
  let file = join(dist, path === '/' ? 'index.html' : path);
  if (!existsSync(file)) file = join(dist, 'index.html');
  res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
  res.end(readFileSync(file));
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const url = `http://127.0.0.1:${server.address().port}/`;

const profile = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'chrome-'));
const browser = spawn(chromium, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, TMPDIR: process.env.XDG_RUNTIME_DIR ?? '/tmp' } });

const wsUrl = await new Promise((resolve, reject) => {
  let err = '';
  browser.stderr.on('data', (d) => {
    err += d;
    const m = err.match(/DevTools listening on (ws:\S+)/);
    if (m) resolve(m[1]);
  });
  browser.once('exit', () => reject(new Error(err)));
});

function connect(ws) {
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    }
  };
  return (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const i = ++id;
      pending.set(i, { resolve, reject });
      ws.send(JSON.stringify({ id: i, method, params, sessionId }));
    });
}

const ws = new WebSocket(wsUrl);
await new Promise((r) => (ws.onopen = r));
const send = connect(ws);

const OBSERVER = `window.__long=0;window.__longN=0;new PerformanceObserver(l=>{for(const e of l.getEntries()){window.__long+=e.duration;window.__longN++}}).observe({type:'longtask',buffered:true});`;

const sessions = [];
for (let i = 0; i < tabs; i++) {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Performance.enable', { timeDomain: 'threadTicks' }, sessionId);
  await send('Page.addScriptToEvaluateOnNewDocument', { source: OBSERVER }, sessionId);
  await send('Page.navigate', { url }, sessionId);
  sessions.push(sessionId);
}

async function snapshot(sessionId) {
  const { metrics } = await send('Performance.getMetrics', {}, sessionId);
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  const { result } = await send('Runtime.evaluate', { expression: 'JSON.stringify([window.__long,window.__longN,document.body.innerText.includes("Conectado")])', returnByValue: true }, sessionId);
  const [long, longN, connected] = JSON.parse(result.value);
  return { task: m.TaskDuration, script: m.ScriptDuration, layout: m.LayoutDuration, style: m.RecalcStyleDuration, long, longN, connected };
}

await sleep(8000); // aquecimento: conexão e primeiros snapshots
const before = await Promise.all(sessions.map(snapshot));
await sleep(seconds * 1000);
const after = await Promise.all(sessions.map(snapshot));

const rows = after.map((a, i) => {
  const b = before[i];
  const ms = (k) => Math.round((a[k] - b[k]) * 1000);
  return { aba: i + 1, conectado: a.connected, task_ms: ms('task'), script_ms: ms('script'), layout_ms: ms('layout'), style_ms: ms('style'), long_ms: Math.round(a.long - b.long), long_n: a.longN - b.longN };
});
console.log(JSON.stringify({ tabs, seconds, rows, total_task_ms: rows.reduce((s, r) => s + r.task_ms, 0), total_script_ms: rows.reduce((s, r) => s + r.script_ms, 0) }));

ws.close();
browser.kill();
server.close();
process.exit(0);
