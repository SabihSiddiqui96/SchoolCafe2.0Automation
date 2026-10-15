#!/usr/bin/env node
/**
 * Daily unattended re-run of the latest nightly build's failed tests.
 *
 * Finds the most recent test run and, if it had failures, hands the build id to
 * rerun-failed.js. Written for Task Scheduler (9 AM daily, retrying through the
 * day and catching up after the machine wakes), so it must never block on input
 * and never post anything misleading when the machine isn't fit to run.
 *
 * THE PIPELINE POSTS FIRST, THIS SCRIPT CORRECTS IT. The pipeline's Notify stage
 * runs on always(), so the channel gets the raw 3am count pass or fail. That number
 * still contains the flakes. This script re-runs only the failed set and posts the
 * honest count after it, so a bad morning reads "N failed" and then "M failed"
 * rather than going quiet until someone looks. Anything left under "Failed Tests"
 * survived a re-run, so a genuine defect stays visible daily instead of being lost
 * among flakes.
 *
 * Guards, in order, each of which exits rather than running:
 *   1. Nothing to do — the latest build had no failures (the pipeline announced it).
 *   2. Already handled — that build is in the re-run ledger, so a scheduled
 *      double-fire, a retry, or a manual run earlier in the day can't repeat it.
 *   3. Connectivity — qa.perseusedge.com must resolve. A run without internet up
 *      fails every test on getaddrinfo and posts false "N failed" to RingCentral.
 *      This path posts the raw build numbers marked "NOT re-run" (once per build,
 *      tracked in .auto-rerun-notified.json) and leaves the ledger untouched so
 *      the next retry — or the catch-up firing after the machine wakes — still
 *      does the real re-run.
 *
 * The run is fetched BEFORE the connectivity check on purpose: dev.azure.com is
 * reachable even when QA isn't, so the fallback message can carry
 * real build numbers instead of going silent.
 *
 * Usage:
 *   node scripts/auto-rerun-latest.js            # what Task Scheduler runs
 *   node scripts/auto-rerun-latest.js --dry-run  # decide and report, don't re-run
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const dns = require('dns');
const urlLib = require('url');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LOG_FILE = path.join(ROOT, '.auto-rerun.log');
const LEDGER = path.join(ROOT, '.rerun-history.json');
const NOTIFIED = path.join(ROOT, '.auto-rerun-notified.json');
const ORG = 'https://dev.azure.com/Cybersoft-Technologies-Inc/PrimeroEdge%20Classic';
const APP_HOST = 'qa.perseusedge.com';
// SchoolCafe (2488), CafeTV (2489), POS (2583) and SchoolCafe 2.0 (2642) all publish test runs into the
// same ADO project, minutes apart, so an unfiltered "latest run" picks whichever
// product finished last and re-runs its test names against this repo.
const BUILD_DEFINITION_ID = 2642;
const MAX_LOG_LINES = 1000;

function log(msg) {
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = `${stamp} ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

function trimLog() {
  try {
    const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n');
    if (lines.length > MAX_LOG_LINES) fs.writeFileSync(LOG_FILE, lines.slice(-MAX_LOG_LINES).join('\n'));
  } catch {}
}

function readEnvValue(key) {
  let text = '';
  try { text = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); } catch { return ''; }
  const line = text.split(/\r?\n/).find((l) => l.startsWith(key + '='));
  if (!line) return '';
  return line.slice(key.length + 1).replace(/#.*$/, '').trim().replace(/^["']|["']$/g, '');
}

function hostResolves(host) {
  return new Promise((resolve) => dns.lookup(host, (err) => resolve(!err)));
}

function apiGet(url, pat) {
  return new Promise((resolve, reject) => {
    const auth = 'Basic ' + Buffer.from(':' + pat).toString('base64');
    https.get(url, { headers: { Authorization: auth } }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    }).on('error', reject);
  });
}

async function latestRun(pat) {
  const from = new Date(Date.now() - 3 * 864e5).toISOString();
  const to = new Date().toISOString();
  const url = `${ORG}/_apis/test/runs?api-version=7.0&minLastUpdatedDate=${from}&maxLastUpdatedDate=${to}&$top=20`;
  const res = await apiGet(url, pat);
  if (res.status !== 200) {
    log(`ERROR: test runs API returned HTTP ${res.status}`);
    return null;
  }
  const runs = (JSON.parse(res.body).value || [])
    .filter((r) => r.completedDate)
    .filter((r) => (r.buildConfiguration || {}).buildDefinitionId === BUILD_DEFINITION_ID)
    .sort((a, b) => new Date(b.completedDate) - new Date(a.completedDate));
  if (!runs.length) return null;
  const r = runs[0];
  const buildId = (r.buildConfiguration && r.buildConfiguration.id) || (r.build && r.build.id);
  return { runId: r.id, buildId: String(buildId), completed: r.completedDate, total: r.totalTests, failed: r.unanalyzedTests };
}

function fallbackAlreadyPosted(buildId) {
  try { return !!JSON.parse(fs.readFileSync(NOTIFIED, 'utf8'))[String(buildId)]; } catch { return false; }
}

function markFallbackPosted(buildId) {
  let seen = {};
  try { seen = JSON.parse(fs.readFileSync(NOTIFIED, 'utf8')); } catch { seen = {}; }
  seen[String(buildId)] = new Date().toISOString();
  const keys = Object.keys(seen);
  if (keys.length > 30) for (const k of keys.slice(0, keys.length - 30)) delete seen[k];
  fs.writeFileSync(NOTIFIED, JSON.stringify(seen, null, 2));
}

function sendWebhook(text) {
  return new Promise((resolve) => {
    const webhookUrl = readEnvValue('RINGCENTRAL_WEBHOOK_URL');
    if (!webhookUrl) { log('no RINGCENTRAL_WEBHOOK_URL in .env - message not sent'); return resolve(); }
    const parsed = urlLib.parse(webhookUrl);
    const body = JSON.stringify({ text });
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => { log('fallback webhook sent, status: ' + res.statusCode); resolve(); },
    );
    req.on('error', (e) => { log('fallback webhook error: ' + e.message); resolve(); });
    req.write(body);
    req.end();
  });
}

function alreadyInLedger(buildId) {
  try {
    const h = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
    return Object.keys(h).some((k) => k.endsWith('/' + buildId));
  } catch { return false; }
}

(async () => {
  trimLog();
  const dryRun = process.argv.includes('--dry-run');
  log('--- auto-rerun starting ---');

  const pat = readEnvValue('AZURE_DEVOPS_PAT');
  if (!pat) { log('SKIP: AZURE_DEVOPS_PAT not found in .env.'); return; }

  const run = await latestRun(pat);
  if (!run) { log('SKIP: no completed test run found in the last 3 days.'); return; }
  log(`Latest: build ${run.buildId} (${run.completed.slice(0, 16)}) - ${run.failed} failed of ${run.total}.`);

  // Guard 1: nothing to do. A clean build is announced by the pipeline itself.
  if (!run.failed) { log('SKIP: that build had no failures.'); return; }

  // Guard 2: don't re-run what's already been re-run.
  if (alreadyInLedger(run.buildId)) {
    log(`SKIP: build ${run.buildId} is already in the re-run ledger.`);
    return;
  }

  // Guard 3: connectivity. Without the app reachable every test dies on DNS.
  if (!(await hostResolves(APP_HOST))) {
    if (fallbackAlreadyPosted(run.buildId)) {
      log(`${APP_HOST} still does not resolve. Already notified for build ${run.buildId}; staying quiet.`);
      return;
    }
    log(`${APP_HOST} does not resolve. Posting un-re-run build numbers.`);
    if (!dryRun) {
      const resultsUrl = `${ORG}/_build/results?buildId=${run.buildId}&view=ms.vss-test-web.build-test-results-tab`;
      const passed = run.total - run.failed;
      const pct = (n) => (run.total ? Math.round((n / run.total) * 100) : 0);
      await sendWebhook(
        `**CafeTV Automation - nightly build results**\n\n` +
        '```\n' +
        `✅ Passed:   ${passed} (${pct(passed)}%)\n` +
        `❌ Failed:   ${run.failed} (${pct(run.failed)}%)\n` +
        `\u{1F4CA} Total:    ${run.total}\n` +
        '```\n\n' +
        `⚠️ NOT re-run - ${APP_HOST} was unreachable (internet/VPN down or machine offline). ` +
        `Flaky failures have NOT been filtered out yet. The re-run will fire automatically ` +
        `once this machine is back on the network, and an updated message will follow.\n\n` +
        `Original run: ${resultsUrl}`,
      );
      markFallbackPosted(run.buildId);
    }
    return;
  }
  log(`${APP_HOST} resolves — connectivity confirmed.`);

  if (dryRun) { log(`DRY RUN: would re-run ${run.failed} test(s) from build ${run.buildId}.`); return; }

  log(`Re-running ${run.failed} failed test(s) from build ${run.buildId}...`);
  // --no-start-webhook: exactly ONE message per day reaches the channel, at the end,
  // carrying the post-re-run numbers.
  const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'rerun-failed.js'), run.buildId, '--no-start-webhook'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const relay = (buf) => String(buf).split(/\r?\n/).forEach((l) => { if (l.trim()) log('  ' + l.trim()); });
  child.stdout.on('data', relay);
  child.stderr.on('data', relay);
  child.on('close', (code) => log(`--- auto-rerun finished, rerun-failed.js exit ${code} ---`));
})();
