import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAppServer } from '../services/api/server.mjs';

function runCommand(command, args, { cwd, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

const smokeScript = `
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.HELIX_BASE_URL;
assert.ok(baseUrl, 'HELIX_BASE_URL is required');

function uniqueEmail() {
  return \`smoke-\${Date.now()}-\${Math.random().toString(16).slice(2)}@example.com\`;
}

async function answerCurrentItem(page) {
  const radioCount = await page.locator('input[name="selectedAnswer"]').count();
  if (radioCount > 0) {
    await page.locator('input[name="selectedAnswer"]').first().check();
  } else if (await page.locator('input[name="freeResponse"]').count()) {
    await page.locator('input[name="freeResponse"]').fill('0');
  } else {
    throw new Error('No answer input found for current item');
  }
  await page.locator('#attemptForm button[type="submit"]').click();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(baseUrl, { waitUntil: 'networkidle' });

    await page.locator('#registerName').fill('Smoke Learner');
    await page.locator('#registerEmail').fill(uniqueEmail());
    await page.locator('#registerPassword').fill('pass1234');
    await page.locator('#registerButton').click();

    await page.locator('#goalSetupSection').waitFor({ state: 'visible' });
    await page.locator('#goalTargetScore').fill('1450');
    await page.locator('#goalTargetDate').fill('2026-12-05');
    await page.locator('#goalDailyMinutes').fill('35');
    await page.locator('#goalWeakArea').fill('inference');
    await page.locator('#goalSetupForm button[type="submit"]').click();

    await page.getByRole('heading', { name: 'Your next move' }).waitFor();
    await page.getByRole('button', { name: 'Show full study dashboard' }).waitFor();

    await expectHidden(page, '#studentSnapshotSection');
    await expectHidden(page, '#studentPlanSection');
    await expectHidden(page, '#programPathSection');
    await expectHidden(page, '#supportViewSection');
    await expectHidden(page, '#teacherAssignmentsSection');

    await page.locator('#nextBestActionSection button').first().click();
    await page.getByRole('heading', { name: 'Your 12-minute starting point' }).waitFor();
    await page.locator('#startDiagnosticFromPreflight').click();

    for (let index = 0; index < 15; index += 1) {
      if (await page.getByText('Score range now:', { exact: false }).isVisible().catch(() => false)) {
        break;
      }
      await page.locator('#attemptForm').waitFor({ state: 'visible' });
      await answerCurrentItem(page);
      await page.waitForTimeout(30);
    }

    await page.getByText('Score range now:', { exact: false }).waitFor();
    await page.getByText('Start here next').waitFor();
    await page.getByText('Why Helix believes this').waitFor();
    await page.locator('#diagnosticReveal').getByRole('button', { name: 'Take the 2-minute win' }).click();

    for (let index = 0; index < 5; index += 1) {
      if (await page.locator('#quickWinSection').isVisible().catch(() => false)) {
        break;
      }
      await page.locator('#attemptForm').waitFor({ state: 'visible' });
      await answerCurrentItem(page);
      await page.waitForTimeout(30);
    }

    await page.locator('#quickWinSection').waitFor({ state: 'visible' });
    await page.locator('#quickWinSection h2').waitFor({ state: 'visible' });

  } finally {
    await browser.close();
  }
}

async function expectHidden(page, selector) {
  const visible = await page.locator(selector).isVisible().catch(() => false);
  assert.equal(visible, false, \`\${selector} should be hidden\`);
}

async function expectVisible(page, selector) {
  await page.locator(selector).waitFor({ state: 'visible' });
}

await main();
`;

async function main() {
  const server = createAppServer();
  const tempDir = await mkdtemp(join(tmpdir(), 'helix-playwright-'));

  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 4321;
    const baseUrl = `http://127.0.0.1:${port}`;

    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify({ name: 'helix-playwright-smoke', private: true, type: 'module' }, null, 2),
    );
    await writeFile(join(tempDir, 'smoke.mjs'), smokeScript);

    await runCommand('npm', ['install', '--no-save', 'playwright'], { cwd: tempDir });
    await runCommand(join(tempDir, 'node_modules/.bin/playwright'), ['install', 'chromium'], { cwd: tempDir });
    await runCommand('node', ['smoke.mjs'], {
      cwd: tempDir,
      env: { HELIX_BASE_URL: baseUrl },
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
