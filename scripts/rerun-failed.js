#!/usr/bin/env node
/**
 * Local "re-run failed tests" helper for SchoolCafe 2.0.
 *
 * Usage:
 *   node scripts/rerun-failed.js <buildId | full build results URL> [--force]
 *
 * What it does, all locally (no pipeline run):
 *   1. Reads the Azure DevOps build you pass in — pulls its FAILED test names and
 *      its TOTAL test count from the build's test results.
 *   2. Posts a RingCentral webhook: "re-running N failed test(s)...".
 *   3. Re-runs ONLY those failed tests locally (Playwright -g by title, headed).
 *   4. Merges the local outcome back into the build's original counts and posts an
 *      updated RingCentral webhook (Total stays the same; Failed = whatever still
 *      fails locally; Passed = Total - Failed).
 *
 * Re-pasting the same build link re-runs only the still-failing set (a local ledger
 * in .rerun-history.json tracks this). --force re-runs again regardless.
 *
 * Secrets read from the repo .env (never the shell env):
 *   - AZURE_DEVOPS_PAT          → to read the build's test results
 *   - RINGCENTRAL_WEBHOOK_URL   → to post the messages (if missing, it prints them)
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const url = require('url');
const readline = require('readline');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const RESULTS = path.join(ROOT, 'test-results', 'results.json');
const HISTORY = path.join(ROOT, '.rerun-history.json');
const PW_CLI = require.resolve('@playwright/test/cli');

const DEFAULT_ORG = 'Cybersoft-Technologies-Inc';
const DEFAULT_PROJECT = 'PrimeroEdge Classic';
const API_VERSION = '7.0';

function fail(msg) { console.error('ERROR: ' + msg); process.exit(1); }

function readEnvValue(key) {
  const envPath = path.join(ROOT, '.env');
  let text = '';
  try { text = fs.readFileSync(envPath, 'utf8'); } catch { return ''; }
  const line = text.split(/\r?\n/).find((l) => new RegExp('^' + key + '=').test(l));
  return line ? line.replace(new RegExp('^' + key + '='), '').trim().replace(/^["']|["']$/g, '') : '';
}

function readHistory() { try { return JSON.parse(fs.readFileSync(HISTORY, 'utf8')); } catch { return {}; } }
function writeHistory(h) { try { fs.writeFileSync(HISTORY, JSON.stringify(h, null, 2)); } catch (e) { console.error('Could not write rerun history:', e.message); } }

function parseBuildArg(arg) {
  if (!arg) fail('Provide a build ID or build results URL.');
  const urlOrg = arg.match(/dev\.azure\.com\/([^/]+)\/([^/]+)\/_build/i);
  const org = urlOrg ? decodeURIComponent(urlOrg[1]) : DEFAULT_ORG;
  const project = urlOrg ? decodeURIComponent(urlOrg[2]) : DEFAULT_PROJECT;
  const idMatch = arg.match(/buildId=(\d+)/i) || arg.match(/(\d+)/);
  if (!idMatch) fail('Could not extract a build ID from: ' + arg);
  return { org, project, id: idMatch[1] };
}

function get(getUrl, pat) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(':' + pat).toString('base64');
    https.get(getUrl, { headers: { Authorization: 'Basic ' + auth } }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

async function fetchBuild(org, project, id, pat) {
  const base = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}`;
  const runsRes = await get(`${base}/_apis/test/runs?buildUri=${encodeURIComponent('vstfs:///Build/Build/' + id)}&api-version=${API_VERSION}`, pat);
  if (runsRes.status !== 200) fail(`HTTP ${runsRes.status} fetching test runs. Body: ${runsRes.body.slice(0, 300)}`);
  const runs = (JSON.parse(runsRes.body).value) || [];
  if (!runs.length) fail('No test runs found for build ' + id + '.');
  let total = 0;
  const failedNames = [];
  for (const run of runs) {
    if (typeof run.totalTests === 'number') total += run.totalTests;
    const res = await get(`${base}/_apis/test/Runs/${run.id}/results?outcomes=Failed&api-version=${API_VERSION}`, pat);
    if (res.status !== 200) continue;
    for (const r of ((JSON.parse(res.body).value) || [])) if (r.testCaseTitle) failedNames.push(r.testCaseTitle);
  }
  const failed = [...new Set(failedNames)];
  const resultsUrl = `${base}/_build/results?buildId=${id}&view=ms.vss-test-web.build-test-results-tab`;
  return { total, failed, resultsUrl };
}

function normTitle(s) { return (s || '').replace(/\s+/g, ' ').trim(); }

function collectLocalResults(file) {
  const out = [];
  if (!fs.existsSync(file)) return out;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  function walk(suite, ancestors, specFile) {
    for (const spec of (suite.specs || [])) {
      const fullTitle = [...ancestors, spec.title].filter(Boolean).join(' › ');
      for (const test of (spec.tests || [])) {
        const r = test.results || [];
        let status = 'unknown';
        if (r.some((x) => x.status === 'passed')) status = 'passed';
        else if (r.some((x) => ['failed', 'timedOut', 'interrupted'].includes(x.status))) status = 'failed';
        out.push({ title: normTitle(fullTitle), status, file: spec.file || specFile || '' });
      }
    }
    for (const child of (suite.suites || [])) walk(child, [...ancestors, child.title].filter(Boolean), specFile);
  }
  (data.suites || []).forEach((fileSuite) => walk(fileSuite, [], fileSuite.file || fileSuite.title || ''));
  return out;
}

function tagFor(file) {
  const base = (file || '').split(/[\\/]/).pop().replace(/\.spec\.(ts|js)$/i, '');
  const m = base.match(/t-?(\d+)/i);
  return m ? ('T-' + m[1]) : (base || 'test');
}

function failedTestsBlock(entries) {
  if (!entries.length) return '';
  const order = [];
  const byTag = new Map();
  for (const e of entries) {
    const tag = tagFor(e.file);
    if (!byTag.has(tag)) { byTag.set(tag, []); order.push(tag); }
    byTag.get(tag).push(e.title);
  }
  const lines = [];
  for (const tag of order) {
    const titles = byTag.get(tag);
    if (titles.length === 1) lines.push('• ' + tag);
    else { lines.push('• ' + tag + ':'); titles.forEach((t) => lines.push('    - ' + t)); }
  }
  return '\n\nFailed Tests:\n' + lines.join('\n');
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function titleToGrep(name) { return name.split(/\s*›\s*/).map(escapeRegex).join('.*'); }

function sendWebhook(text) {
  return new Promise((resolve) => {
    const webhookUrl = readEnvValue('RINGCENTRAL_WEBHOOK_URL');
    if (!webhookUrl) { console.log('\n[no RINGCENTRAL_WEBHOOK_URL in .env — message not sent]\n' + text + '\n'); return resolve(); }
    const parsed = url.parse(webhookUrl);
    const lib = parsed.protocol === 'http:' ? http : https;
    const body = JSON.stringify({ text });
    const req = lib.request({
      hostname: parsed.hostname, port: parsed.port, path: parsed.path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => { console.log('Webhook sent, status:', res.statusCode); resolve(); });
    req.on('error', (e) => { console.error('Webhook error:', e.message); resolve(); });
    req.write(body);
    req.end();
  });
}

function promptYesNo(question) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) return resolve(null);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question + ' (y/n) ', (a) => { rl.close(); resolve(/^\s*y(es)?\s*$/i.test(a)); });
  });
}

(async () => {
  const pat = readEnvValue('AZURE_DEVOPS_PAT');
  if (!pat) fail('AZURE_DEVOPS_PAT not found in .env — add AZURE_DEVOPS_PAT=<token>.');

  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const buildArg = args.find((a) => !a.startsWith('--'));
  const history = readHistory();

  let org, project, id;
  if (buildArg) {
    ({ org, project, id } = parseBuildArg(buildArg));
  } else {
    const lastKey = history.__lastBuild;
    if (!lastKey || !history[lastKey]) fail('No build URL given and no previous re-run on record. Pass the build URL the first time.');
    const parts = lastKey.split('/'); id = parts.pop(); project = parts.pop(); org = parts.join('/');
    console.log('No build URL given — reusing the last re-run build: ' + lastKey);
  }

  const histKey = org + '/' + project + '/' + id;
  const prior = history[histKey];

  if (prior && !force) {
    if (prior.allPassed) {
      console.log('\nBuild ' + id + ' was already re-run on ' + prior.lastRunAt + ' and all ' + prior.origFailed + ' previously-failed test(s) passed. Skipping.');
      return;
    }
    console.log('\nBuild ' + id + ' was already re-run on ' + prior.lastRunAt + ', and ' + prior.stillFailed + ' of ' + prior.origFailed + ' test(s) STILL failed.');
    const ans = await promptYesNo('Re-run the ' + prior.stillFailed + ' still-failing test(s) again?');
    if (ans === null) { console.log('\nNEEDS_CONFIRM: already re-ran this build; ' + prior.stillFailed + ' still failing. Re-run with --force to run them again.'); return; }
    if (!ans) { console.log('OK — not re-running.'); return; }
  }

  let origTotal, failed, resultsUrl;
  if (prior && Array.isArray(prior.failedNames) && typeof prior.origTotal === 'number') {
    failed = prior.failedNames; origTotal = prior.origTotal; resultsUrl = prior.resultsUrl;
    console.log('Re-running the ' + failed.length + ' test(s) still failing from the last re-run of build ' + id + '...');
  } else {
    console.log('Reading failed tests from build ' + id + '...');
    const b = await fetchBuild(org, project, id, pat);
    failed = b.failed; origTotal = b.total; resultsUrl = b.resultsUrl;
  }

  if (!failed.length) {
    console.log('Build ' + id + ' has no failed tests — nothing to re-run.');
    history[histKey] = { buildId: id, lastRunAt: new Date().toISOString(), origTotal: origTotal || 0, origFailed: 0, nowPassing: 0, stillFailed: 0, allPassed: true, failedNames: [], resultsUrl };
    history.__lastBuild = histKey; writeHistory(history);
    await sendWebhook('SchoolCafe 2.0 — re-run requested for build ' + id + ', but it has no failed tests. Nothing to re-run.\n\nOriginal run: ' + resultsUrl);
    return;
  }

  console.log('Failed tests to re-run (' + failed.length + '):');
  failed.forEach((n, i) => console.log('  ' + (i + 1) + '. ' + n));

  // --no-start-webhook: the daily auto-rerun (auto-rerun-latest.js) posts ONE
  // consolidated message at the end. Suppress the "re-running…" up-front ping so
  // the channel sees a single, post-re-run result instead of a noisy pair.
  if (!process.argv.includes('--no-start-webhook')) {
    await sendWebhook('SchoolCafe 2.0 — re-running ' + failed.length + ' previously failed test(s) with the latest changes.\n\nOriginal run: ' + resultsUrl + '\n\nUpdated results to follow.');
  }

  const grep = failed.map(titleToGrep).join('|');
  console.log('\nRe-running failed tests locally...\n');
  spawnSync(process.execPath, [PW_CLI, 'test', '-g', grep, '--workers=1'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, PW_CHANNEL: 'chrome', HEADLESS: '1' },
  });

  const ran = collectLocalResults(RESULTS);
  const statusByTitle = new Map(ran.map((r) => [r.title, r.status]));
  const fileByTitle = new Map(ran.map((r) => [r.title, r.file]));
  const stillFailedNames = [];
  let nowPassing = 0;
  for (const name of failed) {
    if (statusByTitle.get(normTitle(name)) === 'passed') nowPassing += 1;
    else stillFailedNames.push(name);
  }

  const origFailed = failed.length;
  const newFailed = stillFailedNames.length;
  const newPassed = origTotal - newFailed;
  const ranCount = ran.length;
  const pctOf = (n, d) => (d ? Math.round((n / d) * 100) : 0);

  const text =
    '**SchoolCafe 2.0 — Failed-test re-run complete**\n\n' +
    'Re-ran ' + ranCount + ' failed test(s):\n\n' +
    '✅ ' + 'Passed:'.padEnd(9) + nowPassing + '\n' +
    '❌ ' + 'Failed:'.padEnd(9) + newFailed + '\n\n' +
    'Updated totals:\n\n' +
    '✅ ' + 'Passed:'.padEnd(9) + newPassed + ' (' + pctOf(newPassed, origTotal) + '%)\n' +
    '❌ ' + 'Failed:'.padEnd(9) + newFailed + ' (' + pctOf(newFailed, origTotal) + '%)\n' +
    '📊 ' + 'Total:'.padEnd(9) + origTotal +
    failedTestsBlock(stillFailedNames.map((name) => ({ title: name, file: fileByTitle.get(normTitle(name)) })));

  history[histKey] = { buildId: id, lastRunAt: new Date().toISOString(), origTotal, origFailed, nowPassing, stillFailed: newFailed, allPassed: newFailed === 0, failedNames: stillFailedNames, resultsUrl };
  history.__lastBuild = histKey; writeHistory(history);

  console.log('\nRe-ran ' + origFailed + ' failed → ' + nowPassing + ' passed, ' + newFailed + ' still failing.');
  await sendWebhook(text);
})();
