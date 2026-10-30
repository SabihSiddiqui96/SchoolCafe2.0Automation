// Professional Standards - Training Templates

import { test, expect, Page } from '@playwright/test';
import {
    AUTOMATION_PREFIX,
    automationNames,
    closeHistory,
    createCertificate,
    dialog,
    loginToSchoolCafe2,
    toast,
} from '../../utils/professionalStandards';
import {
    addTopicWithSubTopic,
    advancedButton,
    chooseFrom,
    cleanUp,
    clearFilters,
    closePanel,
    createTemplate,
    dropdown,
    firstSites,
    nameField,
    newTemplate,
    openIcon,
    openTemplates,
    resetFilters,
    search,
    setCertificateStatus,
    setSourceAndMethodStatus,
    setSubTopicStatus,
    siteName,
} from '../../utils/trainingTemplates';

// --- Locators
const HELPER_TEXT =
    'Training templates appear as tiles on Record Training. ' +
    'Only active templates show there; inactive ones stay here so they can be turned back on later.';
const historyIcon = (page: Page, name: string) => page.getByRole('button', { name: `History for ${name}`, exact: true });
const trashIcon = (page: Page, name: string) => page.getByRole('button', { name: `Delete ${name}`, exact: true });
const statusPill = (page: Page, name: string) => page.getByRole('switch', { name: `${name} status`, exact: true });
const row = (page: Page, name: string) => page.getByRole('row').filter({ has: openIcon(page, name) });
const tooltip = (page: Page) => page.getByRole('tooltip');
// --- Helpers
/** Lists the names of this run's templates in the order the grid shows them. */
async function listed(page: Page, names: string[]): Promise<string[]> {
    const all = await page.getByRole('button', { name: /^Open / }).evaluateAll((e) => e.map((x) => (x.getAttribute('aria-label') ?? '').replace(/^Open /, '')));
    return all.filter((n) => names.includes(n));
}

async function openAdvanced(page: Page): Promise<void> {
    if (!(await closePanel(page).count())) await advancedButton(page).click();
    await expect(closePanel(page)).toBeVisible();
}

const filterButton = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).first();

// --- Sections
async function pageAndList(page: Page): Promise<void> {
    await test.step('Page shows the helper text, search, filters and columns', async () => {
        await expect(page.getByText('Training Templates', { exact: true }).first()).toBeVisible();
        await expect(page.getByText(HELPER_TEXT)).toBeVisible();
        await expect(search(page)).toBeVisible();
        await expect(advancedButton(page)).toContainText('Advanced search');
        await expect(dropdown(page, 'Status')).toContainText('All');
        await expect(newTemplate(page)).toBeVisible();
        for (const column of ['Training template', 'Usage', 'Mandatory', 'Status', 'Actions']) await expect(page.getByText(column, { exact: true }).first()).toBeVisible();
    });

    await test.step('An empty list says there are no templates yet', async () => {
        if (!(await page.getByRole('button', { name: /^Open / }).count())) await expect(page.locator('main')).toContainText('No training templates yet.');
    });
}

async function creatingTemplates(page: Page, t: Record<'mandatory' | 'plain' | 'limited', string>, topics: Record<'mandatory' | 'plain' | 'limited', string>, certificate: string): Promise<void> {
    const [oneSite, twoSites] = [await firstSites(page, 1), await firstSites(page, 2)];

    await test.step('Saving a template returns to the list with a toast', async () => {
        await createTemplate(page, { name: t.mandatory, hours: 0.5, topic: topics.mandatory, mandatory: true, certificate });
        await createTemplate(page, { name: t.plain, hours: 1.5, topic: topics.plain, sites: twoSites });
        await createTemplate(page, { name: t.limited, hours: 3, topic: topics.limited, source: 'USDA', method: 'Online', sites: oneSite });
        await expect(newTemplate(page)).toBeVisible();
    });

    await test.step('Each row shows its icon, usage chip, status and actions, and mandatory templates a chip', async () => {
        for (const name of Object.values(t)) {
            const r = row(page, name);
            await expect(r).toContainText('Not yet used');
            await expect(statusPill(page, name)).toBeChecked();
            await expect(historyIcon(page, name)).toBeVisible();
            await expect(trashIcon(page, name)).toBeVisible();
            await expect(r.locator('svg').first()).toBeVisible();
        }
        await expect(row(page, t.mandatory)).toContainText('Mandatory');
        await expect(row(page, t.plain)).not.toContainText('Mandatory');
    });

    await test.step('Site-limited templates name the site, or the number of sites, beside the name', async () => {
        await expect(row(page, t.limited)).toContainText(`· ${siteName(oneSite[0])} only`);
        await expect(row(page, t.plain)).toContainText('· 2 sites');
        await row(page, t.plain).getByText('· 2 sites').hover();
        for (const site of twoSites) await expect(tooltip(page)).toContainText(siteName(site));
    });
}

async function searchAndStatus(page: Page, t: Record<'mandatory' | 'plain' | 'limited', string>): Promise<void> {
    await test.step('Search matches part of a name and says when nothing matches', async () => {
        await search(page).fill(t.plain.toLowerCase());
        await expect.poll(() => listed(page, Object.values(t))).toEqual([t.plain]);
        await search(page).fill(`${AUTOMATION_PREFIX}NoSuchTemplate`);
        await expect(page.locator('main')).toContainText('No templates match these filters.');
        await search(page).fill('');
        await expect.poll(async () => (await listed(page, Object.values(t))).length).toBe(3);
    });

    await test.step('Status offers All, Active and Inactive and splits the list', async () => {
        await dropdown(page, 'Status').click();
        await expect(page.getByRole('option')).toHaveText(['All', 'Active', 'Inactive']);
        await page.keyboard.press('Escape');
        await statusPill(page, t.plain).click();
        await expect(toast(page, `"${t.plain}" is now inactive`).first()).toBeVisible();
        await chooseFrom(page, dropdown(page, 'Status'), 'Inactive');
        await expect.poll(() => listed(page, Object.values(t))).toEqual([t.plain]);
        await chooseFrom(page, dropdown(page, 'Status'), 'Active');
        await expect.poll(async () => (await listed(page, Object.values(t))).includes(t.plain)).toBe(false);
        await chooseFrom(page, dropdown(page, 'Status'), 'All');
        await statusPill(page, t.plain).click();
        await expect(toast(page, `"${t.plain}" is now active`).first()).toBeVisible();
    });
}

async function statusPills(page: Page, name: string): Promise<void> {
    await test.step('A status pill changes at once with no dialog and a hint on hover', async () => {
        await statusPill(page, name).hover();
        await expect(tooltip(page)).toContainText('Click to change status');
        await statusPill(page, name).click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(toast(page, `"${name}" is now inactive`).first()).toBeVisible();
        await expect(statusPill(page, name)).not.toBeChecked();
        await statusPill(page, name).click();
        await expect(toast(page, `"${name}" is now active`).first()).toBeVisible();
        await expect(statusPill(page, name)).toBeChecked();
    });
}

async function advancedSearch(page: Page, t: Record<'mandatory' | 'plain' | 'limited', string>): Promise<void> {
    const mine = Object.values(t);

    await test.step('The panel offers the filter buttons and dropdowns', async () => {
        await openAdvanced(page);
        const panel = page.locator('main');
        for (const label of ['Key area', 'CEU hours', 'Times used', 'Last used', 'Mandatory']) await expect(panel).toContainText(label);
        for (const label of ['No CEU hours', 'Under 1', '1 to 2', 'Over 2', 'Never used', '3 to 5', '6 or more', 'Last 30 days', 'Last 90 days', 'Not used in 90+ days', 'Not mandatory']) {
            await expect(filterButton(page, label)).toBeVisible();
        }
        for (const label of ['Exceptions', 'Certificate', 'Sub-topic', 'Sort by']) await expect(dropdown(page, label)).toBeVisible();
    });

    await test.step('Selecting a button filters the list and selecting it again clears it', async () => {
        await filterButton(page, 'Over 2').click();
        await expect.poll(() => listed(page, mine)).toEqual([t.limited]);
        await expect(advancedButton(page)).toContainText('(1)');
        await filterButton(page, 'Over 2').click();
        await expect.poll(async () => (await listed(page, mine)).length).toBe(3);
    });

    await test.step('Hours and Mandatory buttons split the list', async () => {
        await filterButton(page, 'Under 1').click();
        await expect.poll(() => listed(page, mine)).toEqual([t.mandatory]);
        await filterButton(page, 'Under 1').click();
        await filterButton(page, '1 to 2').click();
        await expect.poll(() => listed(page, mine)).toEqual([t.plain]);
        await filterButton(page, '1 to 2').click();
        await filterButton(page, 'Mandatory').click();
        await expect.poll(() => listed(page, mine)).toEqual([t.mandatory]);
        await filterButton(page, 'Mandatory').click();
        await filterButton(page, 'Not mandatory').click();
        await expect.poll(async () => (await listed(page, mine)).sort()).toEqual([t.plain, t.limited].sort());
        await filterButton(page, 'Not mandatory').click();
    });

    await test.step('The button counts the filters and the list shows how many are showing', async () => {
        await filterButton(page, 'Over 2').click();
        await filterButton(page, 'Mandatory').click();
        await expect(advancedButton(page)).toContainText('(2)');
        await expect(page.locator('main')).toContainText(/Showing 0 of \d+ templates/);
        await expect(clearFilters(page)).toBeVisible();
    });

    await test.step('Closing the panel keeps a note, and Clear filters clears everything', async () => {
        await closePanel(page).click();
        await expect(page.locator('main')).toContainText(/Filters applied: showing 0 of \d+ templates/);
        await resetFilters(page);
        await expect(advancedButton(page)).not.toContainText('(');
        await expect.poll(async () => (await listed(page, mine)).length).toBe(3);
    });
}

async function sorting(page: Page, t: Record<'mandatory' | 'plain' | 'limited', string>): Promise<void> {
    const mine = Object.values(t);

    await test.step('Sort by defaults to Recently updated and lists its options', async () => {
        await openAdvanced(page);
        await expect(dropdown(page, 'Sort by')).toContainText('Recently updated');
        await dropdown(page, 'Sort by').click();
        await expect(page.getByRole('option')).toHaveText([
            'Most used',
            'Least used',
            'Recently used',
            'Recently created',
            'Recently updated',
            'Name A to Z',
            'Hours: high to low',
            'Hours: low to high',
        ]);
        await page.keyboard.press('Escape');
    });

    await test.step('Name and hours sorts reorder the list', async () => {
        await chooseFrom(page, dropdown(page, 'Sort by'), 'Name A to Z');
        await expect.poll(() => listed(page, mine)).toEqual([...mine].sort());
        await chooseFrom(page, dropdown(page, 'Sort by'), 'Hours: high to low');
        await expect.poll(() => listed(page, mine)).toEqual([t.limited, t.plain, t.mandatory]);
        await chooseFrom(page, dropdown(page, 'Sort by'), 'Hours: low to high');
        await expect.poll(() => listed(page, mine)).toEqual([t.mandatory, t.plain, t.limited]);
        await chooseFrom(page, dropdown(page, 'Sort by'), 'Recently updated');
    });
}

async function dropdowns(page: Page, t: Record<'mandatory' | 'plain' | 'limited', string>, certificate: string, subTopic: string): Promise<void> {
    const mine = Object.values(t);

    await test.step('Certificate lists Any, the two certificate filters and each certificate, and filters', async () => {
        await openAdvanced(page);
        await dropdown(page, 'Certificate').click();
        const options = await page.getByRole('option').allInnerTexts();
        expect(options.slice(0, 3)).toEqual(['Any', 'Awards a certificate', 'No certificate']);
        expect(options).toContain(certificate);
        await page.getByRole('option', { name: 'Awards a certificate', exact: true }).click();
        await expect.poll(() => listed(page, mine)).toEqual([t.mandatory]);
        await chooseFrom(page, dropdown(page, 'Certificate'), 'No certificate');
        await expect.poll(async () => (await listed(page, mine)).sort()).toEqual([t.plain, t.limited].sort());
        await chooseFrom(page, dropdown(page, 'Certificate'), certificate);
        await expect.poll(() => listed(page, mine)).toEqual([t.mandatory]);
        await chooseFrom(page, dropdown(page, 'Certificate'), 'Any');
    });

    await test.step('Sub-topic groups topics by key area as code and name', async () => {
        await dropdown(page, 'Sub-topic').click();
        const options = await page.getByRole('option').allInnerTexts();
        expect(options.some((o) => /^\d+\s+·\s+\S/.test(o))).toBe(true);
        expect(options.some((o) => o.includes(subTopic))).toBe(true);
        await page.keyboard.press('Escape');
    });

    await test.step('Sites shows the templates available at a chosen site', async () => {
        const sites = dropdown(page, 'Sites');
        await sites.click();
        const options = await page.getByRole('option').allInnerTexts();
        await page.getByRole('option', { name: options[0].trim(), exact: true }).click();
        await page.keyboard.press('Escape');
        await expect.poll(async () => (await listed(page, mine)).includes(t.limited)).toBe(true);
        await resetFilters(page);
    });
}

async function exceptions(page: Page, t: Record<'mandatory' | 'plain' | 'limited' | 'subTopic', string>, certificate: string, subTopicOwner: string): Promise<void> {
    const mine = Object.values(t);

    await test.step('An inactive certificate puts a warning on its template and marks the dropdown', async () => {
        await setCertificateStatus(page, certificate, 'Inactive');
        await openTemplates(page);
        await row(page, t.mandatory).getByLabel(/needs attention/i).hover();
        await expect(tooltip(page)).toContainText('Needs attention: Inactive certificate');
        await openAdvanced(page);
        await dropdown(page, 'Certificate').click();
        await expect(page.getByRole('option', { name: `${certificate} (inactive)`, exact: true })).toBeVisible();
        await page.keyboard.press('Escape');
    });

    await test.step('An inactive source and method add their own reasons', async () => {
        await setSourceAndMethodStatus(page, 'Inactive');
        await openTemplates(page);
        await row(page, t.limited).getByLabel(/needs attention/i).hover();
        await expect(tooltip(page)).toContainText('Needs attention: Inactive training source, Inactive training method');
    });

    await test.step('An inactive sub-topic adds a reason and the Sub-topic dropdown marks it', async () => {
        await setSubTopicStatus(page, subTopicOwner, t.subTopic, 'Inactive');
        await openTemplates(page);
        await row(page, t.plain).getByLabel(/needs attention/i).hover();
        await expect(tooltip(page)).toContainText('Needs attention: Inactive sub-topic');
        await openAdvanced(page);
        await dropdown(page, 'Sub-topic').click();
        await expect(page.getByRole('option').filter({ hasText: `${t.subTopic} (inactive)` })).toBeVisible();
        await page.keyboard.press('Escape');
    });

    await test.step('Exceptions offers its options and each one filters', async () => {
        await dropdown(page, 'Exceptions').click();
        const options = await page.getByRole('option').allInnerTexts();
        for (const option of ['Any', 'Has an exception', 'Inactive certificate', 'Inactive sub-topic', 'Inactive source or method', 'No exceptions']) expect(options).toContain(option);
        await page.getByRole('option', { name: 'Inactive certificate', exact: true }).click();
        await expect.poll(() => listed(page, mine)).toEqual([t.mandatory]);
        await chooseFrom(page, dropdown(page, 'Exceptions'), 'Inactive source or method');
        await expect.poll(() => listed(page, mine)).toEqual([t.limited]);
        await chooseFrom(page, dropdown(page, 'Exceptions'), 'Inactive sub-topic');
        await expect.poll(() => listed(page, mine)).toEqual([t.plain]);
        await chooseFrom(page, dropdown(page, 'Exceptions'), 'No exceptions');
        await expect.poll(async () => (await listed(page, mine)).length).toBe(0);
        await chooseFrom(page, dropdown(page, 'Exceptions'), 'Has an exception');
        await expect.poll(async () => (await listed(page, mine)).length).toBe(3);
        await resetFilters(page);
    });
}

async function openAndCancel(page: Page, name: string, other: string): Promise<void> {
    await test.step('Opening a template and cancelling returns to the list with its row highlighted', async () => {
        await openIcon(page, name).click();
        await expect(nameField(page)).toHaveValue(name);
        await page.getByRole('button', { name: '← Cancel' }).click();
        await expect(newTemplate(page)).toBeVisible();
        const background = (n: string) =>
            row(page, n).evaluate((e) => [e, ...Array.from(e.querySelectorAll('td'))].map((x) => getComputedStyle(x).backgroundColor).join('|'));
        await expect.poll(async () => (await background(name)) !== (await background(other))).toBe(true);
    });
}

async function history(page: Page, name: string): Promise<void> {
    await test.step('A row history lists what happened to the template', async () => {
        await historyIcon(page, name).click();
        const panel = page.getByRole('dialog').last();
        await expect(panel).toContainText(`${name} - History`);
        for (const column of ['Performed By', 'Date', 'Performed Action']) await expect(panel).toContainText(column);
        await expect(panel.getByText('Training template added', { exact: true }).first()).toBeVisible();
        await expect(panel.getByText('Training template deactivated', { exact: true }).first()).toBeVisible();
        await expect(panel.getByText('Training template activated', { exact: true }).first()).toBeVisible();
        await closeHistory(page);
    });
}

async function deleting(page: Page, name: string, topic: string): Promise<void> {
    await test.step('The trash icon asks first and Cancel keeps the template', async () => {
        await createTemplate(page, { name, hours: 2, topic });
        await trashIcon(page, name).click();
        await expect(dialog(page)).toContainText('Delete training template');
        await expect(dialog(page)).toContainText(`Are you sure you want to delete "${name}"? This can't be undone.`);
        await dialog(page).getByText(/^cancel$/i).click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(openIcon(page, name)).toBeVisible();
    });

    await test.step('Yes, delete removes the template with a toast', async () => {
        await trashIcon(page, name).click();
        await dialog(page).getByText(/yes, delete/i).click();
        await expect(toast(page, `"${name}" deleted`).first()).toBeVisible();
        await expect(openIcon(page, name)).toHaveCount(0);
    });
}

// --- Test
test('T-77392 Training Templates', async ({ page }) => {
    test.setTimeout(900000);
    await loginToSchoolCafe2(page);

    const [mandatory, plain, limited, topic, subTopic, spare] = automationNames(6);
    const t = { mandatory, plain, limited };
    const codes = { mandatory: '1110', plain: subTopic, limited: '2110' };

    let passed = false;
    try {
        await cleanUp(page);
        await addTopicWithSubTopic(page, topic, subTopic);
        const certificate = await createCertificate(page);
        await openTemplates(page);

        await test.step('Page, helper text and list', () => pageAndList(page));
        await test.step('Creating templates', () => creatingTemplates(page, t, codes, certificate));
        await test.step('Search and the Status filter', () => searchAndStatus(page, t));
        await test.step('Status pills', () => statusPills(page, plain));
        await test.step('Advanced search', () => advancedSearch(page, t));
        await test.step('Sorting', () => sorting(page, t));
        await test.step('Certificate, sub-topic and sites dropdowns', () => dropdowns(page, t, certificate, subTopic));
        await test.step('Exceptions', () => exceptions(page, { ...t, subTopic }, certificate, topic));
        await test.step('Opening a template', () => openAndCancel(page, limited, plain));
        await test.step('History', () => history(page, plain));
        await test.step('Deleting a template', () => deleting(page, spare, '4110'));
        passed = true;
    } finally {
        // a failed run keeps its own error instead of the cleanup's
        await cleanUp(page).catch((error) => {
            if (passed) throw error;
        });
    }
});
