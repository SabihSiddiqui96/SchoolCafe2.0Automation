// Professional Standards - Configuration - Sites & Locations

import { test, expect, Locator, Page } from '@playwright/test';
import {
    answerConfirmation,
    clickWhenSettled,
    closeHistory,
    dialog,
    loginToSchoolCafe2,
    openHistory,
    openProfessionalStandardsPage,
    toast,
    uniqueName,
    waitForPageReady,
} from '../../utils/professionalStandards';

// --- Locators
const PAGE_SIZE = 20;
const SITES_NOTE = 'Sites are defined in System > Sites & Users > Site Configuration, not here.';
const FILTERS = /^(All|Active|Inactive)$/;
const button = (page: Page, name: string | RegExp) => page.getByRole('button', { name });
const siteStatusFilter = (page: Page) => page.getByRole('combobox').filter({ hasText: FILTERS }).first();
const customStatusFilter = (page: Page) => page.getByRole('combobox').filter({ hasText: FILTERS }).last();
const addLocation = (page: Page) => button(page, 'Add custom location');
const nameField = (page: Page, name: string) => page.getByRole('textbox', { name: `Name ${name}`, exact: true });
const statusPill = (page: Page, name: string) => page.getByRole('button', { name: `${name} Status`, exact: true });
const deleteIcon = (page: Page, name: string) => page.getByRole('button', { name: `Delete ${name}`, exact: true });
const pager = (page: Page) => page.getByText(/\d+ - \d+ of \d+ items/);

type Site = { name: string; code: string; status: string };

// --- Helpers
/** The custom list fills in after the page - wait for rows or the empty message. */
async function waitForCustomList(page: Page): Promise<void> {
    await expect(
        page.getByText('No custom locations yet.').or(page.getByRole('textbox', { name: /^Name / }).first()),
    ).toBeVisible();
}

async function openSitesAndLocations(page: Page): Promise<void> {
    await loginToSchoolCafe2(page);
    await openProfessionalStandardsPage(page, 'Sites & Locations', addLocation(page));
    await waitForCustomList(page);
}

async function chooseFilter(page: Page, filter: (p: Page) => ReturnType<typeof siteStatusFilter>, option: string) {
    await filter(page).click();
    await page.getByRole('option', { name: option, exact: true }).click();
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await page.waitForLoadState('networkidle');
}

const siteRows = (page: Page) => page.getByRole('row').filter({ has: page.getByLabel('Managed in System') });

async function readSites(page: Page): Promise<Site[]> {
    return siteRows(page).evaluateAll((rows) =>
        rows.map((row) => {
            const cells = Array.from(row.querySelectorAll('td')).map((c) => c.textContent?.trim() ?? '');
            return { name: cells[0], code: cells[1], status: cells[2] };
        }),
    );
}

/** Waits for the Sites grid to stop changing after a filter or reload. */
async function settledSites(page: Page): Promise<Site[]> {
    let previous = '';
    await expect
        .poll(async () => {
            const current = JSON.stringify(await readSites(page));
            const settled = current === previous && current !== '[]';
            previous = current;
            return settled;
        }, { intervals: [600] })
        .toBe(true);
    return readSites(page);
}

async function addNamedLocation(page: Page, name: string): Promise<void> {
    const blank = page.getByRole('textbox', { name: 'Location name' });
    await expect(async () => {
        if (!(await blank.count())) await addLocation(page).click({ timeout: 3000 });
        await expect(blank).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 30000 });
    await blank.fill(name);
    await page.keyboard.press('Tab');
    await expect(toast(page, 'Custom location added').first()).toBeVisible();
}

async function removeLocation(page: Page, name: string): Promise<void> {
    await deleteIcon(page, name).click();
    await expect(dialog(page)).toContainText(`Are you sure you want to delete "${name}"? This action cannot be undone.`);
    await answerConfirmation(page, 'Yes');
    await expect(deleteIcon(page, name)).toHaveCount(0);
}

/** How many custom locations exist, from the pager when there is one. */
async function customLocationCount(page: Page): Promise<number> {
    await page.waitForLoadState('networkidle');
    const onPage = await button(page, /^Delete /).count();
    if (onPage < PAGE_SIZE) return onPage;
    await expect(pager(page)).toBeVisible();
    return Number(/of (\d+) items/.exec(await pager(page).innerText())![1]);
}

/** Last page range for a list of this size. */
function lastPageRange(total: number): string {
    const start = Math.floor((total - 1) / PAGE_SIZE) * PAGE_SIZE + 1;
    return `${start} - ${total} of ${total} items`;
}

/** Walks the pages until one shows the locator; false when none does. */
async function goToPageWith(page: Page, locator: Locator): Promise<boolean> {
    const pages = await button(page, /^Page \d+$/).count();
    if (!pages) return (await locator.count()) > 0;
    for (let n = 1; n <= pages; n++) {
        await button(page, `Page ${n}`).click();
        if (await locator.count()) return true;
    }
    return false;
}

/** Deletes every location whose name starts with the prefix, on whichever page it sits. */
async function cleanUp(page: Page, prefix: string): Promise<void> {
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.reload();
    await waitForPageReady(page, addLocation(page));
    await waitForCustomList(page);
    const mine = button(page, new RegExp(`^Delete ${prefix}`));
    for (let guard = 0; guard < 80 && (await goToPageWith(page, mine)); guard++) {
        const label = (await mine.first().getAttribute('aria-label')) ?? '';
        await removeLocation(page, label.replace(/^Delete /, ''));
        await page.waitForLoadState('networkidle');
    }
}

// --- Sections
async function pageAndManageSites(page: Page): Promise<void> {
    await test.step('Page leads with History and the helper note with its shortcut', async () => {
        await expect(button(page, 'History')).toBeVisible();
        await expect(page.getByText(SITES_NOTE)).toBeVisible();
        await expect(button(page, 'Manage Sites')).toBeVisible();
    });

    await test.step('Sites default to Active, locked and read-only', async () => {
        await expect(siteStatusFilter(page)).toHaveText('Active');
        await expect.poll(async () => (await readSites(page)).length).toBeGreaterThan(0);
        const sites = await readSites(page);
        for (const site of sites) expect(site.status, site.name).toBe('Active');
        await expect(page.getByText('Site', { exact: true })).toHaveCount(sites.length);
        await expect(page.getByLabel('Managed in System').first()).toBeVisible();
        for (const column of ['Name', 'Site code', 'Status']) {
            await expect(page.getByText(column, { exact: true }).first()).toBeVisible();
        }
        await expect(deleteIcon(page, sites[0].name)).toHaveCount(0);
        await expect(statusPill(page, sites[0].name)).toHaveCount(0);
        await expect(nameField(page, sites[0].name)).toHaveCount(0);
    });

    await test.step('Sites are listed alphabetically by name', async () => {
        const names = (await readSites(page)).map((s) => s.name);
        expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    });

    await test.step('Status filter offers all, active and inactive', async () => {
        await siteStatusFilter(page).click();
        await expect(page.getByRole('option')).toHaveText(['All', 'Active', 'Inactive']);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('listbox')).toHaveCount(0);
    });

    await test.step('Each filter shows only its own sites', async () => {
        await chooseFilter(page, siteStatusFilter, 'Inactive');
        for (const site of await settledSites(page)) expect(site.status, site.name).toBe('Inactive');
        await chooseFilter(page, siteStatusFilter, 'All');
        const all = await settledSites(page);
        await chooseFilter(page, siteStatusFilter, 'Active');
        const active = await settledSites(page);
        for (const site of active) expect(site.status, site.name).toBe('Active');
        expect(all.length).toBeGreaterThanOrEqual(active.length);
        if (all.length <= 10) {
            await expect(page.getByRole('region', { name: 'Sites', exact: true }).getByText(/\d+ - \d+ of \d+ items/)).toHaveCount(0);
        }
    });

    await test.step('Hide sites collapses the Sites section and Show sites brings it back', async () => {
        const first = (await readSites(page))[0].name;
        await button(page, 'Hide sites').click();
        await expect(page.getByText(first, { exact: true })).toHaveCount(0);
        await expect(button(page, 'Show sites')).toBeVisible();
        await expect(addLocation(page)).toBeVisible();
        await button(page, 'Show sites').click();
        await expect(page.getByText(first, { exact: true })).toBeVisible();
    });

    await test.step('Manage Sites opens Site Configuration and the browser returns', async () => {
        await button(page, 'Manage Sites').click();
        await expect(page).toHaveURL(/\/system\/Site-Configuration/);
        await page.goBack();
        await expect(page).toHaveURL(/Locations-&-Site-Integration/);
        await waitForPageReady(page, addLocation(page));
        await waitForCustomList(page);
    });
}

async function customLocationLifecycle(page: Page): Promise<void> {
    await cleanUp(page, 'QA (Loc|Page)');
    const name = uniqueName('QA Loc');
    const renamed = `${name} B`;
    const filtersVisible = customStatusFilter(page);

    try {
        await test.step('The custom list has its own add button, filter and columns', async () => {
            await expect(filtersVisible).toBeVisible();
            await filtersVisible.click();
            await expect(page.getByRole('option')).toHaveText(['All', 'Active', 'Inactive']);
            await page.keyboard.press('Escape');
            await expect(page.getByRole('listbox')).toHaveCount(0);
        });

        await test.step('A blank location can be cancelled with the x', async () => {
            await addLocation(page).click();
            await expect(page.getByRole('textbox', { name: 'Location name' })).toBeVisible();
            await expect(addLocation(page)).toBeDisabled();
            await button(page, 'Cancel').click();
            await expect(page.getByRole('textbox', { name: 'Location name' })).toHaveCount(0);
        });

        await test.step('A blank location is removed by clicking away', async () => {
            await addLocation(page).click();
            await page.locator('h1').first().click();
            await expect(page.getByRole('textbox', { name: 'Location name' })).toHaveCount(0);
        });

        await test.step('A named location becomes real with status and delete controls', async () => {
            await addNamedLocation(page, name);
            await expect(statusPill(page, name)).toHaveText('Active');
            await expect(nameField(page, name)).toBeVisible();
        });

        await test.step('A location can be renamed', async () => {
            await nameField(page, name).fill(renamed);
            await page.keyboard.press('Tab');
            await expect(toast(page, 'Custom location renamed').first()).toBeVisible();
            await expect(deleteIcon(page, renamed)).toBeVisible();
        });

        await test.step('Turning a location off asks first', async () => {
            await clickWhenSettled(statusPill(page, renamed));
            await expect(dialog(page)).toContainText(`Are you sure you want to make "${renamed}" inactive?`);
            await answerConfirmation(page, 'Yes');
            await expect(toast(page, 'Custom location deactivated').first()).toBeVisible();
            await expect(statusPill(page, renamed)).toHaveText('Inactive');
        });

        await test.step('The status filter shows and hides the inactive location', async () => {
            await chooseFilter(page, customStatusFilter, 'Active');
            await expect(deleteIcon(page, renamed)).toHaveCount(0);
            await chooseFilter(page, customStatusFilter, 'Inactive');
            await expect(deleteIcon(page, renamed)).toBeVisible();
            await chooseFilter(page, customStatusFilter, 'All');
        });

        await test.step('Turning it back on needs no confirmation', async () => {
            await clickWhenSettled(statusPill(page, renamed));
            await expect(toast(page, 'Custom location activated').first()).toBeVisible();
            await expect(statusPill(page, renamed)).toHaveText('Active');
        });

        await test.step('Hiding the Sites section does not touch custom locations', async () => {
            await button(page, 'Hide sites').click();
            await expect(deleteIcon(page, renamed)).toBeVisible();
            await button(page, 'Show sites').click();
        });

        await test.step('Delete asks first and No keeps the location', async () => {
            await deleteIcon(page, renamed).click();
            await expect(dialog(page)).toContainText(`Are you sure you want to delete "${renamed}"? This action cannot be undone.`);
            await answerConfirmation(page, 'No');
            await expect(deleteIcon(page, renamed)).toBeVisible();
        });

        await removeLocation(page, renamed);
        await expect(toast(page, 'Custom location deleted').first()).toBeVisible();

        await test.step('History records who, what and when', async () => {
            const history = await openHistory(page);
            await expect(history).toContainText('Performed By');
            await expect(history).toContainText('Date');
            for (const action of ['Custom location added', 'Custom location updated', 'Custom location deactivated', 'Custom location activated', 'Custom location deleted']) {
                await expect(history.getByText(action, { exact: true }).first()).toBeVisible();
            }
            await history.getByText('Custom location deleted', { exact: true }).first().click();
            await expect(history).toContainText('Changed Value(s)');
            await expect(history).toContainText(renamed);
            await closeHistory(page);
        });
    } finally {
        await cleanUp(page, 'QA (Loc|Page)');
    }
}

async function paginationAndLastPage(page: Page): Promise<void> {
    await cleanUp(page, 'QA (Loc|Page)');
    const prefix = uniqueName('QA Page');
    const existing = await customLocationCount(page);
    const toAdd = Math.max(PAGE_SIZE + 1 - existing, 1);

    try {
        await test.step(`Adding ${toAdd} locations pushes the list past one page`, async () => {
            for (let i = 1; i <= toAdd; i++) await addNamedLocation(page, `${prefix} ${String(i).padStart(2, '0')}`);
            await expect(pager(page)).toBeVisible();
            await expect(button(page, 'Page 1')).toBeVisible();
            await expect(button(page, 'Page 2')).toBeVisible();
        });

        await test.step('The newest location is on the last page right away', async () => {
            await expect(pager(page)).toHaveText(lastPageRange(existing + toAdd));
            await expect(deleteIcon(page, `${prefix} ${String(toAdd).padStart(2, '0')}`)).toBeVisible();
        });

        await test.step('A page holds 20 locations', async () => {
            await button(page, 'Page 1').click();
            await expect(pager(page)).toHaveText(new RegExp(`^1 - ${PAGE_SIZE} of ${existing + toAdd} items$`));
        });

        await test.step('Adding from page 1 jumps to the last page with a blank row', async () => {
            await addLocation(page).click();
            await expect(page.getByRole('textbox', { name: 'Location name' })).toBeVisible();
            await expect(pager(page)).toHaveText(lastPageRange(existing + toAdd + 1));
            await page.getByRole('textbox', { name: 'Location name' }).fill(`${prefix} extra`);
            await page.keyboard.press('Tab');
            await expect(toast(page, 'Custom location added').first()).toBeVisible();
            await expect(deleteIcon(page, `${prefix} extra`)).toBeVisible();
        });
    } finally {
        await cleanUp(page, 'QA (Loc|Page)');
    }
}

// --- Test
test('T-75280 Sites & Locations', async ({ page }) => {
    test.setTimeout(600000);
    await openSitesAndLocations(page);

    await test.step('Page, note, Sites list and Manage Sites', () => pageAndManageSites(page));
    await test.step('Add, rename, status, delete and history', () => customLocationLifecycle(page));
    await test.step('Custom locations paginate and a new one lands on the last page', () => paginationAndLastPage(page));
});
