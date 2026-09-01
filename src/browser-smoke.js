import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const port = 8798;
const base = `http://127.0.0.1:${port}`;
const env = { ...process.env, PORT: String(port), NVIDIA_API_KEY: '', BROWSER_HEADLESS: 'true' };
const server = spawn(process.execPath, ['server.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('AeroApply server did not start');
}

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const response = await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
  if (!response?.ok()) throw new Error(`Dashboard returned HTTP ${response?.status()}`);
  if (!(await page.title()).includes('AeroApply')) throw new Error('Unexpected page title');
  if (!(await page.locator('h1').innerText()).includes('Local aerospace + AI/ML')) throw new Error('Dashboard did not render');

  const interactive = await page.locator('button').evaluateAll(buttons => buttons.filter(button => !button.disabled).map(button => button.textContent.trim()));
  const required = ['Run 5-agent workflow', 'Run QA checks', 'Open in AeroApply Browser', 'Read current page', 'Score with Nemotron', 'Save job', 'Generate tailoring plan', 'Fill known fields', 'Screenshot', 'Refresh profile', 'Refresh'];
  for (const label of required) if (!interactive.includes(label)) throw new Error(`Missing interactive control: ${label}`);

  await page.fill('#url', `${base}/qa-job.html`);
  await page.click('button:has-text("Open in AeroApply Browser")');
  await page.waitForTimeout(200);
  if (!(await page.locator('#browserout').innerText()).includes('Opened:')) throw new Error('Open browser action did not update UI');

  await page.click('button:has-text("Read current page")');
  await page.waitForTimeout(200);
  if (!(await page.locator('#jd').inputValue()).includes('Junior Aerospace Engineer')) throw new Error('Read current page did not import job text');

  console.log('PASS  local dashboard + interactive controls');
  console.log('PASS  browser automation + job page import');
  console.log('Browser smoke suite complete.');
} catch (error) {
  console.error(`FAIL  browser smoke: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill('SIGTERM');
}
