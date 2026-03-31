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
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.HELIX_BASE_URL;
const screenshotPath = process.env.HELIX_SMOKE_SCREENSHOT;
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

async function hasRecoverableActiveSession(page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/session/active', { credentials: 'same-origin' }).catch(() => null);
    if (!response || !response.ok) return false;
    const payload = await response.json().catch(() => null);
    return Boolean(payload?.activeSession?.currentItem);
  });
}

async function readActiveSession(page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/session/active', { credentials: 'same-origin' }).catch(() => null);
    if (!response || !response.ok) return null;
    const payload = await response.json().catch(() => null);
    return payload?.activeSession ?? null;
  });
}

async function clickSectionButtonByText(page, sectionSelector, patternSource, patternFlags = 'i') {
  return page.evaluate(({ sectionSelector, patternSource, patternFlags }) => {
    const section = document.querySelector(sectionSelector);
    if (!section) return false;
    const pattern = new RegExp(patternSource, patternFlags);
    const button = [...section.querySelectorAll('button')].find((candidate) => pattern.test(candidate.textContent ?? ''));
    if (!button) return false;
    button.click();
    return true;
  }, { sectionSelector, patternSource, patternFlags });
}

function formatCheckpointTrail(checkpoints) {
  return checkpoints.length ? checkpoints.join(' -> ') : 'none';
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const checkpoints = [];

  async function checkpoint(name, fn) {
    console.log('[helix-smoke] checkpoint:start ' + name);
    try {
      const result = await fn();
      checkpoints.push(name);
      console.log('[helix-smoke] checkpoint:pass ' + name);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        '[helix-smoke] checkpoint:fail ' +
          name +
          ' | completed=' +
          formatCheckpointTrail(checkpoints) +
          ' | ' +
          message,
      );
    }
  }

  try {
    await checkpoint('signup_landing', async () => {
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      await expectUniqueIds(page);

      await page.locator('#registerName').fill('Smoke Learner');
      await page.locator('#registerEmail').fill(uniqueEmail());
      await page.locator('#registerPassword').fill('pass1234');
      await page.locator('#registerButton').click();

      const goalSetupSection = page.locator('#goalSetupSection');
      const nextMoveHeading = page.getByRole('heading', { name: 'Next block' });
      const postRegisterSurface = await Promise.race([
        goalSetupSection.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'goal').catch(() => null),
        nextMoveHeading.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'dashboard').catch(() => null),
      ]);
      assert.ok(postRegisterSurface, 'register should land on goal setup or the learner home shell');
    });

    await checkpoint('goal_setup_completion_resume', async () => {
      const goalSetupSection = page.locator('#goalSetupSection');
      const nextMoveHeading = page.getByRole('heading', { name: 'Next block' });
      if (await goalSetupSection.isVisible().catch(() => false)) {
        await page.locator('#goalTargetScore').fill('1450');
        await page.locator('#goalTargetDate').fill('2026-12-05');
        await page.locator('#goalDailyMinutes').fill('35');
        await page.locator('#goalWeakArea').fill('inference');
        await page.locator('#goalSetupForm button[type="submit"]').click();
        await page.waitForFunction(() => {
          const text = document.querySelector('#nextBestActionSection')?.textContent ?? '';
          return text.includes('Start your 12-minute check') || text.includes('Resume');
        });
      }
      await nextMoveHeading.waitFor();
      const primaryNextBestAction = page.locator('#nextBestActionSection button[data-next-best-action="true"]');
      await primaryNextBestAction.waitFor({ state: 'visible' });
      assert.equal(await primaryNextBestAction.count(), 1, 'Learner home should show exactly one primary next-best-action');
    });

    await checkpoint('diagnostic_preflight_start', async () => {
      const nextMoveHeading = page.getByRole('heading', { name: 'Next block' });
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

      const primaryNextBestAction = page.locator('#nextBestActionSection button[data-next-best-action="true"]');
      const launchMeta = await primaryNextBestAction.evaluate((button) => ({
        label: button.textContent?.trim() ?? '',
        role: button.dataset.ctaRole ?? '',
        sessionType: button.dataset.launchSessionType ?? '',
        section: button.dataset.launchSection ?? '',
        realismProfile: button.dataset.launchRealismProfile ?? '',
        profileLabel: button.dataset.launchProfileLabel ?? '',
      }));
      assert.equal(launchMeta.role, 'primary', 'home CTA should be marked as the primary next-best-action');
      assert.equal(launchMeta.sessionType, 'diagnostic', 'goal completion should launch the diagnostic next move');

      await primaryNextBestAction.click();
      const preflightHeading = page.getByRole('heading', { name: 'Your 12-minute starting point' });
      await preflightHeading.waitFor({ timeout: 3000 });
      await page.locator('#startDiagnosticFromPreflight').click();
      const activeSession = await readActiveSession(page);
      assert.equal(activeSession?.session?.type ?? activeSession?.sessionType ?? null, launchMeta.sessionType);
    });

    await checkpoint('diagnostic_reveal_cta', async () => {
      let progressTexts = new Set();

      for (let index = 0; index < 15; index += 1) {
        const resumeButton = page.locator('#nextBestActionSection').getByRole('button', { name: /Resume/i }).first();
        if (await page.locator('#diagnosticRevealSection').isVisible().catch(() => false)) {
          break;
        }
        if (await resumeButton.isVisible().catch(() => false)) {
          await clickSectionButtonByText(page, '#nextBestActionSection', 'Resume');
        } else if (await hasRecoverableActiveSession(page)) {
          await page.locator('#refreshDashboard').click();
        }
        await Promise.race([
          page.locator('#attemptForm').waitFor({ state: 'visible', timeout: 5000 }).catch(() => null),
          page.locator('#diagnosticRevealSection').waitFor({ state: 'visible', timeout: 5000 }).catch(() => null),
        ]);
        if (await page.locator('#diagnosticRevealSection').isVisible().catch(() => false)) {
          break;
        }

        const statusText = await page.locator('#diagnosticStatus').textContent().catch(() => '');
        if (statusText && statusText.includes('Diagnostic progress:')) {
          progressTexts.add(statusText.split('answered.')[1]?.trim() || statusText);
        }

        await page.locator('#attemptForm').waitFor({ state: 'visible' });
        await answerCurrentItem(page);
        await page.waitForTimeout(30);
      }

      const progressArray = Array.from(progressTexts);
      assert.ok(progressArray.length >= 2, 'Progress text should meaningfully evolve during diagnostic');
      assert.ok(progressArray.some(t => t.includes('Helix is')), 'Progress should contain meaningful narrative');

      await page.locator('#diagnosticRevealSection').waitFor({ state: 'visible' });
      await page.locator('#diagnosticReveal').getByText('Score range', { exact: false }).waitFor();
      await page.locator('#diagnosticReveal').getByText('Start here').waitFor();
      await page.locator('#diagnosticReveal').getByText('Why Helix believes this').waitFor();

      const ctaButton = page.locator('#diagnosticReveal').locator('button').first();
      const ctaLabel = await ctaButton.textContent();
      
      await clickSectionButtonByText(page, '#diagnosticReveal', '^Practice |^Repair |^Start ');
      
      await page.locator('#attemptForm').waitFor({ state: 'visible', timeout: 5000 });
      const newStatusText = await page.locator('#diagnosticStatus').textContent();
      assert.ok(newStatusText, 'Follow-up session should start immediately');
    });

    await checkpoint('quick_win_completion_summary', async () => {
      for (let index = 0; index < 5; index += 1) {
        if (await page.locator('#quickWinSection').isVisible().catch(() => false)) {
          break;
        }
        const retryButton = page.locator('#nextBestActionSection').getByRole('button', { name: /Resume|Practice/i }).first();
        if (await retryButton.isVisible().catch(() => false)) {
          await clickSectionButtonByText(page, '#nextBestActionSection', 'Resume|Practice');
        } else if (await hasRecoverableActiveSession(page)) {
          await page.locator('#refreshDashboard').click();
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
    });

    await checkpoint('dashboard_review_visibility', async () => {
      await page.locator('#refreshDashboard').click();
      const dashboardToggle = page.getByRole('button', { name: /Show full study dashboard|Hide full study dashboard/ }).first();
      if (await dashboardToggle.isVisible().catch(() => false)) {
        const toggleLabel = await dashboardToggle.textContent();
        if ((toggleLabel ?? '').includes('Show')) {
          await dashboardToggle.click();
        }
      } else {
        await page.evaluate(() => {
          document.querySelector('#toggleDashboardDetails')?.click();
        });
      }
      await page.locator('#learnerNarrative').getByText('Score signal:', { exact: false }).waitFor();
      await page.locator('#returnPath').getByText('Completion streak:', { exact: false }).waitFor();
      await page.locator('#weeklyDigest').getByText('Next week opportunity', { exact: false }).waitFor();
      const reviewRecommendations = page.locator('#reviewRecommendations');
      const firstLessonPack = reviewRecommendations.locator('details').first();
      await firstLessonPack.getByText('Learn the rule', { exact: false }).waitFor();
      await reviewRecommendations.getByRole('button', { name: /Start retry loop|Start near-transfer/i }).first().waitFor();
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

      const topbarStyles = await page.locator('.topbar').evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          borderRadius: s.borderRadius,
          display: s.display,
        };
      });
      assert.equal(topbarStyles.display, 'flex', 'Topbar should use a dense flex layout');
      assert.ok(parseInt(topbarStyles.borderRadius, 10) <= 14, 'Topbar radius should stay compact');

      const cardStyles = await page.locator('.card').first().evaluate((el) => {
        const s = getComputedStyle(el);
        return { borderRadius: s.borderRadius };
      });
      assert.ok(parseInt(cardStyles.borderRadius, 10) <= 12, 'Card border-radius should stay compact');

      const choiceLabels = await page.locator('.choice').count();
      if (choiceLabels > 0) {
        const choiceStyles = await page.locator('.choice').first().evaluate((el) => {
          const s = getComputedStyle(el);
          return { cursor: s.cursor, borderRadius: s.borderRadius };
        });
        assert.equal(choiceStyles.cursor, 'pointer', 'Choice items should have pointer cursor');
        assert.ok(parseInt(choiceStyles.borderRadius, 10) <= 12, 'Choice border-radius should stay compact');
      }

      const buttonStyles = await page.locator('button').first().evaluate((el) => {
        const s = getComputedStyle(el);
        return { transitionDuration: s.transitionDuration };
      });
      assert.notEqual(buttonStyles.transitionDuration, '0s', 'Buttons should have CSS transitions');

      if (screenshotPath) {
        await mkdir(new URL('.', \`file://\${screenshotPath}\`).pathname, { recursive: true }).catch(() => null);
        await page.screenshot({ path: screenshotPath });
      }
    });

    await checkpoint('exam_profile_module_start', async () => {
      await page.evaluate(() => {
        const details = document.querySelector('#manualStartControls');
        if (details) {
          details.style.display = 'block';
          details.open = true;
        }
      });
      await page.locator('#moduleSection').selectOption('math');
      await page.locator('#moduleRealismProfile').selectOption('exam');
      const selectedSection = await page.locator('#moduleSection').inputValue();
      const selectedProfile = await page.locator('#moduleRealismProfile').inputValue();
      await page.locator('#startModule').click();
      await page.locator('#diagnosticStatus').getByText('Module Simulation (Math) progress: 0/22 answered', { exact: false }).waitFor();
      const activeSession = await readActiveSession(page);
      assert.equal(activeSession?.session?.type ?? activeSession?.sessionType ?? null, 'module_simulation');
      assert.equal(activeSession?.session?.section ?? null, selectedSection);
      assert.equal(activeSession?.session?.realism_profile ?? null, selectedProfile);
    });

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
      env: {
        HELIX_BASE_URL: baseUrl,
        ...(process.env.HELIX_SMOKE_SCREENSHOT ? { HELIX_SMOKE_SCREENSHOT: process.env.HELIX_SMOKE_SCREENSHOT } : {}),
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
