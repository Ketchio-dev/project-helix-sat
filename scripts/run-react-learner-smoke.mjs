// React learner smoke: serves the built React app (apps/web-react/dist) on the
// same origin as the live API and drives the full activation path in a real
// chromium via Playwright — signup, goal setup, diagnostic start + reveal,
// quick-win, dashboard review, and the exam-profile module (countdown, refresh
// restoration, answer advancement, finish, per-item review). This is the React
// promotion gate (docs/product-completion-milestones.md, criterion 1).
//
// Funnel sessions are completed through the API (authenticated browser context)
// to avoid fragile 13-item clicking; every learner-facing SURFACE is still
// asserted in the rendered React UI. Mirrors the legacy run-playwright-learner-
// smoke.mjs harness (installs Playwright into a temp dir, no repo dependency).
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

function uniqueEmail() {
  return 'smoke-' + Date.now() + '-' + Math.random().toString(16).slice(2) + '@example.com';
}

function trail(cps) { return cps.length ? cps.join(' -> ') : 'none'; }

const QUESTION_HEADING = /Question \\d+ of \\d+/;

async function answerCurrentItemUi(page) {
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

// Drive whatever session is currently active to completion via the API, using
// the same payload rules the store applies (exam mode + grid-in freeResponse).
async function completeActiveSessionViaApi(page) {
  for (let i = 0; i < 40; i += 1) {
    const state = await page.evaluate(async () => {
      const r = await fetch('/api/session/active', { credentials: 'same-origin' });
      if (!r.ok) return null;
      const j = await r.json();
      const a = j && j.activeSession;
      if (!a || !a.currentItem) return null;
      const choice = a.currentItem.choices && a.currentItem.choices[0];
      return {
        sessionId: a.session && a.session.id,
        itemId: a.currentItem.itemId,
        itemFormat: a.currentItem.item_format,
        firstChoice: (choice && (choice.letter || choice.label || choice.value)) || 'A',
        exam: !!(a.timing && a.timing.timeLimitSec != null),
      };
    });
    if (!state || !state.itemId) return;
    const done = await page.evaluate(async (s) => {
      const STUDENT = ['grid_in', 'student_produced_response', 'student-produced-response'];
      const body = { itemId: s.itemId, sessionId: s.sessionId, confidenceLevel: 3, mode: s.exam ? 'exam' : 'learn', responseTimeMs: 4000 };
      if (STUDENT.includes(s.itemFormat)) body.freeResponse = '1'; else body.selectedAnswer = String(s.firstChoice);
      const r = await fetch('/api/attempt/submit', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) return 'error:' + r.status + ':' + (await r.text()).slice(0, 200);
      const j = await r.json();
      return ((j.sessionProgress && j.sessionProgress.isComplete) || j.sessionComplete) ? 'complete' : 'next';
    }, state);
    // Surface a rejected submit here instead of letting it masquerade as a
    // later checkpoint timeout under the wrong name.
    if (done.startsWith('error:')) throw new Error('attempt submit failed while completing session (' + done + ')');
    if (done === 'complete') return;
  }
}

async function startSessionViaApi(page, path, payload) {
  return page.evaluate(async ({ path, payload }) => {
    const r = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}) });
    return r.ok;
  }, { path, payload });
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
    await checkpoint('signup_landing', async () => {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      // Before switching, only the tab button matches "Create account".
      await page.getByRole('button', { name: 'Create account' }).first().click();
      await page.locator('input[type=text]').first().fill('Smoke Learner');
      await page.locator('input[type=email]').fill(uniqueEmail());
      await page.locator('input[type=password]').fill('pass1234');
      await page.locator('form button[type="submit"]').click();
      await page.getByRole('heading', { name: /Welcome back|Your dashboard/ }).waitFor({ state: 'visible', timeout: 20000 });
    });

    await checkpoint('goal_setup_completion', async () => {
      await page.locator('#goal-target-score').waitFor({ state: 'visible', timeout: 20000 });
      await page.locator('#goal-target-score').fill('1450');
      await page.locator('#goal-target-date').fill('2026-12-05');
      await page.locator('#goal-daily-minutes').fill('35');
      await page.locator('#goal-weak-area').selectOption('reading');
      await page.locator('#goal-setup-form button[type="submit"]').click();
      // On save the profile becomes complete and the form unmounts (the inline
      // "Goals saved" note can be lost to that re-render, so assert the form is
      // gone instead).
      await page.locator('#goal-target-score').waitFor({ state: 'detached', timeout: 20000 });
    });

    await checkpoint('diagnostic_preflight_start', async () => {
      const nba = await page.evaluate(async () => {
        const r = await fetch('/api/next-best-action', { credentials: 'same-origin' });
        return r.ok ? r.json() : null;
      });
      assert.equal(nba && nba.sessionType, 'diagnostic', 'goal completion should surface the diagnostic next move');
      await page.goto(baseUrl + '/diagnostic', { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: /score-moving plan/i }).waitFor({ state: 'visible', timeout: 20000 });
      await page.getByRole('button', { name: /Start diagnostic/i }).click();
      await page.getByRole('heading', { name: QUESTION_HEADING }).waitFor({ state: 'visible', timeout: 20000 });
    });

    await checkpoint('diagnostic_reveal', async () => {
      await completeActiveSessionViaApi(page);
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.getByText('Your diagnostic result').waitFor({ state: 'visible', timeout: 20000 });
      await page.getByText('Score range').waitFor({ state: 'visible', timeout: 10000 });
      await page.getByText('Start here').waitFor({ state: 'visible', timeout: 10000 });
    });

    await checkpoint('quick_win_unlocked', async () => {
      // Diagnostic complete now unblocks quick-win (server 409s before that).
      const ok = await startSessionViaApi(page, '/api/quick-win/start', {});
      assert.ok(ok, 'quick-win/start should succeed once the diagnostic is complete');
      await page.goto(baseUrl + '/practice', { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: QUESTION_HEADING }).waitFor({ state: 'visible', timeout: 20000 });
      assert.equal(await page.locator('[role=timer]').count(), 0, 'quick-win must not show an exam timer');
      await completeActiveSessionViaApi(page);
    });

    await checkpoint('dashboard_review_visibility', async () => {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: /Welcome back|Your dashboard/ }).waitFor({ state: 'visible', timeout: 20000 });
      // A learner who has practiced should see the study dashboard surface.
      await page.getByRole('button', { name: /study dashboard/i }).waitFor({ state: 'visible', timeout: 10000 });
    });

    await checkpoint('exam_profile_module_start', async () => {
      const ok = await startSessionViaApi(page, '/api/module/start', { section: 'math', realismProfile: 'exam' });
      assert.ok(ok, 'module/start (exam profile) should succeed');
      await page.goto(baseUrl + '/practice', { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: QUESTION_HEADING }).waitFor({ state: 'visible', timeout: 20000 });
      const timer = page.locator('[role=timer]');
      await timer.waitFor({ state: 'visible', timeout: 15000 });
      assert.match((await timer.innerText()).trim(), /\\d{2}:\\d{2}\\s+left/, 'module should show an exam countdown');
    });

    await checkpoint('exam_timer_restores_on_reload', async () => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: QUESTION_HEADING }).waitFor({ state: 'visible', timeout: 20000 });
      await page.locator('[role=timer]').waitFor({ state: 'visible', timeout: 15000 });
    });

    await checkpoint('exam_submit_advances', async () => {
      await page.getByRole('heading', { name: /Question 1 of/ }).waitFor({ state: 'visible', timeout: 15000 });
      await answerCurrentItemUi(page);
      await page.getByRole('heading', { name: /Question 2 of/ }).waitFor({ state: 'visible', timeout: 20000 });
    });

    await checkpoint('exam_finish_and_session_review', async () => {
      await page.getByRole('button', { name: /End.*see results/i }).click();
      await page.getByRole('heading', { name: /Session complete/i }).waitFor({ state: 'visible', timeout: 20000 });
      await page.getByRole('button', { name: 'Review answers' }).click();
      await page.getByRole('heading', { name: /review/i }).waitFor({ state: 'visible', timeout: 20000 });
      const items = await page.getByText(/^Item \\d+/).count();
      assert.ok(items >= 2, 'session review should list every delivered item, got ' + items);
      // Not just labels — the per-item answer content must actually render.
      await page.getByText('Correct answer').first().waitFor({ state: 'visible', timeout: 10000 });
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
