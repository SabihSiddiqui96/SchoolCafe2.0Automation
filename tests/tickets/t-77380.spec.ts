// Professional Standards - Configuration - Training Sources and Methods

import { test, expect, Locator, Page } from '@playwright/test';
import {
    AUTOMATION_PREFIX,
    automationNames,
    closeHistory,
    loginToSchoolCafe2,
    openHistory,
    openProfessionalStandardsPage,
    toast,
    TrainingListKind,
    trainingListAddLabel,
    trainingListSection,
} from '../../utils/professionalStandards';

// --- Locators
const PAGE_NAME = 'Training Sources and Methods';
const HELPER_TEXT =
    'Training sources and methods record where a training came from and how it was delivered. ' +
    'These fields are optional, but they provide additional verifiable data points for stronger record keeping and reporting confidence. ' +
    'Any entry, including the defaults, can be made inactive, and only active entries in either list are available for selection. ' +
    'Defaults cannot be renamed or deleted, and entries that have been used cannot be deleted.';
const DEFAULT_SOURCES = [
    'District',
    'Food Safety Provider',
    'Institute of Child Nutrition (ICN)',
    'Other',
    'School Nutrition Association (SNA)',
    'State Agency',
    'Training Organization / Provider',
    'University / College',
    'USDA',
    'Vendor Training',
];
const DEFAULT_METHODS = ['Conference / Workshop', 'In Person', 'Online', 'Other'];

type Kind = TrainingListKind;

const section = trainingListSection;
const addButton = (page: Page, kind: Kind) => section(page, kind).getByRole('button', { name: trainingListAddLabel(kind) }).first();
const statusFilter = (page: Page, kind: Kind) => section(page, kind).getByRole('combobox', { name: 'Status' });
const defaultsToggle = (page: Page, kind: Kind) => section(page, kind).getByRole('button', { name: /^(Show|Hide) defaults$/ }).first();
const nameField = (page: Page, kind: Kind, name: string) => section(page, kind).getByRole('textbox', { name: `Name ${name}`, exact: true });
const blankField = (page: Page, kind: Kind) => section(page, kind).getByRole('textbox', { name: kind === 'source' ? 'Source name' : 'Method name' });
const statusSwitch = (page: Page, kind: Kind, name: string) => section(page, kind).getByRole('switch', { name: `${name} Status`, exact: true });
const trashIcon = (page: Page, kind: Kind, name: string) => section(page, kind).getByRole('button', { name: `Delete ${name}`, exact: true });
const entryRow = (page: Page, kind: Kind, name: string) =>
    section(page, kind).getByRole('row').filter({ has: page.locator(`input[aria-label="Name ${name}"]`) });
const customNames = (page: Page, kind: Kind) =>
    section(page, kind).locator('input[aria-label^="Name "]').evaluateAll((e) => e.map((x) => (x as HTMLInputElement).value));
const saveBar = (page: Page) => page.getByRole('button', { name: 'Save', exact: true });
const cancelBar = (page: Page) => page.getByRole('button', { name: 'Cancel', exact: true }).last();
const unsaved = (page: Page, kind: Kind) => section(page, kind).getByText('Unsaved changes', { exact: true });
const heading = (page: Page) => page.getByText('Training Sources & Methods', { exact: true });

// --- Helpers
async function setStatusFilter(page: Page, kind: Kind, option: 'All' | 'Active' | 'Inactive'): Promise<void> {
    await statusFilter(page, kind).click();
    await page.getByRole('option', { name: option, exact: true }).click();
    await expect(statusFilter(page, kind)).toContainText(option);
}

async function leaveField(page: Page, how: 'Enter' | 'Tab' | 'Away'): Promise<void> {
    if (how === 'Away') await heading(page).click();
    else await page.keyboard.press(how);
}

/** Adds an entry the way a person does: the blank row takes the cursor, then Enter, Tab or a click away. */
async function addEntry(page: Page, kind: Kind, name: string, how: 'Enter' | 'Tab' | 'Away' = 'Enter'): Promise<void> {
    await addButton(page, kind).click();
    await expect(blankField(page, kind)).toBeFocused();
    await page.keyboard.type(name);
    await leaveField(page, how);
    await expect(nameField(page, kind, name)).toBeVisible();
}

async function saveAll(page: Page): Promise<void> {
    await saveBar(page).click();
    await expect(toast(page, 'Training sources and methods saved').first()).toBeVisible();
    await expect(saveBar(page)).toHaveCount(0);
}

async function rename(page: Page, kind: Kind, from: string, to: string): Promise<void> {
    await nameField(page, kind, from).fill(to);
    await page.keyboard.press('Tab');
    await expect(nameField(page, kind, to)).toBeVisible();
}

async function tryDuplicate(page: Page, kind: Kind, typed: string, existing: string): Promise<void> {
    await addButton(page, kind).click();
    await expect(blankField(page, kind)).toBeFocused();
    await page.keyboard.type(typed);
    await page.keyboard.press('Enter');
    await expect(section(page, kind)).toContainText(`"${existing}" already exists.`);
    await expect(blankField(page, kind)).toBeVisible();
    await section(page, kind).getByRole('button', { name: 'Cancel' }).first().click();
    await expect(blankField(page, kind)).toHaveCount(0);
}

// --- Sections
async function pageAndHelper(page: Page): Promise<void> {
    await test.step('Page leads with History, Back, the helper text and both sections', async () => {
        await expect(heading(page)).toBeVisible();
        await expect(page.getByRole('button', { name: 'History' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Back' }).first()).toBeVisible();
        await expect(page.getByText(HELPER_TEXT)).toBeVisible();
        for (const kind of ['source', 'method'] as Kind[]) {
            await expect(section(page, kind)).toContainText(kind === 'source' ? 'Training sources' : 'Training methods');
            await expect(statusFilter(page, kind)).toContainText('Active');
            await expect(defaultsToggle(page, kind)).toContainText('Show defaults');
            await expect(addButton(page, kind)).toBeVisible();
            for (const column of ['Name', 'Type', 'Status', 'Delete']) await expect(section(page, kind).getByText(column, { exact: true }).first()).toBeVisible();
        }
    });

    await test.step('Without custom entries each list says how to add one', async () => {
        for (const kind of ['source', 'method'] as Kind[]) {
            if ((await customNames(page, kind)).length) continue;
            const noun = kind === 'source' ? 'sources' : 'methods';
            await expect(section(page, kind)).toContainText(`You have no custom ${noun} yet. Click ${trainingListAddLabel(kind)} to add one or click Show defaults.`);
        }
    });
}

async function defaults(page: Page): Promise<void> {
    await test.step('Show defaults lists the default entries in name order, locked and active', async () => {
        for (const [kind, expected] of [['source', DEFAULT_SOURCES], ['method', DEFAULT_METHODS]] as [Kind, string[]][]) {
            await defaultsToggle(page, kind).click();
            await expect(defaultsToggle(page, kind)).toContainText('Hide defaults');
            const rows = section(page, kind).getByRole('row').filter({ has: page.getByText('Default', { exact: true }) });
            await expect(rows).toHaveCount(expected.length);
            const text = (await rows.allInnerTexts()).join('\n');
            let from = 0;
            for (const name of expected) {
                const at = text.indexOf(name, from);
                expect(at, `${name} is listed in order`).toBeGreaterThanOrEqual(from);
                from = at;
                await expect(trashIcon(page, kind, name)).toHaveCount(0);
            }
            await expect(rows.first()).toContainText('Active');
        }
    });

    await test.step('Default names cannot be edited', async () => {
        const field = nameField(page, 'source', 'USDA');
        if (await field.count()) await expect(field).not.toBeEditable();
    });

    await test.step('Hide defaults removes them again', async () => {
        for (const kind of ['source', 'method'] as Kind[]) {
            await defaultsToggle(page, kind).click();
            await expect(defaultsToggle(page, kind)).toContainText('Show defaults');
            await expect(section(page, kind).getByRole('row').filter({ has: page.getByText('Default', { exact: true }) })).toHaveCount(0);
        }
    });
}

async function statusFilters(page: Page): Promise<void> {
    await test.step('Status offers All, Active and Inactive and the lists filter on their own', async () => {
        await statusFilter(page, 'source').click();
        await expect(page.getByRole('option')).toHaveText(['All', 'Active', 'Inactive']);
        await page.getByRole('option', { name: 'Inactive', exact: true }).click();
        await expect(statusFilter(page, 'source')).toContainText('Inactive');
        await expect(statusFilter(page, 'method')).toContainText('Active');
        await defaultsToggle(page, 'source').click();
        if (!(await section(page, 'source').locator('input[aria-label^="Name "], [role=switch][aria-checked=false]').count())) {
            await expect(section(page, 'source')).toContainText('No entries match this filter.');
        }
        await defaultsToggle(page, 'source').click();
        await setStatusFilter(page, 'source', 'Active');
    });
}

async function blankEntries(page: Page): Promise<void> {
    await test.step('A blank entry disappears with Enter, Tab, a click away or the X', async () => {
        for (const how of ['Enter', 'Tab', 'Away'] as const) {
            await addButton(page, 'source').click();
            await expect(blankField(page, 'source')).toBeFocused();
            await leaveField(page, how);
            await expect(blankField(page, 'source')).toHaveCount(0);
        }
        await addButton(page, 'source').click();
        await expect(blankField(page, 'source')).toBeFocused();
        await section(page, 'source').getByRole('button', { name: 'Cancel' }).first().click();
        await expect(blankField(page, 'source')).toHaveCount(0);
        await expect(saveBar(page)).toHaveCount(0);
    });
}

async function addingEntries(page: Page, sources: string[], method: string): Promise<void> {
    await test.step('Entries added with Enter, Tab and a click away show as pending custom entries', async () => {
        const [byEnter, byTab, byClick] = sources;
        await addEntry(page, 'source', byEnter, 'Enter');
        await expect(unsaved(page, 'source')).toBeVisible();
        await expect(unsaved(page, 'method')).toHaveCount(0);
        await expect(page.getByText('You have unsaved changes')).toBeVisible();
        await expect(cancelBar(page)).toBeVisible();
        await expect(saveBar(page)).toBeVisible();
        await addEntry(page, 'source', byTab, 'Tab');
        await addEntry(page, 'source', byClick, 'Away');
        for (const name of sources) {
            const row = entryRow(page, 'source', name);
            await expect(row).toContainText('(pending)');
            await expect(row).toContainText('Custom');
            await expect(row).toContainText('Active');
            await expect(trashIcon(page, 'source', name)).toBeVisible();
        }
        await addEntry(page, 'method', method, 'Enter');
        await expect(entryRow(page, 'method', method)).toContainText('(pending)');
        await expect(unsaved(page, 'method')).toBeVisible();
    });
}

async function duplicateNames(page: Page, existing: string): Promise<void> {
    await test.step('A custom name in another case, a default and a padded name are all refused', async () => {
        await tryDuplicate(page, 'source', existing.toLowerCase(), existing);
        await tryDuplicate(page, 'source', 'usda', 'USDA');
        await tryDuplicate(page, 'source', ` ${existing} `, existing);
        await tryDuplicate(page, 'source', ' district ', 'District');
    });
}

async function savingFirstEntries(page: Page, sources: string[], method: string): Promise<void> {
    await test.step('Save keeps both lists and clears the markers', async () => {
        await saveAll(page);
        await expect(unsaved(page, 'source')).toHaveCount(0);
        for (const name of sources) await expect(entryRow(page, 'source', name)).not.toContainText('(pending)');
        await expect(entryRow(page, 'method', method)).not.toContainText('(pending)');
    });
}

async function renamingEntries(page: Page, entry: string, renamed: string): Promise<void> {
    await test.step('Renaming a custom entry shows edited with no dialog', async () => {
        await rename(page, 'source', entry, renamed);
        await expect(entryRow(page, 'source', renamed)).toContainText('(edited)');
        await expect(page.getByRole('dialog')).toHaveCount(0);
    });

    await test.step('Renaming into an existing name, even a default, is refused and Escape goes back', async () => {
        await nameField(page, 'source', renamed).fill('usda');
        await page.keyboard.press('Tab');
        await expect(section(page, 'source')).toContainText('"USDA" already exists.');
        await nameField(page, 'source', renamed).press('Escape');
        await expect(section(page, 'source')).not.toContainText('already exists.');
        const names = await customNames(page, 'source');
        expect(names).not.toContain('usda');
        expect(names.some((n) => n === entry || n === renamed)).toBe(true);
        if (!names.includes(renamed)) await rename(page, 'source', entry, renamed);
        await expect(entryRow(page, 'source', renamed)).toContainText('(edited)');
    });
}

async function statusAndRemoval(page: Page, inactive: string, removed: string, method: string): Promise<void> {
    await test.step('Turning an entry inactive shows edited and Inactive and the row stays under Active', async () => {
        await statusSwitch(page, 'source', inactive).click();
        const row = entryRow(page, 'source', inactive);
        await expect(row).toContainText('(edited)');
        await expect(row).toContainText('Inactive');
        await expect(row).toBeVisible();
        await statusSwitch(page, 'method', method).click();
        await expect(entryRow(page, 'method', method)).toContainText('Inactive');
    });

    await test.step('The trash icon strikes the entry through with Undo and no dialog', async () => {
        await trashIcon(page, 'source', removed).click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(section(page, 'source').getByText('Undo', { exact: true })).toBeVisible();
        await section(page, 'source').getByText('Undo', { exact: true }).click();
        await expect(section(page, 'source').getByText('Undo', { exact: true })).toHaveCount(0);
        await expect(trashIcon(page, 'source', removed)).toBeVisible();
    });
}

async function sorting(page: Page): Promise<void> {
    await test.step('The Name header sorts descending, then ascending', async () => {
        const header = section(page, 'source').getByText('Name', { exact: true }).first();
        const sorted = (names: string[]) => [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        const sortTo = async (direction: 'descending' | 'ascending') => {
            await expect(async () => {
                const names = await customNames(page, 'source');
                const wanted = direction === 'ascending' ? sorted(names) : sorted(names).reverse();
                if (JSON.stringify(names) !== JSON.stringify(wanted)) await header.click();
                expect(JSON.stringify(await customNames(page, 'source'))).toBe(JSON.stringify(wanted));
            }).toPass({ timeout: 20000, intervals: [1000] });
        };
        await sortTo('descending');
        await sortTo('ascending');
    });
}

async function savingChanges(page: Page, renamed: string, inactive: string, method: string): Promise<void> {
    await test.step('Save writes staged changes in both lists at once', async () => {
        await saveAll(page);
        await expect(unsaved(page, 'source')).toHaveCount(0);
        await expect(unsaved(page, 'method')).toHaveCount(0);
        await expect(entryRow(page, 'source', renamed)).not.toContainText('(edited)');
        await expect(nameField(page, 'source', inactive)).toHaveCount(0);
        await expect(nameField(page, 'method', method)).toHaveCount(0);
    });
}

async function cancellingChanges(page: Page, entry: string, extra: string): Promise<void> {
    await test.step('Cancel discards every staged change in both lists', async () => {
        const before = await customNames(page, 'source');
        const methodsBefore = await customNames(page, 'method');
        await rename(page, 'source', entry, `${entry}Z`);
        await addEntry(page, 'method', extra, 'Enter');
        await expect(unsaved(page, 'source')).toBeVisible();
        await expect(unsaved(page, 'method')).toBeVisible();
        await cancelBar(page).click();
        await expect(saveBar(page)).toHaveCount(0);
        expect(await customNames(page, 'source')).toEqual(before);
        expect(await customNames(page, 'method')).toEqual(methodsBefore);
    });
}

async function filtersAfterSaving(page: Page, inactive: string, active: string): Promise<void> {
    await test.step('An inactive entry hides under Active and shows under Inactive and All', async () => {
        await expect(nameField(page, 'source', inactive)).toHaveCount(0);
        await expect(nameField(page, 'source', active)).toBeVisible();
        await setStatusFilter(page, 'source', 'Inactive');
        await expect(nameField(page, 'source', inactive)).toBeVisible();
        await expect(nameField(page, 'source', active)).toHaveCount(0);
        await setStatusFilter(page, 'source', 'All');
        await expect(nameField(page, 'source', inactive)).toBeVisible();
        await expect(nameField(page, 'source', active)).toBeVisible();
    });
}

async function historyEntries(page: Page): Promise<void> {
    await test.step('History lists the changes and an entry shows the old and new values', async () => {
        const history = await openHistory(page);
        await expect(history).toContainText('Training Sources & Methods - History');
        for (const column of ['Performed By', 'Date', 'Performed Action']) await expect(history).toContainText(column);
        for (const action of ['Training source added', 'Training source renamed', 'Training source deactivated', 'Training method added']) {
            await expect(history.getByText(action, { exact: true }).first()).toBeVisible();
        }
        await history.getByText('Training source renamed', { exact: true }).first().click();
        await expect(history).toContainText('Changed Value(s)');
        await closeHistory(page);
    });
}

/** Deletes every test entry in both lists, inactive ones included. */
async function cleanUp(page: Page): Promise<void> {
    await page.keyboard.press('Escape').catch(() => undefined);
    await openProfessionalStandardsPage(page, PAGE_NAME, heading(page));
    if (await saveBar(page).count()) await cancelBar(page).click();
    for (const kind of ['source', 'method'] as Kind[]) {
        await setStatusFilter(page, kind, 'All');
        for (const name of await customNames(page, kind)) {
            if (name.startsWith(AUTOMATION_PREFIX)) await trashIcon(page, kind, name).click();
        }
    }
    if (await saveBar(page).count()) await saveAll(page);
    for (const kind of ['source', 'method'] as Kind[]) await setStatusFilter(page, kind, 'Active');
}

// --- Test
test('T-77380 Training Sources and Methods', async ({ page }) => {
    test.setTimeout(600000);
    await loginToSchoolCafe2(page);

    const [byEnter, byTab, byClick, renamed, method, extra] = automationNames(6);
    let passed = false;
    try {
        await openProfessionalStandardsPage(page, PAGE_NAME, heading(page));
        await cleanUp(page);

        await test.step('Page, helper text and empty lists', () => pageAndHelper(page));
        await test.step('Default entries', () => defaults(page));
        await test.step('Status filters', () => statusFilters(page));
        await test.step('Blank entries', () => blankEntries(page));
        await test.step('Adding entries', () => addingEntries(page, [byEnter, byTab, byClick], method));
        await test.step('Duplicate names', () => duplicateNames(page, byEnter));
        await test.step('Saving the first entries', () => savingFirstEntries(page, [byEnter, byTab, byClick], method));
        await test.step('Renaming entries', () => renamingEntries(page, byEnter, renamed));
        await test.step('Status pills and removal', () => statusAndRemoval(page, byTab, byClick, method));
        await test.step('Saving both lists', () => savingChanges(page, renamed, byTab, method));
        await test.step('Sorting', () => sorting(page));
        await test.step('Cancelling changes', () => cancellingChanges(page, byClick, extra));
        await test.step('Filters after saving', () => filtersAfterSaving(page, byTab, byClick));
        await test.step('History', () => historyEntries(page));
        passed = true;
    } finally {
        // a failed run keeps its own error instead of the cleanup's
        await cleanUp(page).catch((error) => {
            if (passed) throw error;
        });
    }
});
