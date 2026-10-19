// Professional Standards - Configuration - Job Titles

import { test, expect, Page } from '@playwright/test';
import {
    prepareEmployee,
    addEmployeeButton,
    AUTOMATION_PREFIX,
    answerConfirmation,
    backToEmployees,
    closeHistory,
    dialog,
    dismissOverlays,
    loginToSchoolCafe2,
    automationNames,
    openEmployee,
    openEmployees,
    openHistory,
    openProfessionalStandardsPage,
    setEmployeeJobTitle,
    setEmployeeStatus,
    toast,
} from '../../utils/professionalStandards';

// --- Locators
const HELPER_TEXT =
    "Job titles appear as options when adding an employee and as a filter in the Employees directory. " +
    'A job title can only be removed if no employee currently holds it.';
const addJobTitle = (page: Page) => page.getByRole('button', { name: 'Add job title' });
const blankEntry = (page: Page) => page.getByRole('textbox', { name: 'Job title name' });
const titleInput = (page: Page, name: string) => page.getByRole('textbox', { name: `Job title ${name}`, exact: true });
const titleRow = (page: Page, name: string) => page.getByRole('row').filter({ has: titleInput(page, name) });
const count = (page: Page, name: string) => titleRow(page, name).locator('td').nth(1);
const renameIcon = (page: Page, name: string) => page.getByRole('button', { name: `Rename ${name}`, exact: true });
const deleteIcon = (page: Page, name: string) => page.getByRole('button', { name: `Delete ${name}`, exact: true });
const exists = (page: Page, shown: string) => expect(page.locator('body')).toContainText(`"${shown}" already exists.`);

type Finish = 'Enter' | 'Tab' | 'Away';

// --- Helpers
async function openJobTitles(page: Page): Promise<void> {
    await loginToSchoolCafe2(page);
    await openProfessionalStandardsPage(page, 'Job Titles', addJobTitle(page));
}

async function titleNames(page: Page): Promise<string[]> {
    return page.locator('input[aria-label^="Job title "]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
}

async function finishEntry(page: Page, how: Finish): Promise<void> {
    if (how === 'Away') await page.locator('h1').first().click();
    else await page.keyboard.press(how);
}

async function addTitle(page: Page, name: string, how: Finish = 'Enter'): Promise<void> {
    await addJobTitle(page).click();
    await expect(blankEntry(page)).toBeFocused();
    await page.keyboard.type(name);
    await finishEntry(page, how);
    await expect(toast(page, 'Job title added').first()).toBeVisible();
    await expect(blankEntry(page)).toHaveCount(0);
    await expect(titleInput(page, name.trim())).toBeVisible();
}

async function renameTitle(page: Page, from: string, to: string): Promise<void> {
    if (!(await titleInput(page, from).evaluate((e) => e === document.activeElement).catch(() => false))) {
        await renameIcon(page, from).click();
    }
    await expect(titleInput(page, from)).toBeFocused();
    await titleInput(page, from).fill(to);
    await page.keyboard.press('Enter');
}

async function removeTitle(page: Page, name: string): Promise<void> {
    await deleteIcon(page, name).click();
    await expect(dialog(page)).toContainText(`Are you sure you want to delete "${name}"?`);
    await expect(dialog(page)).toContainText('This action cannot be undone.');
    await answerConfirmation(page, 'Yes');
    await expect(toast(page, 'Job title deleted').first()).toBeVisible();
    await expect(titleInput(page, name)).toHaveCount(0);
}

// --- Sections
async function pageAndList(page: Page): Promise<void> {
    await test.step('Page leads with History and the helper text', async () => {
        await expect(page.getByRole('button', { name: 'History' })).toBeVisible();
        await expect(page.getByText(HELPER_TEXT)).toBeVisible();
    });

    await test.step('List shows Add job title, the columns and the row controls', async () => {
        await expect(addJobTitle(page)).toBeVisible();
        for (const column of ['Job title', 'Employees', 'Actions']) await expect(page.getByText(column, { exact: true }).first()).toBeVisible();
        await expect(page.locator('input[aria-label^="Job title "]').first()).toBeVisible();
        const [first] = await titleNames(page);
        await expect(renameIcon(page, first)).toBeVisible();
        await expect(count(page, first)).toHaveText(/^\d+$/);
    });

    await test.step('Clicking the Job title header sorts descending then ascending', async () => {
        const ascending = await titleNames(page);
        await page.getByText('Job title', { exact: true }).first().click();
        await expect.poll(() => titleNames(page)).toEqual([...ascending].reverse());
        await page.getByText('Job title', { exact: true }).first().click();
        await expect.poll(() => titleNames(page)).toEqual(ascending);
    });
}

async function blankEntries(page: Page): Promise<void> {
    await test.step('A blank entry has only a cancel control and Add is disabled', async () => {
        await addJobTitle(page).click();
        await expect(blankEntry(page)).toBeFocused();
        await expect(addJobTitle(page)).toBeDisabled();
        await expect(page.getByRole('button', { name: /cancel/i })).toHaveCount(1);
    });

    await test.step('Cancel removes it with no confirmation', async () => {
        await page.getByRole('button', { name: /cancel/i }).click();
        await expect(blankEntry(page)).toHaveCount(0);
        await expect(dialog(page)).toHaveCount(0);
    });

    await test.step('Clicking away, Tab or only spaces also remove it', async () => {
        for (const how of ['Away', 'Tab', 'Spaces'] as const) {
            await addJobTitle(page).click();
            await expect(blankEntry(page)).toBeFocused();
            if (how === 'Spaces') {
                await page.keyboard.type('    ');
                await page.keyboard.press('Enter');
            } else {
                await finishEntry(page, how);
            }
            await expect(blankEntry(page)).toHaveCount(0);
        }
    });
}

async function addingTitles(page: Page, names: string[]): Promise<void> {
    const [first, second, third, accents, special, padded] = names;

    await test.step('Adding with Enter, Tab and a click away', async () => {
        await addTitle(page, first, 'Enter');
        await expect(count(page, first)).toHaveText('0');
        await expect(renameIcon(page, first)).toBeVisible();
        await expect(deleteIcon(page, first)).toBeVisible();
        await addTitle(page, second, 'Tab');
        await addTitle(page, third, 'Away');
    });

    await test.step('A duplicate in another case or with spaces keeps the entry open', async () => {
        await addJobTitle(page).click();
        await page.keyboard.type(first.toUpperCase());
        await page.keyboard.press('Enter');
        await exists(page, first);
        await expect(blankEntry(page)).toHaveValue(first.toUpperCase());
        await blankEntry(page).fill(`  ${second}  `);
        await page.keyboard.press('Tab');
        await exists(page, second);
        await page.getByRole('button', { name: /cancel/i }).click();
        await expect(blankEntry(page)).toHaveCount(0);
    });

    await test.step('Special characters and accents are kept as typed', async () => {
        await addTitle(page, special);
        await addTitle(page, accents);
    });

    await test.step('Extra spaces around a name are trimmed', async () => {
        await addJobTitle(page).click();
        await page.keyboard.type(`   ${padded}   `);
        await page.keyboard.press('Enter');
        await expect(toast(page, 'Job title added').first()).toBeVisible();
        await expect(titleInput(page, padded)).toHaveValue(padded);
    });
}

async function renamingUnused(page: Page, from: string, other: string, renamed: string): Promise<void> {
    await test.step('Renaming an unused title applies at once with no dialog', async () => {
        await renameTitle(page, from, renamed);
        await expect(toast(page, 'Job title renamed').first()).toBeVisible();
        await expect(dialog(page)).toHaveCount(0);
        await expect(titleInput(page, renamed)).toBeVisible();
    });

    await test.step('Renaming into an existing title is blocked', async () => {
        await renameTitle(page, renamed, other.toLowerCase());
        await exists(page, other);
        await expect(titleInput(page, other)).toBeVisible();
    });

    await test.step('The same name changes nothing; only the case changes it', async () => {
        await titleInput(page, renamed).fill(renamed);
        await page.keyboard.press('Enter');
        await expect(titleInput(page, renamed)).toBeVisible();
        await renameTitle(page, renamed, renamed.toUpperCase());
        await expect(toast(page, 'Job title renamed').first()).toBeVisible();
        await expect(titleInput(page, renamed.toUpperCase())).toBeVisible();
    });

    await test.step('Escape puts the old name back', async () => {
        const name = renamed.toUpperCase();
        await renameIcon(page, name).click();
        await titleInput(page, name).fill('SabihAutomationTesting Escape');
        await page.keyboard.press('Escape');
        await expect(titleInput(page, name)).toHaveValue(name);
        await expect(titleInput(page, 'SabihAutomationTesting Escape')).toHaveCount(0);
    });
}

async function deleteUnused(page: Page, name: string): Promise<void> {
    await test.step('Delete asks first and No keeps the title', async () => {
        await deleteIcon(page, name).click();
        await expect(dialog(page)).toContainText(`Are you sure you want to delete "${name}"?`);
        await expect(dialog(page)).toContainText('This action cannot be undone.');
        await answerConfirmation(page, 'No');
        await expect(titleInput(page, name)).toBeVisible();
    });

    await test.step('Yes deletes it', () => removeTitle(page, name));
}

async function titleHeldByEmployee(page: Page, held: string, other: string, renamed: string, employee: string): Promise<void> {
    await test.step('Give a new employee the title', async () => {
        await openEmployees(page);
        await prepareEmployee(page, employee);
        await openEmployee(page, employee);
        await setEmployeeJobTitle(page, held);
        await backToEmployees(page);
    });

    await test.step('A held title shows its count and loses the delete icon', async () => {
        await openProfessionalStandardsPage(page, 'Job Titles', addJobTitle(page));
        await expect(count(page, held)).toHaveText('1');
        await expect(deleteIcon(page, held)).toHaveCount(0);
        await expect(renameIcon(page, held)).toBeVisible();
    });

    await test.step('Renaming a held title checks duplicates before any dialog', async () => {
        await renameTitle(page, held, other);
        await exists(page, other);
        await expect(dialog(page)).toHaveCount(0);
    });

    await test.step('A new name asks first, No keeps it and Yes renames it', async () => {
        await titleInput(page, held).fill(renamed);
        await page.keyboard.press('Enter');
        await expect(dialog(page)).toContainText(`Rename "${held}" to "${renamed}"?`);
        await expect(dialog(page)).toContainText('1 employee currently holds this job title, and their record will be updated to match.');
        await answerConfirmation(page, 'No');
        await expect(titleInput(page, held)).toBeVisible();
        await renameTitle(page, held, renamed);
        await answerConfirmation(page, 'Yes');
        await expect(toast(page, 'Job title renamed').first()).toBeVisible();
        await expect(count(page, renamed)).toHaveText('1');
    });

    await test.step('The employee and the Employees filter use the new name', async () => {
        await openEmployees(page);
        await openEmployee(page, employee);
        await expect(page.locator('body')).toContainText(`${renamed} ·`);
        await backToEmployees(page);
        await page.getByRole('combobox', { name: 'Job title' }).first().click();
        const options = await page.getByRole('option').allInnerTexts();
        expect(options).toContain(renamed);
        expect(options).not.toContain(held);
        await page.keyboard.press('Escape');
    });

    await test.step('Moving the employee to another title moves the counts', async () => {
        await openEmployee(page, employee);
        await setEmployeeJobTitle(page, other);
        await backToEmployees(page);
        await openProfessionalStandardsPage(page, 'Job Titles', addJobTitle(page));
        await expect(count(page, renamed)).toHaveText('0');
        await expect(deleteIcon(page, renamed)).toBeVisible();
        await expect(count(page, other)).toHaveText('1');
        await expect(deleteIcon(page, other)).toHaveCount(0);
    });

    await test.step('Add employee lists None and every job title', async () => {
        await openEmployees(page);
        await addEmployeeButton(page).click();
        await page.getByRole('button', { name: /add more details/i }).click();
        await page.locator('#add-employee-job-title').click();
        const options = await page.getByRole('option').allInnerTexts();
        expect(options).toContain('None');
        expect(options).toContain(renamed);
        await page.keyboard.press('Escape');
        await dialog(page).getByText(/^cancel$/i).click();
        await expect(dialog(page)).toHaveCount(0);
    });
}

async function historyEntries(page: Page): Promise<void> {
    await test.step('History records the changes and the renamed entry shows old and new', async () => {
        await openProfessionalStandardsPage(page, 'Job Titles', addJobTitle(page));
        const history = await openHistory(page);
        await expect(history).toContainText('Performed By');
        for (const action of ['Job title added', 'Job title renamed', 'Job title deleted']) {
            await expect(history.getByText(action, { exact: true }).first()).toBeVisible();
        }
        await history.getByText('Job title renamed', { exact: true }).first().click();
        await expect(history).toContainText('Changed Value(s)');
        await closeHistory(page);
    });
}

/** Clears the employee's title, makes them inactive and deletes every test title. */
async function cleanUp(page: Page, employee: string): Promise<void> {
    await page.keyboard.press('Escape').catch(() => undefined);
    await dismissOverlays(page);
    await openEmployees(page);
    await openEmployee(page, employee).catch(() => undefined);
    if (await page.getByText('Employee Details').count()) {
        await setEmployeeJobTitle(page, 'None');
        await setEmployeeStatus(page, 'Inactive');
        await backToEmployees(page);
    }
    await openProfessionalStandardsPage(page, 'Job Titles', addJobTitle(page));
    for (const name of (await titleNames(page)).filter((n) => n.toLowerCase().startsWith(AUTOMATION_PREFIX.toLowerCase()))) {
        if (await deleteIcon(page, name).count()) await removeTitle(page, name);
    }
}

// --- Test
test('T-77109 Job Titles', async ({ page }) => {
    test.setTimeout(600000);
    await openJobTitles(page);

    const [first, second, third, held, renamedUnused, renamedHeld, accentsBase, specialBase, padded] = automationNames(9);
    const employee = `${AUTOMATION_PREFIX}2`;
    const accents = `${accentsBase} Café ñ`;
    const special = `${specialBase} <b>&"x"`;

    let passed = false;
    try {
        await test.step('Page, helper text, list and sorting', () => pageAndList(page));
        await test.step('Blank entries', () => blankEntries(page));
        await test.step('Adding titles', () => addingTitles(page, [first, second, third, accents, special, padded]));
        await test.step('Renaming an unused title', () => renamingUnused(page, first, second, renamedUnused));
        await test.step('Deleting an unused title', () => deleteUnused(page, third));
        await test.step('A title held by an employee', async () => {
            await addTitle(page, held);
            await titleHeldByEmployee(page, held, second, renamedHeld, employee);
        });
        await test.step('History', () => historyEntries(page));
        passed = true;
    } finally {
        // a failed run keeps its own error instead of the cleanup's
        await cleanUp(page, employee).catch((error) => {
            if (passed) throw error;
        });
    }
});
