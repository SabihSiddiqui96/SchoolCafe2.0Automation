// Professional Standards - Configuration - Rosters

import { test, expect, Page } from '@playwright/test';
import {
    AUTOMATION_PREFIX,
    answerConfirmation,
    automationNames,
    backToEmployees,
    chooseOption,
    closeHistory,
    dialog,
    dismissOverlays,
    employeeRow,
    loginToSchoolCafe2,
    openEmployee,
    openEmployees,
    openHistory,
    openProfessionalStandardsPage,
    prepareEmployee,
    searchEmployees,
    setEmployeeStatus,
    toast,
} from '../../utils/professionalStandards';

// --- Locators
const HELPER_TEXT =
    'Rosters are named lists of employees that training templates can use to pre-fill the attendee list. ' +
    'Editing or deleting a roster never changes events that were already recorded.';
const addRoster = (page: Page) => page.getByRole('button', { name: 'Add roster' }).first();
const rosterSearch = (page: Page) => page.getByPlaceholder('Search by roster name');
const openIcon = (page: Page, name: string) => page.getByRole('button', { name: `Open ${name}`, exact: true });
const trashIcon = (page: Page, name: string) => page.getByRole('button', { name: `Delete ${name}`, exact: true });
const rosterRow = (page: Page, name: string) => page.getByRole('row').filter({ has: openIcon(page, name) });
const nameField = (page: Page) => page.getByRole('textbox', { name: 'Roster name' });
const renameIcon = (page: Page) => page.getByRole('button', { name: 'Rename roster' });
const memberSearch = (page: Page) => page.getByPlaceholder('Search by name or employee ID');
const saveBar = (page: Page) => page.getByRole('button', { name: 'Save', exact: true });
const cancelBar = (page: Page) => page.getByRole('button', { name: 'Cancel', exact: true });
const memberRow = (page: Page, name: string) => page.getByRole('row').filter({ hasText: `${name} ${name}` });
const unsaved = (page: Page) => page.getByText('Unsaved changes', { exact: true });
const selector = (page: Page) => page.getByRole('dialog').last();
const selectorSearch = (page: Page) => selector(page).getByPlaceholder('Search by name or ID');
const tick = (page: Page, name: string) => selector(page).getByRole('checkbox', { name: new RegExp(`^Select ${name} `) });

// --- Helpers
async function backToRosters(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Back' }).first().click();
    await expect(addRoster(page)).toBeVisible();
}

async function createRoster(page: Page, name: string): Promise<void> {
    await addRoster(page).click();
    await dialog(page).locator('#add-roster-name').fill(name);
    await dialog(page).getByRole('button', { name: 'Create' }).click();
    await expect(toast(page, 'Roster added').first()).toBeVisible();
    await expect(page.getByText('Roster Details')).toBeVisible();
}

async function openRoster(page: Page, name: string): Promise<void> {
    await rosterSearch(page).fill(name);
    await openIcon(page, name).click();
    await expect(page.getByText('Roster Details')).toBeVisible();
    await expect(nameField(page)).toHaveValue(name);
}

/** Puts the name in edit mode - it already is after an error, and then the pencil is gone. */
async function startRename(page: Page): Promise<void> {
    if (await renameIcon(page).count()) await renameIcon(page).click();
    await expect(nameField(page)).toBeEditable();
}

async function saveRoster(page: Page): Promise<void> {
    await saveBar(page).click();
    await expect(toast(page, 'Roster saved').first()).toBeVisible();
    await expect(saveBar(page)).toHaveCount(0);
}

/** Opens Add members, ticks each employee (searching by full name) and stages them with Add N selected. */
async function stageMembers(page: Page, names: string[], employment?: string): Promise<void> {
    await page.getByRole('button', { name: 'Add members' }).click();
    await expect(selector(page)).toContainText('Add members');
    if (employment) await chooseOption(page, selector(page).getByRole('combobox', { name: 'Employment' }), employment);
    for (const name of names) {
        await selectorSearch(page).fill(`${name} ${name}`);
        await tick(page, name).check();
    }
    await selector(page).getByRole('button', { name: new RegExp(`^Add ${names.length} selected`, 'i') }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
}

async function ensureInactive(page: Page, name: string): Promise<void> {
    await openEmployees(page);
    await prepareEmployee(page, name);
    await openEmployee(page, name);
    await setEmployeeStatus(page, 'Inactive');
    await backToEmployees(page);
}

async function selectEmployees(page: Page, names: string[]): Promise<void> {
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    for (const name of names) {
        await searchEmployees(page, `${name} ${name}`);
        await employeeRow(page, name).click();
    }
}

// --- Sections
async function pageAndList(page: Page): Promise<void> {
    await test.step('Page leads with History, Back, the helper text and the list controls', async () => {
        await expect(page.getByRole('button', { name: 'History' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Back' }).first()).toBeVisible();
        await expect(page.getByText(HELPER_TEXT)).toBeVisible();
        await expect(rosterSearch(page)).toBeVisible();
        await expect(addRoster(page)).toBeVisible();
        for (const column of ['Roster name', 'Members', 'Actions']) await expect(page.getByText(column, { exact: true }).first()).toBeVisible();
    });

    await test.step('An empty list tells you to add a roster', async () => {
        const list = page.locator('main');
        if (await list.getByText(/No rosters yet/).count()) await expect(list).toContainText('No rosters yet. Click Add roster to get started.');
    });
}

async function addingRosters(page: Page, first: string, second: string): Promise<void> {
    await test.step('The Add roster dialog needs a name and rejects a duplicate', async () => {
        await createRoster(page, first);
        await backToRosters(page);
        await addRoster(page).click();
        await expect(dialog(page)).toContainText('You can add members on the next screen.');
        await dialog(page).getByRole('button', { name: 'Create' }).click();
        await expect(dialog(page)).toContainText('Enter a roster name');
        await dialog(page).locator('#add-roster-name').fill(first.toUpperCase());
        await dialog(page).getByRole('button', { name: 'Create' }).click();
        await expect(dialog(page)).toContainText(`${first.toUpperCase()} already exists.`);
        await dialog(page).getByText(/^cancel$/i).click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
    });

    await test.step('A new roster opens its details with no members', async () => {
        await createRoster(page, second);
        await expect(page.getByText('0 active members')).toBeVisible();
        await expect(page.getByText('No members yet. Add employees to build this roster.')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Delete roster' })).toBeVisible();
        await backToRosters(page);
        await rosterSearch(page).fill(AUTOMATION_PREFIX);
        await expect(rosterRow(page, first)).toContainText('0 members');
        const names = await page.getByRole('button', { name: /^Open / }).evaluateAll((els) => els.map((e) => (e.getAttribute('aria-label') ?? '').replace(/^Open /, '')));
        expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
        await rosterSearch(page).fill(`${AUTOMATION_PREFIX}NoSuchRoster`);
        await expect(page.getByText('No rosters match.')).toBeVisible();
        await rosterSearch(page).fill('');
    });
}

async function renamingRoster(page: Page, from: string, to: string, taken: string): Promise<void> {
    await openRoster(page, from);

    await test.step('A duplicate name shows an error and blocks Save', async () => {
        await startRename(page);
        await nameField(page).fill(taken.toLowerCase());
        await nameField(page).press('Enter');
        await expect(page.getByText(`${taken.toLowerCase()} already exists.`)).toBeVisible();
        await expect(saveBar(page)).toBeDisabled();
        await cancelBar(page).click();
        await expect(nameField(page)).toHaveValue(from);
    });

    await test.step('Escape and a blank name put the old name back', async () => {
        await startRename(page);
        await nameField(page).fill(`${to}x`);
        await nameField(page).press('Escape');
        await expect(nameField(page)).toHaveValue(from);
        await expect(saveBar(page)).toHaveCount(0);
        await startRename(page);
        await nameField(page).fill('');
        await nameField(page).press('Enter');
        await expect(nameField(page)).toHaveValue(from);
        await expect(saveBar(page)).toHaveCount(0);
    });

    await test.step('Leaving the field stages a new name, and Save applies it', async () => {
        await startRename(page);
        await nameField(page).fill(to);
        await page.getByText('Roster Details').click();
        await expect(unsaved(page)).toBeVisible();
        await expect(page.getByText('You have unsaved changes')).toBeVisible();
        await saveRoster(page);
        await backToRosters(page);
        await rosterSearch(page).fill(to);
        await expect(openIcon(page, to)).toBeVisible();
        await rosterSearch(page).fill('');
    });
}

async function addingMembers(page: Page, roster: string, other: string, members: string[]): Promise<void> {
    const [one, two] = members;
    await openRoster(page, roster);

    await test.step('The selector lists its filters, Select all and the save note', async () => {
        await page.getByRole('button', { name: 'Add members' }).click();
        await expect(selector(page)).toContainText('Add members');
        await expect(selectorSearch(page)).toBeVisible();
        for (const filter of ['Site', 'Employment', 'Job title', 'Roster']) await expect(selector(page).getByRole('combobox', { name: filter })).toBeVisible();
        await expect(selector(page).getByRole('combobox', { name: 'Employment' })).toContainText('Active only');
        await expect(selector(page)).toContainText('Select all');
        await expect(selector(page)).toContainText('0 already on the roster');
        await expect(selector(page)).toContainText('Changes apply when you save the roster.');
        await selector(page).getByRole('button', { name: 'Cancel' }).click();
    });

    await test.step('Ticked employees are kept across searches and staged as pending', async () => {
        await page.getByRole('button', { name: 'Add members' }).click();
        await selectorSearch(page).fill(`${one} ${one}`);
        await tick(page, one).check();
        await selectorSearch(page).fill(`${two} ${two}`);
        await tick(page, two).check();
        await expect(selector(page).getByRole('button', { name: /^Add 2 selected/i })).toBeVisible();
        await selector(page).getByRole('button', { name: /^Add 2 selected/i }).click();
        await expect(memberRow(page, one)).toContainText('(pending)');
        await expect(memberRow(page, two)).toContainText('(pending)');
        await expect(page.getByRole('button', { name: new RegExp(`^Don't add ${one} `) })).toBeVisible();
        await expect(unsaved(page)).toBeVisible();
        await expect(page.getByText('You have unsaved changes')).toBeVisible();
        await expect(saveBar(page)).toBeVisible();
        await expect(cancelBar(page)).toBeVisible();
    });

    await test.step('The list keeps the last saved state until Save', async () => {
        await page.getByRole('button', { name: 'Back' }).first().click();
        await rosterSearch(page).fill(roster);
        await expect(rosterRow(page, roster)).toContainText('0 members');
        await openIcon(page, roster).click();
        await expect(memberRow(page, one)).toContainText('(pending)');
    });

    await test.step('Save applies every staged member at once', async () => {
        await saveRoster(page);
        await expect(page.getByText('2 active members')).toBeVisible();
        await expect(memberRow(page, one)).not.toContainText('(pending)');
        await backToRosters(page);
        await rosterSearch(page).fill(roster);
        await expect(rosterRow(page, roster)).toContainText('2 members');
        await rosterSearch(page).fill('');
    });

    await test.step('Members are marked Already on the roster and cannot be ticked', async () => {
        await openRoster(page, roster);
        await page.getByRole('button', { name: 'Add members' }).click();
        await expect(selector(page)).toContainText('2 already on the roster');
        await selectorSearch(page).fill(`${one} ${one}`);
        await expect(selector(page)).toContainText('Already on the roster');
        await expect(tick(page, one)).toBeDisabled();
        await selectorSearch(page).fill(AUTOMATION_PREFIX);
        await selector(page).getByText('Select all').click();
        await expect(selector(page)).toContainText(/\d+ selected/);
        await expect(tick(page, one)).not.toBeChecked();
        await selector(page).getByRole('button', { name: 'Cancel' }).click();
    });

    await test.step('The Roster filter leaves out the roster being edited', async () => {
        await page.getByRole('button', { name: 'Add members' }).click();
        await selector(page).getByRole('combobox', { name: 'Roster' }).click();
        const options = await page.getByRole('option').allInnerTexts();
        expect(options).toContain(other);
        expect(options).not.toContain(roster);
        await page.keyboard.press('Escape');
        await selector(page).getByRole('button', { name: 'Cancel' }).click();
    });
}

async function stagedEditing(page: Page, roster: string, members: string[], extra: string): Promise<void> {
    const [one, two] = members;

    await test.step('A removal shows struck through with Undo, and Undo brings the member back', async () => {
        await page.getByRole('button', { name: new RegExp(`^Remove ${one} `) }).click();
        await expect(memberRow(page, one)).toContainText('Pending removal');
        await expect(page.getByText('1 active member')).toBeVisible();
        await page.getByText('Undo', { exact: true }).click();
        await expect(memberRow(page, one)).not.toContainText('Pending removal');
        await expect(page.getByText('2 active members')).toBeVisible();
        await expect(saveBar(page)).toHaveCount(0);
    });

    await test.step('The selector labels staged additions and removals', async () => {
        await page.getByRole('button', { name: new RegExp(`^Remove ${one} `) }).click();
        await stageMembers(page, [extra]);
        await page.getByRole('button', { name: 'Add members' }).click();
        await selectorSearch(page).fill(`${one} ${one}`);
        await expect(selector(page)).toContainText('Pending removal');
        await selectorSearch(page).fill(`${extra} ${extra}`);
        await expect(selector(page)).toContainText('Pending add');
        await selector(page).getByRole('button', { name: 'Cancel' }).click();
    });

    await test.step('Staged changes survive leaving and returning, and Cancel discards them', async () => {
        await page.getByRole('button', { name: 'Back' }).first().click();
        await openIcon(page, roster).click();
        await expect(memberRow(page, one)).toContainText('Pending removal');
        await expect(memberRow(page, extra)).toContainText('(pending)');
        await cancelBar(page).click();
        await expect(saveBar(page)).toHaveCount(0);
        await expect(memberRow(page, one)).not.toContainText('Pending removal');
        await expect(memberRow(page, extra)).toHaveCount(0);
        await expect(memberRow(page, two)).toBeVisible();
    });
}

async function inactiveMembers(page: Page, roster: string, active: string[], inactive: string[]): Promise<void> {
    await test.step('Inactive members are dimmed, tagged, counted and listed last', async () => {
        await stageMembers(page, inactive, 'Inactive only');
        await saveRoster(page);
        await expect(page.getByText(`${active.length} active members · ${inactive.length} inactive`)).toBeVisible();
        for (const name of inactive) await expect(memberRow(page, name)).toContainText('Inactive');
        const rows = (await page.getByRole('row').allInnerTexts()).filter((r) => r.includes(AUTOMATION_PREFIX));
        const firstInactive = rows.findIndex((r) => r.includes(`${inactive[0]} ${inactive[0]}`));
        const lastActive = rows.findIndex((r) => r.includes(`${active[active.length - 1]} ${active[active.length - 1]}`));
        expect(lastActive).toBeLessThan(firstInactive);
        await backToRosters(page);
        await rosterSearch(page).fill(roster);
        await expect(rosterRow(page, roster)).toContainText(`${active.length} members · ${inactive.length} inactive`);
        await rosterSearch(page).fill('');
    });

    await test.step('Members search by name and ID and say when nothing matches', async () => {
        await openIcon(page, roster).click();
        await memberSearch(page).fill(inactive[0]);
        await expect(memberRow(page, inactive[0])).toBeVisible();
        await expect(memberRow(page, active[0])).toHaveCount(0);
        await memberSearch(page).fill(`${AUTOMATION_PREFIX}NoSuchMember`);
        await expect(page.getByText('No members match.')).toBeVisible();
        await memberSearch(page).fill(active[0]);
        await expect(memberRow(page, active[0])).toBeVisible();
        await memberSearch(page).fill('');
    });
}

async function addToRosterFromEmployees(page: Page, existing: string, members: string[], extra: string, created: string): Promise<void> {
    const [one] = members;
    const picker = () => page.getByRole('dialog').last();
    const choose = (name: string) => picker().getByRole('button', { name: new RegExp(`^${name} `) });

    await test.step('The picker lists each roster with its member count and New roster', async () => {
        await openEmployees(page);
        await selectEmployees(page, [one]);
        await page.getByRole('button', { name: 'Add to roster' }).click();
        await expect(choose(existing)).toContainText(/\d+ members?/);
        await expect(picker()).toContainText('New roster…');
    });

    await test.step('Choosing a roster the employee is already on adds nobody', async () => {
        await choose(existing).click();
        await expect(toast(page, `Those employees are already on "${existing}"`).first()).toBeVisible();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Done' })).toHaveCount(0);
    });

    await test.step('A mix of new and existing employees reports how many were added', async () => {
        await selectEmployees(page, [one, extra]);
        await page.getByRole('button', { name: 'Add to roster' }).click();
        await choose(existing).click();
        await expect(toast(page, `1 employee added to "${existing}" (1 already on it)`).first()).toBeVisible();
        await expect(page.getByRole('dialog')).toHaveCount(0);
    });

    await test.step('New roster checks the name, then creates the roster and adds the employees', async () => {
        await selectEmployees(page, [one, extra]);
        await page.getByRole('button', { name: 'Add to roster' }).click();
        await picker().getByText('New roster…').click();
        await picker().getByRole('button', { name: 'Create and add' }).click();
        await expect(picker()).toContainText('Enter a roster name');
        await picker().getByRole('textbox', { name: 'Roster name' }).fill(existing.toLowerCase());
        await picker().getByRole('button', { name: 'Create and add' }).click();
        await expect(picker()).toContainText(`${existing.toLowerCase()} already exists.`);
        await picker().getByRole('textbox', { name: 'Roster name' }).fill(created);
        await picker().getByRole('button', { name: 'Create and add' }).click();
        await expect(toast(page, `2 employees added to "${created}"`).first()).toBeVisible();
        await expect(page.getByRole('dialog')).toHaveCount(0);
    });
}

async function deletingRosters(page: Page, viaList: string, viaDetails: string): Promise<void> {
    await openProfessionalStandardsPage(page, 'Rosters', addRoster(page));

    await test.step('The trash icon asks first, names the roster and No keeps it', async () => {
        await rosterSearch(page).fill(viaList);
        await trashIcon(page, viaList).click();
        await expect(dialog(page)).toContainText(`Are you sure you want to delete "${viaList}"?`);
        await expect(dialog(page)).toContainText('Training events already recorded are not affected.');
        await answerConfirmation(page, 'No');
        await expect(openIcon(page, viaList)).toBeVisible();
        await trashIcon(page, viaList).click();
        await answerConfirmation(page, 'Yes');
        await expect(toast(page, `${viaList} deleted`).first()).toBeVisible();
        await expect(openIcon(page, viaList)).toHaveCount(0);
    });

    await test.step('Delete roster on the details page mentions its members and returns to the list', async () => {
        await openRoster(page, viaDetails);
        await page.getByRole('button', { name: 'Delete roster' }).click();
        await expect(dialog(page)).toContainText(`Are you sure you want to delete "${viaDetails}"?`);
        await expect(dialog(page)).toContainText(/Its \d+ members stay in the directory\./);
        await expect(dialog(page)).toContainText('Training events already recorded are not affected.');
        await answerConfirmation(page, 'Yes');
        await expect(toast(page, `${viaDetails} deleted`).first()).toBeVisible();
        await expect(addRoster(page)).toBeVisible();
    });
}

async function historyEntries(page: Page): Promise<void> {
    await test.step('History lists the roster changes and Roster saved shows the old and new name', async () => {
        const history = await openHistory(page);
        await expect(history).toContainText('Rosters - History');
        await expect(history).toContainText('Performed By');
        for (const action of ['Roster added', 'Roster saved', 'Roster deleted']) await expect(history.getByText(action, { exact: true }).first()).toBeVisible();
        await expect(history.getByText(/^Employees added to "/).first()).toBeVisible();
        await history.getByText('Roster saved', { exact: true }).first().click();
        await expect(history).toContainText('Changed Value(s)');
        await closeHistory(page);
    });
}

/** Deletes every test roster and leaves the pool employees inactive. */
async function cleanUp(page: Page, pool: string[]): Promise<void> {
    await page.keyboard.press('Escape').catch(() => undefined);
    await dismissOverlays(page);
    await openEmployees(page);
    await searchEmployees(page, '');
    await openProfessionalStandardsPage(page, 'Rosters', addRoster(page));
    await rosterSearch(page).fill(AUTOMATION_PREFIX);
    for (let guard = 0; guard < 20; guard++) {
        const left = page.getByRole('button', { name: new RegExp(`^Delete ${AUTOMATION_PREFIX}`, 'i') });
        const before = await left.count();
        if (!before) break;
        await left.first().click();
        await answerConfirmation(page, 'Yes');
        await expect(left).toHaveCount(before - 1);
    }
    await openEmployees(page);
    for (const name of pool) {
        await openEmployee(page, name).catch(() => undefined);
        if (!(await page.getByText('Employee Details').count())) continue;
        await setEmployeeStatus(page, 'Inactive');
        await backToEmployees(page);
    }
}

// --- Test
test('T-75279 Rosters', async ({ page }) => {
    test.setTimeout(900000);
    await loginToSchoolCafe2(page);

    const [first, second, renamed, created] = automationNames(4);
    const pool = [1, 2, 3, 4, 5].map((i) => `${AUTOMATION_PREFIX}${i}`);
    const [active, inactive, extra] = [pool.slice(0, 2), pool.slice(2, 4), pool[4]];

    let passed = false;
    try {
        await openEmployees(page);
        for (const name of [...active, extra]) await prepareEmployee(page, name);
        for (const name of inactive) await ensureInactive(page, name);
        await openProfessionalStandardsPage(page, 'Rosters', addRoster(page));

        await test.step('Page, helper text and list', () => pageAndList(page));
        await test.step('Adding rosters', () => addingRosters(page, first, second));
        await test.step('Renaming a roster', () => renamingRoster(page, first, renamed, second));
        await test.step('Adding members', () => addingMembers(page, renamed, second, active));
        await test.step('Staged removals and additions', () => stagedEditing(page, renamed, active, extra));
        await test.step('Inactive members and member search', () => inactiveMembers(page, renamed, active, inactive));
        await test.step('Add to roster from the Employees page', () => addToRosterFromEmployees(page, renamed, active, extra, created));
        await test.step('Deleting rosters', () => deletingRosters(page, created, renamed));
        await test.step('History', () => historyEntries(page));
        passed = true;
    } finally {
        // a failed run keeps its own error instead of the cleanup's
        await cleanUp(page, pool).catch((error) => {
            if (passed) throw error;
        });
    }
});
