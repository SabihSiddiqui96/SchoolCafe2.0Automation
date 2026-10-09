#!/usr/bin/env node
/*
 * Creates or updates the ticket suites and test cases in the SchoolCafe 2.0 test plan.
 * Automated > Tickets Tests and Manual > Tickets, one suite and case per ticket.
 * Steps come from scripts/ticket-testcases.json. Usage:
 *   node scripts/create-ticket-testcase.js [--dry-run] ["Sites & Locations"]
 */

const fs = require('fs');
const path = require('path');

const API_VERSION = '7.1';
const DRY_RUN = process.argv.includes('--dry-run');

// --- Config
const ORG_URL = 'https://dev.azure.com/Cybersoft-Technologies-Inc';
const PROJECT = 'PrimeroEdge Classic';
const PLAN_ID = process.env.AZDO_PLAN_ID || '122541';
const ROOT_SUITE = process.env.AZDO_ROOT_SUITE || '122542';
const PBI = process.env.AZDO_PBI || '121540';
const TICKET_TAG = `T-${PBI}`;
const enc = encodeURIComponent;

const TICKETS = JSON.parse(fs.readFileSync(path.join(__dirname, 'ticket-testcases.json'), 'utf8'));
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const names = Object.keys(TICKETS).filter((n) => !only.length || only.includes(n));

// --- PAT + REST helpers
function readPat() {
    const text = fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8');
    const line = text.split(/\r?\n/).find((l) => /^AZURE_DEVOPS_PAT=/.test(l));
    if (!line) throw new Error('AZURE_DEVOPS_PAT not found in .env');
    return line.replace(/^AZURE_DEVOPS_PAT=/, '').trim().replace(/^["']|["']$/g, '');
}
const authHeader = 'Basic ' + Buffer.from(':' + readPat()).toString('base64');

async function api(method, url, body, contentType = 'application/json') {
    const res = await fetch(url, {
        method,
        headers: { Authorization: authHeader, 'Content-Type': contentType, Accept: 'application/json' },
        body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${url}\n -> ${res.status} ${res.statusText}\n${text.slice(0, 600)}`);
    return text ? JSON.parse(text) : null;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function buildStepsXml(steps) {
    let id = 2;
    const stepXml = steps
        .map((s) => {
            const xml =
                `<step id="${id}" type="ActionStep">` +
                `<parameterizedString isformatted="true">&lt;P&gt;${esc(s.action)}&lt;/P&gt;</parameterizedString>` +
                `<parameterizedString isformatted="true">&lt;P&gt;${esc(s.expected || '')}&lt;/P&gt;</parameterizedString>` +
                '<description/></step>';
            id++;
            return xml;
        })
        .join('');
    return `<steps id="0" last="${id - 1}">${stepXml}</steps>`;
}

const planUrl = `${ORG_URL}/${enc(PROJECT)}/_apis/testplan/Plans/${PLAN_ID}`;
const witUrl = `${ORG_URL}/${enc(PROJECT)}/_apis/wit/workitems`;

let suiteCache = null;
async function listSuites() {
    if (!suiteCache) suiteCache = (await api('GET', `${planUrl}/suites?api-version=${API_VERSION}`)).value || [];
    return suiteCache;
}

/** A static suite with this name under the parent; created when missing. */
async function ensureSuite(parentId, name) {
    const suites = await listSuites();
    const found = suites.find((s) => s.name === name && Number(s.parentSuite?.id) === Number(parentId));
    if (found) return { id: found.id, created: false };
    if (DRY_RUN) return { id: `(new ${name})`, created: true };
    const body = { suiteType: 'StaticTestSuite', name, parentSuite: { id: Number(parentId) } };
    const created = await api('POST', `${planUrl}/suites?api-version=7.1-preview.1`, body);
    suiteCache.push(created);
    return { id: created.id, created: true };
}

async function suiteCaseIds(suiteId) {
    if (typeof suiteId !== 'number') return [];
    const data = await api('GET', `${planUrl}/Suites/${suiteId}/TestCase?api-version=7.1-preview.3`);
    return (data.value || []).map((t) => Number(t.workItem?.id)).filter(Boolean);
}

async function reflectedFieldName() {
    const data = await api('GET', `${ORG_URL}/${enc(PROJECT)}/_apis/wit/fields?api-version=${API_VERSION}`);
    const match = (data.value || []).find(
        (f) => /reflected\s*work\s*item\s*id/i.test(f.name || '') || /reflectedworkitemid/i.test(f.referenceName || ''),
    );
    return match ? match.referenceName : 'Custom.ReflectedWorkItemId';
}

const caseFields = (title, steps, reflected) => {
    const ops = [
        { op: 'add', path: '/fields/System.Title', value: title },
        { op: 'add', path: '/fields/Microsoft.VSTS.TCM.Steps', value: buildStepsXml(steps) },
    ];
    if (reflected) ops.push({ op: 'add', path: `/fields/${reflected}`, value: 'N/A' });
    return ops;
};

async function saveCase(suiteId, title, steps, reflected) {
    const [existing] = await suiteCaseIds(suiteId);
    if (existing) {
        await api('PATCH', `${witUrl}/${existing}?api-version=${API_VERSION}`, caseFields(title, steps, reflected), 'application/json-patch+json');
        return { id: existing, action: 'updated' };
    }
    const wi = await api('POST', `${witUrl}/$Test%20Case?api-version=${API_VERSION}`, caseFields(title, steps, reflected), 'application/json-patch+json');
    await api('POST', `${planUrl}/Suites/${suiteId}/TestCase?api-version=7.1-preview.3`, [{ workItem: { id: wi.id } }]);
    return { id: wi.id, action: 'created' };
}

async function setReady(id) {
    await api('PATCH', `${witUrl}/${id}?api-version=${API_VERSION}`, [{ op: 'add', path: '/fields/System.State', value: 'Ready' }], 'application/json-patch+json');
}

const linkedId = (url) => Number(String(url).split('/').pop());

/** The QA task the cases are linked to (child of the PBI). */
async function findQaTask() {
    const id = Number(process.env.AZDO_QA_TASK || '121543');
    const task = await api('GET', `${witUrl}/${id}?api-version=${API_VERSION}`);
    return { id, title: task.fields?.['System.Title'] || '' };
}

async function linkCase(taskId, caseId) {
    const task = await api('GET', `${witUrl}/${taskId}?$expand=relations&api-version=${API_VERSION}`);
    const linked = (task.relations || []).some((r) => r.rel === 'System.LinkTypes.Related' && linkedId(r.url) === Number(caseId));
    if (linked) return 'already linked';
    const url = `${ORG_URL}/_apis/wit/workItems/${caseId}`;
    await api('PATCH', `${witUrl}/${taskId}?api-version=${API_VERSION}`, [{ op: 'add', path: '/relations/-', value: { rel: 'System.LinkTypes.Related', url } }], 'application/json-patch+json');
    return 'linked';
}

// --- Main
async function main() {
    console.log(`SchoolCafe 2.0 test-case creator ${DRY_RUN ? '(DRY RUN, read-only)' : ''}`);
    console.log(`Plan ${PLAN_ID}, root suite ${ROOT_SUITE}, tickets: ${names.join(', ')}\n`);

    const automatedFolder = await ensureSuite(ROOT_SUITE, 'Automated');
    const automatedTickets = await ensureSuite(automatedFolder.id, 'Tickets Tests');
    const manualFolder = await ensureSuite(ROOT_SUITE, 'Manual');
    const manualTickets = await ensureSuite(manualFolder.id, 'Tickets');
    console.log(`Automated > Tickets Tests: #${automatedTickets.id}${automatedTickets.created ? ' (new)' : ''}`);
    console.log(`Manual > Tickets:          #${manualTickets.id}${manualTickets.created ? ' (new)' : ''}\n`);

    const qaTask = await findQaTask();
    console.log(`QA task: #${qaTask.id} "${qaTask.title}"\n`);

    const reflected = DRY_RUN ? null : await reflectedFieldName();
    const caseIds = [];

    for (const name of names) {
        const { automated, manual } = TICKETS[name];
        const branches = [
            ['Automated', automatedTickets.id, automated],
            ['Manual', manualTickets.id, manual],
        ];
        for (const [tag, parentId, steps] of branches) {
            const title = `${TICKET_TAG}: ${name} [${tag}]`;
            if (DRY_RUN) {
                console.log(`${title} - ${steps.length} steps`);
                continue;
            }
            const suite = await ensureSuite(parentId, title);
            const saved = await saveCase(suite.id, title, steps, reflected);
            await setReady(saved.id).catch((e) => console.warn(`  (State=Ready on #${saved.id}: ${e.message.split('\n')[0]})`));
            caseIds.push(saved.id);
            console.log(`${title}: suite #${suite.id}${suite.created ? ' (new)' : ''}, case #${saved.id} ${saved.action}, ${steps.length} steps`);
            console.log(`   ${ORG_URL}/${enc(PROJECT)}/_workitems/edit/${saved.id}`);
        }
    }

    if (DRY_RUN || !qaTask) return console.log(DRY_RUN ? '\nDry run, no writes made.' : '\nNo QA task found, nothing linked.');
    console.log(`\nLinking to QA task #${qaTask.id}...`);
    for (const id of caseIds) console.log(`  case #${id}: ${await linkCase(qaTask.id, id)}`);
    console.log(`\nSuite: ${ORG_URL}/${enc(PROJECT)}/_testPlans/define?planId=${PLAN_ID}&suiteId=${ROOT_SUITE}`);
}

main().catch((err) => {
    console.error('\nFatal:', err.message);
    process.exit(1);
});
