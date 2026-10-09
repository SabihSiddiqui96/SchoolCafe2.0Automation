#!/usr/bin/env node
/** Read-only Azure DevOps work-item fetcher used by the `regression` workflow to validate a */
const fs = require('fs');
const path = require('path');
const https = require('https');

const DEFAULT_ORG = 'Cybersoft-Technologies-Inc';
const DEFAULT_PROJECT = 'PrimeroEdge Classic';
const API_VERSION = '7.0';

function readPatFromEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  let text = '';
  try {
    text = fs.readFileSync(envPath, 'utf8');
  } catch {
    fail('Could not read .env at ' + envPath);
  }
  const line = text.split(/\r?\n/).find((l) => /^AZURE_DEVOPS_PAT=/.test(l));
  if (!line) fail('AZURE_DEVOPS_PAT not found in .env — add AZURE_DEVOPS_PAT=<token>.');
  return line.replace(/^AZURE_DEVOPS_PAT=/, '').trim().replace(/^["']|["']$/g, '');
}

function parseArg(arg) {
  if (!arg) fail('Provide a work item ID or ADO URL.');
  const urlMatch = arg.match(
    /dev\.azure\.com\/([^/]+)\/([^/]+)\/_workitems\/edit\/(\d+)/i,
  );
  if (urlMatch) {
    return {
      org: decodeURIComponent(urlMatch[1]),
      project: decodeURIComponent(urlMatch[2]),
      id: urlMatch[3],
    };
  }
  const idMatch = arg.match(/(\d+)/);
  if (!idMatch) fail('Could not extract a work item ID from: ' + arg);
  return { org: DEFAULT_ORG, project: DEFAULT_PROJECT, id: idMatch[1] };
}

function fail(msg) {
  console.error('ERROR: ' + msg);
  process.exit(1);
}

function get(url, pat) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(':' + pat).toString('base64');
    https
      .get(url, { headers: { Authorization: 'Basic ' + auth } }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      })
      .on('error', reject);
  });
}

function decodeEntities(s) {
  return (s || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

function strip(s) {
  return decodeEntities(s)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ ]+/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function printSteps(stepsXml) {
  const stepRe = /<step[^>]*>([\s\S]*?)<\/step>/gi;
  let m;
  let i = 0;
  while ((m = stepRe.exec(stepsXml))) {
    i++;
    const params = [
      ...m[1].matchAll(
        /<parameterizedString[^>]*>([\s\S]*?)<\/parameterizedString>/gi,
      ),
    ].map((x) => strip(x[1]));
    const action = (params[0] || '').trim();
    const expected = (params[1] || '').trim();
    if (!action && !expected) continue;
    console.log('STEP ' + i + ' ACTION:\n' + action);
    if (expected) console.log('EXPECTED:\n' + expected);
    console.log('');
  }
}

(async () => {
  const pat = readPatFromEnv();
  const { org, project, id } = parseArg(process.argv[2]);
  const base = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(
    project,
  )}`;
  const url = `${base}/_apis/wit/workitems/${id}?$expand=all&api-version=${API_VERSION}`;

  const res = await get(url, pat);
  if (res.status !== 200) {
    fail(`HTTP ${res.status} fetching work item ${id}. Body: ${res.body.slice(0, 300)}`);
  }
  const fields = (JSON.parse(res.body).fields) || {};
  const type = fields['System.WorkItemType'] || '(unknown)';
  const title = fields['System.Title'] || '(no title)';
  const state = fields['System.State'] || '(no state)';

  console.log('ID:', id);
  console.log('TYPE:', type);
  console.log('TITLE:', title);
  console.log('STATE:', state);

  if (type !== 'Test Case') {
    console.log('');
    console.log(
      `WRONG_LINK: This is a "${type}", not a Test Case. Ask the user to resend the Test Case link.`,
    );
    return;
  }

  const stepsXml = fields['Microsoft.VSTS.TCM.Steps'] || '';
  console.log('');
  console.log('=== STEPS ===');
  if (stepsXml) printSteps(stepsXml);
  else console.log('(no steps found on this Test Case)');
})();
