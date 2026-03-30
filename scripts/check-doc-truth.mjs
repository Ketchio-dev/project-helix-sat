import fs from 'node:fs';
import { buildProjectHelixSatAudit } from '../packages/assessment/src/project-helix-sat-audit.mjs';

const ontology = JSON.parse(fs.readFileSync(new URL('../docs/ontology/skill-ontology.v1.json', import.meta.url), 'utf8'));
const routerSource = fs.readFileSync(new URL('../services/api/src/router.mjs', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../apps/web/public/app.js', import.meta.url), 'utf8');
const apiTestSource = fs.readFileSync(new URL('../tests/api.test.mjs', import.meta.url), 'utf8');
const readmeSource = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const contentReadmeSource = fs.readFileSync(new URL('../content/README.md', import.meta.url), 'utf8');
const narrativeAuditSource = fs.readFileSync(new URL('../docs/sat-coverage-audit.md', import.meta.url), 'utf8');
const qualityBriefSource = fs.readFileSync(new URL('../docs/quality/bluebook-khan-slice.md', import.meta.url), 'utf8');

const audit = buildProjectHelixSatAudit({ ontology, routerSource, appSource, apiTestSource });

function invariant(ok, message) {
  if (!ok) {
    throw new Error(message);
  }
}

const expectedCoverageLine = `${audit.ontologyCoverage.coveredSkills}/${audit.ontologyCoverage.totalSkills} skills covered`;
const expectedBankLine = `${audit.content.itemCount} items / ${audit.content.rationaleCount} rationales`;
const expectedGridInLine = `${audit.formatRealism.mathGridInCount} grid-ins`;
const expectedDefaultModuleLine = `${audit.sessions.moduleSimulation.itemCount}-item default modules`;
const expectedExtendedModuleLine = '18-item extended modules';
const expectedCookieLine = 'HttpOnly `helix_auth` cookie';
const expectedSourceOfTruthLine = 'source of truth';
const expectedReleaseBarLine = 'npm run audit:helix:bars';

invariant(readmeSource.includes(expectedCoverageLine), `README drift: missing "${expectedCoverageLine}"`);
invariant(readmeSource.includes(expectedBankLine), `README drift: missing "${expectedBankLine}"`);
invariant(readmeSource.includes(expectedGridInLine), `README drift: missing "${expectedGridInLine}"`);
invariant(readmeSource.includes(expectedDefaultModuleLine), `README drift: missing "${expectedDefaultModuleLine}"`);
invariant(readmeSource.includes(expectedExtendedModuleLine), `README drift: missing "${expectedExtendedModuleLine}"`);
invariant(readmeSource.includes(expectedCookieLine), `README drift: missing cookie auth statement`);
invariant(!/localStorage token persistence/i.test(readmeSource), 'README drift: stale localStorage auth statement still present');

invariant(contentReadmeSource.includes(expectedSourceOfTruthLine), 'content/README drift: missing source-of-truth guidance');
invariant(contentReadmeSource.includes(`${audit.sessions.moduleSimulation.itemCount}-item default / 18-item extended`), 'content/README drift: missing current module realism guidance');
invariant(contentReadmeSource.includes(`${audit.formatRealism.mathGridInCount} grid-ins`), 'content/README drift: missing current grid-in count');
invariant(contentReadmeSource.includes(expectedReleaseBarLine), 'content/README drift: missing release-bar verification command');

invariant(
  narrativeAuditSource.includes(expectedCoverageLine) || narrativeAuditSource.includes(`${audit.ontologyCoverage.coveredSkills} covered, ${audit.ontologyCoverage.partialSkills} partial, ${audit.ontologyCoverage.missingSkills.length} missing`),
  `docs/sat-coverage-audit.md drift: missing current ontology coverage summary`,
);
invariant(narrativeAuditSource.includes(`${audit.formatRealism.mathGridInCount} math grid-ins`) || narrativeAuditSource.includes(`${audit.formatRealism.mathGridInCount}-item math grid-in`) || narrativeAuditSource.includes(`${audit.formatRealism.mathGridInCount} grid-ins`), 'docs/sat-coverage-audit.md drift: missing current grid-in count');
invariant(narrativeAuditSource.includes(`${audit.sessions.moduleSimulation.itemCount}-item`), 'docs/sat-coverage-audit.md drift: missing current default module size');
invariant(narrativeAuditSource.includes(expectedReleaseBarLine), 'docs/sat-coverage-audit.md drift: missing release-bar command');

invariant(qualityBriefSource.includes(`${audit.ontologyCoverage.coveredSkills} covered, ${audit.ontologyCoverage.partialSkills} partial, ${audit.ontologyCoverage.missingSkills.length} missing`), 'quality brief drift: missing current ontology coverage summary');
invariant(qualityBriefSource.includes(`${audit.sessions.moduleSimulation.itemCount}-item default block`), 'quality brief drift: missing current default module size');
invariant(qualityBriefSource.includes(expectedReleaseBarLine), 'quality brief drift: missing release-bar command');

console.log('Documentation truth checks passed');
console.log(`- README: ${expectedCoverageLine}, ${expectedBankLine}, ${expectedGridInLine}`);
console.log(`- Content guide: ${audit.sessions.moduleSimulation.itemCount}-item default / 18-item extended, ${audit.formatRealism.mathGridInCount} grid-ins`);
console.log(`- Narrative docs: release-bar command and current coverage snapshot present`);
