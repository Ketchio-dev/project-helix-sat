// React learner smoke: serves the built React app (apps/web-react/dist) on the
// same origin as the live API and drives the critical exam path in a real
// chromium via Playwright — login, the exam countdown, refresh restoration,
// answer advancement, finish, and per-item session review. Mirrors the legacy
// run-playwright-learner-smoke.mjs harness (self-contained: installs Playwright
// into a temp dir so it needs no repo dependency).
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppServer } from '../services/api/server.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REACT_DIST = join(__dirname, '../apps/web-react/dist');

function runCommand(command, args, { cwd, env } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

// NOTE: kept free of `${}` and inner backticks; regex backslashes are doubled so
// they survive this template literal (\\d -> \d in the written file).
const smokeScript = `
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.HELIX_BASE_URL;
const screenshotPath = process.env.HELIX_SMOKE_SCREENSHOT;
assert.ok(baseUrl, 'HELIX_BASE_URL is required');

const EMAIL = 'mina@example.com';
const PASSWORD = 'demo1234';

function trail(cps) { return cps.length ? cps.join(' -> ') : 'none'; }

async function answerCurrentItem(page) {
  const gridIn = page.locator('input[placeholder="Type your answer..."]');
  if (await gridIn.count()) {
    await gridIn.first().fill('1');
  } else {
    const radio = page.getByRole('radio').first();
    await radio.waitFor({ state: 'visible', timeout: 10000 });
    await radio.click();
  }
  await page.getByRole('button', { name: 'Submit' }).click();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const checkpoints = [];

  async function checkpoint(name, fn) {
    console.log('[react-smoke] checkpoint:start ' + name);
    try {
      const result = await fn();
      checkpoints.push(name);
      console.log('[react-smoke] checkpoint:pass ' + name);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        const url = page.url();
        const bodyText = await page.evaluate(() => (document.body ? document.body.innerText.slice(0, 500) : '(no body)'));
        console.log('[react-smoke] debug url=' + url);
        console.log('[react-smoke] debug body=' + JSON.stringify(bodyText));
        await page.screenshot({ path: '/tmp/react-smoke-fail.png', fullPage: true });
      } catch (dbgError) {
        console.log('[react-smoke] debug capture failed: ' + (dbgError instanceof Error ? dbgError.message : dbgError));
      }
      throw new Error('[react-smoke] checkpoint:fail ' + name + ' | completed=' + trail(checkpoints) + ' | ' + message);
    }
  }

  try {
    await checkpoint('login_dashboard', async () => {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      const email = page.locator('input[type=email]');
      await email.waitFor({ state: 'visible', timeout: 20000 });
      await email.fill(EMAIL);
      await page.locator('input[type=password]').fill(PASSWORD);
      await page.locator('form button[type="submit"]').click();
      await page.getByRole('heading', { name: /Welcome back|Your dashboard/ }).waitFor({ state: 'visible', timeout: 20000 });
    });

    await checkpoint('diagnostic_preflight_renders', async () => {
      await page.goto(baseUrl + '/diagnostic', { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: /score-moving plan/i }).waitFor({ state: 'visible', timeout: 20000 });
      await page.getByRole('button', { name: /Start diagnostic/i }).waitFor({ state: 'visible', timeout: 10000 });
    });

    await checkpoint('review_page_renders', async () => {
      await page.goto(baseUrl + '/review', { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: /Review .* repair/i }).waitFor({ state: 'visible', timeout: 20000 });
    });

    await checkpoint('exam_timer_renders', async () => {
      const ok = await page.evaluate(async () => {
        const r = await fetch('/api/timed-set/start', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        return r.ok;
      });
      assert.ok(ok, 'POST /api/timed-set/start should succeed');
      await page.goto(baseUrl + '/practice', { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: /Question \\d+ of \\d+/ }).waitFor({ state: 'visible', timeout: 20000 });
      const timer = page.locator('[role=timer]');
      await timer.waitFor({ state: 'visible', timeout: 15000 });
      const txt = (await timer.innerText()).trim();
      assert.match(txt, /\\d{2}:\\d{2}\\s+left/, 'timer should show MM:SS remaining, got: ' + txt);
    });

    await checkpoint('exam_timer_restores_on_reload', async () => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: /Question \\d+ of \\d+/ }).waitFor({ state: 'visible', timeout: 20000 });
      await page.locator('[role=timer]').waitFor({ state: 'visible', timeout: 15000 });
    });

    await checkpoint('exam_submit_advances', async () => {
      await page.getByRole('heading', { name: /Question 1 of/ }).waitFor({ state: 'visible', timeout: 15000 });
      await answerCurrentItem(page);
      await page.getByRole('heading', { name: /Question 2 of/ }).waitFor({ state: 'visible', timeout: 20000 });
    });

    await checkpoint('exam_finish_and_session_review', async () => {
      await page.getByRole('button', { name: /End.*see results/i }).click();
      await page.getByRole('heading', { name: /Session complete/i }).waitFor({ state: 'visible', timeout: 20000 });
      await page.getByRole('button', { name: 'Review answers' }).click();
      await page.getByRole('heading', { name: /review/i }).waitFor({ state: 'visible', timeout: 20000 });
      const items = await page.getByText(/^Item \\d+/).count();
      assert.ok(items >= 1, 'session review should list at least one item, got ' + items);
    });

    await checkpoint('review_retry_feedback_loop', async () => {
      // Start a review-retry (non-exam) on one of the learner's remediation
      // items; also exercises /api/review/retry/start through the api client.
      const ok = await page.evaluate(async () => {
        const dash = await fetch('/api/dashboard/learner', { credentials: 'same-origin' }).then((r) => r.json()).catch(() => null);
        const card = dash && dash.review && dash.review.remediationCards && dash.review.remediationCards[0];
        if (!card || !card.itemId) return false;
        const r = await fetch('/api/review/retry/start', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: card.itemId }) });
        return r.ok;
      });
      assert.ok(ok, 'POST /api/review/retry/start should succeed for a remediation item');
      await page.goto(baseUrl + '/practice', { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: /Question \\d+ of \\d+/ }).waitFor({ state: 'visible', timeout: 20000 });
      // Non-exam practice must NOT show an exam countdown.
      assert.equal(await page.locator('[role=timer]').count(), 0, 'review-retry must not show an exam timer');
      await answerCurrentItem(page);
      // Non-exam reveals per-item feedback (multi-item) or the completion screen
      // (single-item retry) — either proves the learn-mode loop that exam mode
      // suppresses.
      await page.getByText(/Correct|Incorrect|Session complete/).first().waitFor({ state: 'visible', timeout: 20000 });
    });

    if (screenshotPath) {
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }
    console.log('[react-smoke] all checkpoints passed: ' + trail(checkpoints));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
`;

async function main() {
  const server = await createAppServer({ webRoot: REACT_DIST, spaFallback: true });
  const tempDir = await mkdtemp(join(tmpdir(), 'helix-react-smoke-'));
  const screenshotPath = process.env.HELIX_SMOKE_SCREENSHOT
    ? resolve(process.cwd(), process.env.HELIX_SMOKE_SCREENSHOT)
    : null;

  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 4321;
    const baseUrl = `http://127.0.0.1:${port}`;

    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify({ name: 'helix-react-smoke', private: true, type: 'module' }, null, 2),
    );
    await writeFile(join(tempDir, 'smoke.mjs'), smokeScript);

    await runCommand('npm', ['install', '--no-save', 'playwright'], { cwd: tempDir });
    await runCommand(join(tempDir, 'node_modules/.bin/playwright'), ['install', 'chromium'], { cwd: tempDir });
    await runCommand('node', ['smoke.mjs'], {
      cwd: tempDir,
      env: {
        HELIX_BASE_URL: baseUrl,
        ...(screenshotPath ? { HELIX_SMOKE_SCREENSHOT: screenshotPath } : {}),
      },
    });
  } finally {
    server.close();
    await once(server, 'close').catch(() => {});
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
