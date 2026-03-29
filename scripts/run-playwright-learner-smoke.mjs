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
    await expectUniqueIds(page);

    await page.locator('#registerName').fill('Smoke Learner');
    await page.locator('#registerEmail').fill(uniqueEmail());
    await page.locator('#registerPassword').fill('pass1234');
    await page.locator('#registerButton').click();

    const goalSetupSection = page.locator('#goalSetupSection');
    const nextMoveHeading = page.getByRole('heading', { name: 'Your next move' });
    const postRegisterSurface = await Promise.race([
      goalSetupSection.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'goal').catch(() => null),
      nextMoveHeading.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'dashboard').catch(() => null),
    ]);
    assert.ok(postRegisterSurface, 'register should land on goal setup or the learner home shell');

    if (postRegisterSurface === 'goal' && await goalSetupSection.isVisible().catch(() => false)) {
      await page.locator('#goalTargetScore').fill('1450');
      await page.locator('#goalTargetDate').fill('2026-12-05');
      await page.locator('#goalDailyMinutes').fill('35');
      await page.locator('#goalWeakArea').fill('inference');
      await page.locator('#goalSetupForm button[type="submit"]').click();
      await nextMoveHeading.waitFor();
    }

    await nextMoveHeading.waitFor();
    await page.getByRole('button', { name: 'Show full study dashboard' }).waitFor();
    await page.locator('#learnerNarrative').getByText('Find your starting point', { exact: false }).waitFor();
    await page.locator('#learnerNarrative').getByText('Score signal:', { exact: false }).waitFor();
    await page.locator('#learnerNarrative').getByText('Finish your first session to unlock change tracking.', { exact: false }).waitFor();

    await expectHidden(page, '#studentSnapshotSection');
    await expectHidden(page, '#studentPlanSection');
    await expectHidden(page, '#programPathSection');
    await expectHidden(page, '#supportViewSection');
    await expectHidden(page, '#teacherAssignmentsSection');

    await page.locator('#nextBestActionSection button').first().click();
    await page.getByRole('heading', { name: 'Your 12-minute starting point' }).waitFor();
    await page.locator('#startDiagnosticFromPreflight').click();

    for (let index = 0; index < 15; index += 1) {
      if (await page.locator('#diagnosticRevealSection').isVisible().catch(() => false)) {
        break;
      }
      await Promise.race([
        page.locator('#attemptForm').waitFor({ state: 'visible', timeout: 5000 }).catch(() => null),
        page.locator('#diagnosticRevealSection').waitFor({ state: 'visible', timeout: 5000 }).catch(() => null),
      ]);
      if (await page.locator('#diagnosticRevealSection').isVisible().catch(() => false)) {
        break;
      }
      await page.locator('#attemptForm').waitFor({ state: 'visible' });
      await answerCurrentItem(page);
      await page.waitForTimeout(30);
    }

    await page.locator('#diagnosticRevealSection').waitFor({ state: 'visible' });
    await page.locator('#diagnosticReveal').getByText('Score range now:', { exact: false }).waitFor();
    await page.locator('#diagnosticReveal').getByText('Start here next').waitFor();
    await page.locator('#diagnosticReveal').getByText('Why Helix believes this').waitFor();
    await page.locator('#diagnosticReveal').getByRole('button', { name: /^Practice / }).click();

    for (let index = 0; index < 5; index += 1) {
      if (await page.locator('#quickWinSection').isVisible().catch(() => false)) {
        break;
      }
      await Promise.race([
        page.locator('#attemptForm').waitFor({ state: 'visible', timeout: 5000 }).catch(() => null),
        page.locator('#quickWinSection').waitFor({ state: 'visible', timeout: 5000 }).catch(() => null),
      ]);
      if (await page.locator('#quickWinSection').isVisible().catch(() => false)) {
        break;
      }
      await page.locator('#attemptForm').waitFor({ state: 'visible' });
      await answerCurrentItem(page);
      await page.waitForTimeout(30);
    }

    await Promise.race([
      page.locator('#quickWinSection').waitFor({ state: 'visible', timeout: 5000 }).catch(() => null),
      page.locator('#sessionOutcomeSection').waitFor({ state: 'visible', timeout: 5000 }).catch(() => null),
    ]);
    const quickWinVisible = await page.locator('#quickWinSection').isVisible().catch(() => false);
    const sessionOutcomeVisible = await page.locator('#sessionOutcomeSection').isVisible().catch(() => false);
    assert.equal(quickWinVisible || sessionOutcomeVisible, true, 'quick win should end in a visible summary or unified session outcome');

    await page.locator('#refreshDashboard').click();
    await page.getByRole('button', { name: 'Show full study dashboard' }).click();
    await page.locator('#learnerNarrative').getByText('Score signal:', { exact: false }).waitFor();
    await page.locator('#returnPath').getByText('Completion streak:', { exact: false }).waitFor();
    await page.locator('#weeklyDigest').getByText('Next week opportunity', { exact: false }).waitFor();
    const reviewRecommendations = page.locator('#reviewRecommendations');
    const firstLessonPack = reviewRecommendations.locator('details').first();
    await firstLessonPack.getByText('Learn the rule', { exact: false }).waitFor();
    await reviewRecommendations.getByRole('button', { name: 'Try this again' }).first().waitFor();
    await reviewRecommendations.getByRole('button', { name: 'Try a close variant' }).first().waitFor();
    await firstLessonPack.locator('summary').click();
    const lessonPackText = await firstLessonPack.textContent();
    assert.match(lessonPackText ?? '', /Learn the rule/);
    assert.match(lessonPackText ?? '', /See it modeled/);
    assert.match(lessonPackText ?? '', /Practice the fix/);
    assert.match(lessonPackText ?? '', /Stretch to a close variant/);
    assert.match(lessonPackText ?? '', /Teach card/);
    assert.match(lessonPackText ?? '', /Worked example/);
    assert.match(lessonPackText ?? '', /Retry pair/);
    assert.match(lessonPackText ?? '', /Near-transfer pair/);
    await page.locator('#moduleSection').selectOption('math');
    await page.locator('#moduleRealismProfile').selectOption('exam');
    await page.locator('#startModule').click();
    await page.locator('#diagnosticStatus').getByText('Module Simulation (Math) progress: 0/22 answered', { exact: false }).waitFor();

    // ── Visual-redesign regression guardrails ──────────
    const designTokens = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return {
        bg: root.getPropertyValue('--bg').trim(),
        accent: root.getPropertyValue('--accent').trim(),
        radiusSm: root.getPropertyValue('--radius-sm').trim(),
        radiusMd: root.getPropertyValue('--radius-md').trim(),
        radiusLg: root.getPropertyValue('--radius-lg').trim(),
        transition: root.getPropertyValue('--transition').trim(),
      };
    });
    assert.ok(designTokens.bg, 'CSS variable --bg should be defined');
    assert.ok(designTokens.accent, 'CSS variable --accent should be defined');
    assert.ok(designTokens.radiusSm, 'CSS variable --radius-sm should be defined');
    assert.ok(designTokens.radiusMd, 'CSS variable --radius-md should be defined');
    assert.ok(designTokens.radiusLg, 'CSS variable --radius-lg should be defined');
    assert.ok(designTokens.transition, 'CSS variable --transition should be defined');

    const heroStyles = await page.locator('.hero').evaluate((el) => {
      const s = getComputedStyle(el);
      return { borderRadius: s.borderRadius, display: s.display };
    });
    assert.equal(heroStyles.display, 'flex', 'Hero should use flex layout');
    assert.ok(parseInt(heroStyles.borderRadius, 10) >= 16, 'Hero border-radius should be >= 16px (premium)');

    const cardStyles = await page.locator('.card').first().evaluate((el) => {
      const s = getComputedStyle(el);
      return { borderRadius: s.borderRadius, background: s.backgroundColor };
    });
    assert.ok(parseInt(cardStyles.borderRadius, 10) >= 16, 'Card border-radius should be >= 16px');

    const choiceLabels = await page.locator('.choice').count();
    if (choiceLabels > 0) {
      const choiceStyles = await page.locator('.choice').first().evaluate((el) => {
        const s = getComputedStyle(el);
        return { cursor: s.cursor, borderRadius: s.borderRadius };
      });
      assert.equal(choiceStyles.cursor, 'pointer', 'Choice items should have pointer cursor');
      assert.ok(parseInt(choiceStyles.borderRadius, 10) >= 10, 'Choice border-radius should be >= 10px');
    }

    const buttonStyles = await page.locator('button').first().evaluate((el) => {
      const s = getComputedStyle(el);
      return { transitionDuration: s.transitionDuration, fontWeight: s.fontWeight };
    });
    assert.notEqual(buttonStyles.transitionDuration, '0s', 'Buttons should have CSS transitions');

  } finally {
    await browser.close();
  }
}

async function expectHidden(page, selector) {
  const visible = await page.locator(selector).isVisible().catch(() => false);
  assert.equal(visible, false, \`\${selector} should be hidden\`);
}

async function expectUniqueIds(page) {
  const duplicateIds = await page.evaluate(() => {
    const counts = new Map();
    for (const element of document.querySelectorAll('[id]')) {
      counts.set(element.id, (counts.get(element.id) ?? 0) + 1);
    }
    return [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([id, count]) => \`\${id} (\${count})\`);
  });
  assert.equal(duplicateIds.length, 0, \`Duplicate ids found: \${duplicateIds.join(', ')}\`);
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
