// Professional Standards - Configuration - CEU Levels

import { test, expect, Page } from '@playwright/test';
import {
    dialog,
    loginToSchoolCafe2,
    openHistory,
    openProfessionalStandardsPage,
    toast,
} from '../../utils/professionalStandards';

// --- Locators
const ROLES = ['Program Director', 'Manager', 'Program Staff', '<20 Hours Staff'] as const;
type Role = (typeof ROLES)[number];
type Hours = Record<Role, number>;

const YEAR_SELECT = (page: Page) => page.getByRole('combobox').filter({ hasText: /\d{4} - \d{4}/ });
const hoursField = (page: Page, role: Role) =>
    page.getByRole('spinbutton', { name: `${role} Required hours` });
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const ABOVE_DEFAULT_ICON = '[aria-label*="Set above the USDA default"]';

const UPDATED_TOAST = 'Successfully updated CEU hour requirements';
const RESTORED_TOAST = 'Successfully restored the default USDA CEU requirements';
const BELOW_DEFAULT = (hours: number) =>
    `Below USDA requirements, stays visible until raised to at least ${hours} hrs/yr.`;

// --- Helpers
async function openCeuLevels(page: Page): Promise<void> {
    await loginToSchoolCafe2(page);
    await openProfessionalStandardsPage(page, 'CEU Levels', YEAR_SELECT(page));
}

async function yearOptions(page: Page): Promise<string[]> {
    await YEAR_SELECT(page).click();
    const options = await page.getByRole('option').allInnerTexts();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    return options;
}

async function selectYear(page: Page, year: string): Promise<void> {
    await YEAR_SELECT(page).click();
    await page.getByRole('option', { name: year, exact: true }).click();
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(YEAR_SELECT(page)).toHaveText(year);
}

/** The labels of the current year, the year before it and the year after it. */
async function programYears(page: Page) {
    const options = await yearOptions(page);
    const at = options.findIndex((o) => /\(Current\)/.test(o));
    expect(at, 'a year marked (Current)').toBeGreaterThan(0);
    return { past: options[at - 1], current: options[at], future: options[at + 1], options };
}

async function readHours(page: Page): Promise<Hours> {
    const lines = (await page.locator('body').innerText())
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    const hours = {} as Hours;
    for (const role of ROLES) {
        const start = lines.indexOf(role);
        const value = lines.slice(start + 1, start + 4).find((l) => /^[\d.]+ hrs\/yr$/.test(l));
        hours[role] = value ? parseFloat(value) : NaN;
    }
    return hours;
}

async function writeHours(page: Page, values: Partial<Hours>): Promise<void> {
    for (const [role, value] of Object.entries(values)) {
        await hoursField(page, role as Role).fill(String(value));
    }
}

async function saveChanges(page: Page, note: string, year: string): Promise<void> {
    await button(page, 'Save').click();
    await expect(dialog(page)).toContainText('Confirm changes');
    await expect(dialog(page)).toContainText(`Program year: ${year.replace(' (Current)', '')}`);
    await expect(button(page, 'Confirm')).toBeDisabled();
    await dialog(page).locator('textarea').first().fill(note);
    await button(page, 'Confirm').click();
    await expect(toast(page, UPDATED_TOAST).first()).toBeVisible();
}

async function restoreDefaults(page: Page, note: string): Promise<void> {
    await button(page, 'Restore defaults').click();
    await dialog(page).locator('textarea').first().fill(note);
    await button(page, 'Yes, restore defaults').click();
    await expect(toast(page, RESTORED_TOAST).first()).toBeVisible();
    await expect(button(page, 'Restore defaults')).toHaveCount(0);
}

/** Puts the selected year back to the USDA defaults and returns them. */
async function resetYear(page: Page, year: string): Promise<Hours> {
    await selectYear(page, year);
    await expect(button(page, 'Edit')).toBeVisible();
    if (await button(page, 'Restore defaults').count()) await restoreDefaults(page, 'QA cleanup');
    return readHours(page);
}

// --- Tests
test.describe('T-75277 CEU Levels', () => {
    test.describe.configure({ timeout: 180000 });
    test('T-75277 page, program years and locked past years', async ({ page }) => {
        await openCeuLevels(page);
        const years = await programYears(page);

        await test.step('Program year selector loads on the current year', async () => {
            await expect(YEAR_SELECT(page)).toHaveText(years.current);
            expect(years.options.length).toBeGreaterThan(2);
            expect(years.past).toBeTruthy();
            expect(years.future).toBeTruthy();
        });

        await test.step('Four roles are listed with their hours', async () => {
            for (const role of ROLES) {
                await expect.poll(async () => (await readHours(page))[role], { message: role }).toBeGreaterThan(0);
            }
            await expect(button(page, 'History')).toBeVisible();
        });

        await test.step('Viewing shows Edit and no Restore defaults at defaults', async () => {
            await resetYear(page, years.current);
            await expect(button(page, 'Edit')).toBeEnabled();
            await expect(button(page, 'Restore defaults')).toHaveCount(0);
        });

        await test.step('Past year is locked', async () => {
            await selectYear(page, years.past);
            await expect(button(page, 'Edit')).toBeDisabled();
            await button(page, 'Edit').hover({ force: true });
            await expect(page.getByText("Past program years are locked and can't be edited.")).toBeVisible();
        });

        await test.step('Future year can be edited', async () => {
            await selectYear(page, years.future);
            await expect(button(page, 'Edit')).toBeEnabled();
        });
    });

    test('T-75277 edit mode, warnings and validation', async ({ page }) => {
        await openCeuLevels(page);
        const years = await programYears(page);
        const defaults = await resetYear(page, years.future);
        const above = defaults.Manager + 2;

        await button(page, 'Edit').click();

        await test.step('Edit shows Cancel and no Save until a value changes', async () => {
            await expect(button(page, 'Cancel')).toBeVisible();
            await expect(button(page, 'Save')).toHaveCount(0);
            for (const role of ROLES) {
                await expect(hoursField(page, role)).toHaveValue(String(defaults[role]));
                await expect(hoursField(page, role)).toHaveAttribute('min', '0');
                await expect(hoursField(page, role)).toHaveAttribute('max', '100');
                await expect(hoursField(page, role)).toHaveAttribute('step', '0.5');
            }
        });

        await test.step('Below default warns live and shows Save', async () => {
            await writeHours(page, { Manager: defaults.Manager - 2 });
            await expect(page.getByText(BELOW_DEFAULT(defaults.Manager))).toBeVisible();
            await expect(button(page, 'Save')).toBeVisible();
        });

        await test.step('Back at default clears the warning and Save', async () => {
            await writeHours(page, { Manager: defaults.Manager });
            await expect(page.getByText(/Below USDA requirements/)).toHaveCount(0);
            await expect(button(page, 'Save')).toHaveCount(0);
        });

        await test.step('Above default shows the up arrow with a tooltip', async () => {
            await writeHours(page, { Manager: above });
            await expect(page.getByText(/Below USDA requirements/)).toHaveCount(0);
            await page.locator(ABOVE_DEFAULT_ICON).first().hover();
            await expect(page.getByRole('tooltip')).toContainText(
                `Set above the USDA default of ${defaults.Manager} hrs/yr`,
            );
        });

        await test.step('Several roles below default each warn with their own default', async () => {
            await writeHours(page, {
                'Program Director': defaults['Program Director'] - 1,
                'Program Staff': defaults['Program Staff'] - 1,
                '<20 Hours Staff': defaults['<20 Hours Staff'] - 1,
            });
            for (const role of ['Program Director', 'Program Staff', '<20 Hours Staff'] as Role[]) {
                await expect(page.getByText(BELOW_DEFAULT(defaults[role]))).toBeVisible();
            }
        });

        await test.step('Only 0 to 100 in steps of 0.5 is accepted', async () => {
            const field = hoursField(page, 'Program Staff');
            for (const bad of ['100.5', '-1', '0.25', '101']) {
                await field.fill(bad);
                await expect(field).toHaveJSProperty('validity.valid', false);
                await expect(page.getByText('Enter 0 to 100 in steps of 0.5').first()).toBeVisible();
            }
            for (const good of ['0', '100', '7.5']) {
                await field.fill(good);
                await expect(field).toHaveJSProperty('validity.valid', true);
            }
        });

        await test.step('An invalid value does not offer Save', async () => {
            await writeHours(page, {
                'Program Director': defaults['Program Director'],
                'Program Staff': defaults['Program Staff'],
                '<20 Hours Staff': defaults['<20 Hours Staff'],
                Manager: defaults.Manager + 0.25,
            });
            await expect(button(page, 'Save')).toHaveCount(0);
        });

        await test.step('Cancel reverts every field and leaves edit mode', async () => {
            await writeHours(page, { Manager: above, 'Program Staff': defaults['Program Staff'] + 3 });
            await button(page, 'Cancel').click();
            await expect(button(page, 'Edit')).toBeVisible();
            await expect.poll(() => readHours(page)).toEqual(defaults);
        });
    });

    test('T-75277 save, restore defaults and history', async ({ page }) => {
        await openCeuLevels(page);
        const years = await programYears(page);
        const defaults = await resetYear(page, years.future);
        const note = `QA save ${Date.now().toString(36)}`;
        const managerNew = defaults.Manager + 2;
        const staffNew = defaults['Program Staff'] - 2;

        try {
            await test.step('Save opens Confirm changes with only the changed roles', async () => {
                await button(page, 'Edit').click();
                await writeHours(page, { Manager: managerNew, 'Program Staff': staffNew });
                await button(page, 'Save').click();
                await expect(dialog(page)).toContainText('Confirm changes');
                await expect(dialog(page)).toContainText(`Program year: ${years.future}`);
                await expect(dialog(page)).toContainText(`${defaults.Manager} → ${managerNew} hrs/yr`);
                await expect(dialog(page)).toContainText(`${defaults['Program Staff']} → ${staffNew} hrs/yr`);
                await expect(dialog(page)).not.toContainText(`${defaults['Program Director']} →`);
                await expect(dialog(page)).toContainText(/\d+ employee\(s\) will become below required hours/);
                await expect(button(page, 'Confirm')).toBeDisabled();
            });

            await test.step('Confirm with a note saves and returns to viewing', async () => {
                await dialog(page).locator('textarea').first().fill(note);
                await button(page, 'Confirm').click();
                await expect(toast(page, UPDATED_TOAST).first()).toBeVisible();
                await expect(button(page, 'Edit')).toBeVisible();
                await expect.poll(() => readHours(page)).toMatchObject({
                    Manager: managerNew,
                    'Program Staff': staffNew,
                });
                await expect(page.getByText(BELOW_DEFAULT(defaults['Program Staff']))).toBeVisible();
                await expect(page.locator(ABOVE_DEFAULT_ICON).first()).toBeVisible();
            });

            await test.step('Restore defaults is hidden while editing', async () => {
                await expect(button(page, 'Restore defaults')).toBeVisible();
                await button(page, 'Edit').click();
                await expect(button(page, 'Restore defaults')).toHaveCount(0);
                await button(page, 'Cancel').click();
            });

            await test.step('Restore defaults lists only the roles that change', async () => {
                await button(page, 'Restore defaults').click();
                await expect(dialog(page)).toContainText(
                    'Are you sure you want to restore the default USDA CEU requirements?',
                );
                await expect(dialog(page)).toContainText(`${managerNew} → ${defaults.Manager} hrs/yr`);
                await expect(dialog(page)).toContainText('Only roles that are changing are shown.');
                await expect(button(page, 'Yes, restore defaults')).toBeDisabled();
                await button(page, 'Cancel').last().click();
                await expect.poll(() => readHours(page)).toMatchObject({ Manager: managerNew });
            });

            await test.step('Yes restores the defaults', async () => {
                await restoreDefaults(page, `${note} restore`);
                await expect.poll(() => readHours(page)).toEqual(defaults);
            });

            await test.step('History records who, what and the note', async () => {
                const history = await openHistory(page);
                await expect(history).toContainText('Performed By');
                await expect(history).toContainText('Date');
                await expect(history.getByText(`CEU hours updated for ${years.future} : ${note}`)).toBeVisible();
                await expect(history.getByText(`CEU hours restored to defaults for ${years.future} : ${note} restore`)).toBeVisible();
                await history.getByText(`CEU hours updated for ${years.future} : ${note}`).click();
                await expect(history).toContainText('Changed Value(s)');
                await expect(history).toContainText(String(managerNew));
                await expect(history).toContainText('Manager');
            });
        } finally {
            await page.keyboard.press('Escape').catch(() => undefined);
            await resetYear(page, years.future).catch(() => undefined);
        }
    });

    test('T-75277 current year save and restore', async ({ page }) => {
        await openCeuLevels(page);
        const years = await programYears(page);
        const defaults = await resetYear(page, years.current);
        const note = `QA current ${Date.now().toString(36)}`;
        const directorNew = defaults['Program Director'] + 2;
        const managerNew = defaults.Manager - 2;

        try {
            await button(page, 'Edit').click();
            await writeHours(page, { 'Program Director': directorNew, Manager: managerNew });
            await saveChanges(page, note, years.current);

            await test.step('The saved values survive a reload', async () => {
                await page.reload();
                await expect(YEAR_SELECT(page)).toHaveText(years.current);
                await expect.poll(() => readHours(page)).toMatchObject({
                    'Program Director': directorNew,
                    Manager: managerNew,
                });
                await expect(page.getByText(BELOW_DEFAULT(defaults.Manager))).toBeVisible();
            });

            await test.step('Restore defaults puts the current year back', async () => {
                await restoreDefaults(page, `${note} restore`);
                await expect.poll(() => readHours(page)).toEqual(defaults);
            });
        } finally {
            await resetYear(page, years.current).catch(() => undefined);
        }
    });
});
