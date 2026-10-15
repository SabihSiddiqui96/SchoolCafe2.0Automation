#!/usr/bin/env node
/** Unattended triage of whatever is still failing after the morning re-run. */
const fs = require('fs');
const path = require('path');
const dns = require('dns');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LEDGER = path.join(ROOT, '.rerun-history.json');
const TRIAGED = path.join(ROOT, '.auto-triage-done.json');
const LOG_FILE = path.join(ROOT, '.auto-triage.log');
const APP_HOST = 'qa.perseusedge.com';

function log(msg) {
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = `${stamp} ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function hostResolves(host) {
  return new Promise((resolve) => dns.lookup(host, (err) => resolve(!err)));
}

function latestLedgerEntry() {
  const h = readJson(LEDGER, null);
  if (!h) return null;
  const key = h.__lastBuild;
  if (!key || !h[key]) return null;
  return { key, entry: h[key] };
}

const PROMPT = (buildId, names) => `The SchoolCafe 2.0 nightly build ${buildId} was re-run this morning and these tests are STILL failing:

${names.map((n, i) => `${i + 1}. ${n}`).join('\n')}

Follow the "When a build has failures, triage them" rule in CLAUDE.md.

In short: work out why each one actually failed (read the error and the page
snapshot in test-results/*/error-context.md - do not guess from the test name).
Rule out the environment first: getaddrinfo ENOTFOUND means the tunnel dropped and
the test never ran, and the SSO interstitial means the app never loaded - neither
is a real failure. Fix what is test-side. Do not modify a test to hide a genuine
application defect, and before calling something an app bug prove the app did the
wrong thing on this run - a stateful test can fail forever on its own leftover
data and look exactly like a product bug.

Then re-run the failures with: node scripts/rerun-failed.js --force
so the updated numbers go out, then raise or update the PR and write the ticket comment
if you fixed anything, and commit and push everything you changed.`;

(async () => {
  const dryRun = process.argv.includes('--dry-run');
  log('--- auto-triage starting ---');

  const latest = latestLedgerEntry();
  if (!latest) { log('SKIP: no ledger entry to read.'); return; }
  const { entry } = latest;
  const names = entry.failedNames || [];

  // Guard 1: nothing to do.
  if (!entry.stillFailed || !names.length) {
    log(`SKIP: build ${entry.buildId} has nothing still failing.`);
    return;
  }

  // Guard 2: one triage per build.
  const done = readJson(TRIAGED, {});
  if (done[entry.buildId]) {
    log(`SKIP: build ${entry.buildId} was already triaged at ${done[entry.buildId]}.`);
    return;
  }

  // Guard 3: the triage session needs to re-run tests, which needs the tunnel.
  if (!(await hostResolves(APP_HOST))) {
    log(`SKIP: ${APP_HOST} does not resolve - VPN down. Leaving it for the next fire.`);
    return;
  }

  const prompt = PROMPT(entry.buildId, names);
  if (dryRun) { log(`DRY RUN: would launch triage for build ${entry.buildId}:\n\n${prompt}\n`); return; }

  log(`launching triage session for build ${entry.buildId} (${names.length} still failing)...`);
  const child = spawn('claude', ['-p', prompt, '--permission-mode', 'bypassPermissions'], {
    cwd: ROOT,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const relay = (buf) => String(buf).split(/\r?\n/).forEach((l) => { if (l.trim()) log('  ' + l.trim()); });
  child.stdout.on('data', relay);
  child.stderr.on('data', relay);
  child.on('close', (code) => {
    // Marked regardless of exit code
    done[entry.buildId] = new Date().toISOString();
    const keys = Object.keys(done);
    if (keys.length > 60) for (const k of keys.slice(0, keys.length - 60)) delete done[k];
    fs.writeFileSync(TRIAGED, JSON.stringify(done, null, 2));
    log(`--- auto-triage finished, claude exit ${code} ---`);
  });
})();
