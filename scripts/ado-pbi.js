#!/usr/bin/env node
/** Read-only Azure DevOps PBI reader */
const fs = require('fs');
const path = require('path');
const https = require('https');

const DEFAULT_ORG = 'Cybersoft-Technologies-Inc';
const DEFAULT_PROJECT = 'PrimeroEdge Classic';
const API_VERSION = '7.0';

function fail(msg) {
  console.error('ERROR: ' + msg);
  process.exit(1);
}

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
  const urlMatch = arg.match(/dev\.azure\.com\/([^/]+)\/([^/]+)\/_workitems\/edit\/(\d+)/i);
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

function get(url, pat) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(':' + pat).toString('base64');
    https
      .get(url, { headers: { Authorization: 'Basic ' + auth, Accept: 'application/json' } }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`HTTP ${res.statusCode} for ${url}\n${body.slice(0, 300)}`));
          }
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error('Bad JSON from ' + url));
          }
        });
      })
      .on('error', reject);
  });
}

/** Strip HTML to readable plain text, preserving list/line structure. */
function toText(html) {
  if (!html) return '';
  return String(html)
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*(div|p|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

(async () => {
  const pat = readPatFromEnv();
  const { org, project, id } = parseArg(process.argv[2]);
  const base = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/wit`;

  const item = await get(`${base}/workitems/${id}?$expand=all&api-version=${API_VERSION}`, pat);
  const f = item.fields || {};

  console.log(`ID: ${id}`);
  console.log(`TYPE: ${f['System.WorkItemType']}`);
  console.log(`TITLE: ${f['System.Title']}`);
  console.log(`STATE: ${f['System.State']}`);
  console.log(`ASSIGNED: ${f['System.AssignedTo']?.displayName ?? '(unassigned)'}`);

  const desc = toText(f['System.Description']);
  console.log('\n--- DESCRIPTION ---\n' + (desc || '(empty)'));

  const ac = toText(f['Microsoft.VSTS.Common.AcceptanceCriteria']);
  if (ac) console.log('\n--- ACCEPTANCE CRITERIA ---\n' + ac);

  const repro = toText(f['Microsoft.VSTS.TCM.ReproSteps']);
  if (repro) console.log('\n--- REPRO STEPS ---\n' + repro);

  // Child / related links — the "QA - <title>" child is needed in Phase 4.
  const rels = (item.relations || []).filter((r) => /Hierarchy-Forward|Related/i.test(r.rel || ''));
  if (rels.length) {
    console.log('\n--- LINKS ---');
    for (const r of rels) {
      const linkedId = (r.url || '').split('/').pop();
      let title = '';
      let type = '';
      try {
        const child = await get(`${base}/workitems/${linkedId}?api-version=${API_VERSION}`, pat);
        title = child.fields?.['System.Title'] ?? '';
        type = child.fields?.['System.WorkItemType'] ?? '';
      } catch {
        title = '(could not fetch)';
      }
      console.log(`${r.rel.includes('Hierarchy-Forward') ? 'CHILD' : 'RELATED'} ${linkedId} [${type}] ${title}`);
    }
  }

  const comments = await get(
    `${base}/workItems/${id}/comments?api-version=7.1-preview.3&$top=200`,
    pat,
  );
  const list = comments.comments || [];
  console.log(`\n--- COMMENTS (${list.length}) ---`);
  for (const c of list) {
    const who = c.createdBy?.displayName ?? '?';
    const when = (c.createdDate ?? '').slice(0, 10);
    console.log(`\n[#${c.id}] ${who} — ${when}\n${toText(c.text)}`);
  }
})().catch((e) => fail(e.message));
