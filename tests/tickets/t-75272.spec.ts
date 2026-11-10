// Professional Standards - Record Training - main page and filters

import { test, expect, Page } from '@playwright/test';
import { automationNames, createCertificate, dialog, loginToSchoolCafe2 } from '../../utils/professionalStandards';
import { cleanUp, createTemplate, openTemplates, setCertificateStatus } from '../../utils/trainingTemplates';
import { backOnList, mainText, openOther, openRecordTraining, recordOtherButton, trainingSearch, trainingTile } from '../../utils/recordTraining';

// --- Locators
const advancedButton = (page: Page) => page.locator('#record-training-advanced');
const gridButton = (page: Page) => page.getByRole('button', { name: 'Grid', exact: true });
const listButton = (page: Page) => page.getByRole('button', { name: 'List', exact: true });
const closePanel = (page: Page) => page.getByRole('button', { name: 'Close advanced search' });
const choice = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const dropdown = (page: Page, index: number) => page.getByRole('combobox').nth(index + 1);
const lowered = async (page: Page) => (await mainText(page)).toLowerCase();
const shows = (page: Page, text: string) => expect.poll(() => lowered(page), { timeout: 15000 }).toContain(text.toLowerCase());
const hides = (page: Page, text: string) => expect.poll(() => lowered(page), { timeout: 15000 }).not.toContain(text.toLowerCase());
const mine = (page: Page, names: string[]) => Promise.all(names.map((n) => trainingTile(page, n).count()));

async function openPanel(page: Page): Promise<void> {
    if (!(await closePanel(page).count())) await advancedButton(page).click();
    await expect(closePanel(page)).toBeVisible();
}

async function clearAll(page: Page): Promise<void> {
    await trainingSearch(page).fill('');
    await openPanel(page);
    const clear = page.getByText('Clear filters', { exact: true }).first();
    if (await clear.count()) await clear.click();
    await closePanel(page).click();
}

// --- Sections
async function pageLayout(page: Page): Promise<void> {
    await test.step('The page has its toolbar, the sites line and Record other training', async () => {
        await openRecordTraining(page);
        for (const part of ['Record Training', 'Your sites:']) await shows(page, part);
        await expect(trainingSearch(page)).toBeVisible();
        await expect(advancedButton(page)).toBeVisible();
        await expect(gridButton(page)).toHaveAttribute('aria-pressed', 'true');
        await expect(listButton(page)).toHaveAttribute('aria-pressed', 'false');
        await expect(recordOtherButton(page)).toBeVisible();
        await recordOtherButton(page).hover();
        await expect(page.getByRole('tooltip')).toContainText("For training that isn't on the list");
    });

    await test.step('Record other training opens its screen and Cancel returns', async () => {
        await openOther(page);
        await expect(page.getByText('Step 1 of 2 · Details')).toBeVisible();
        await backOnList(page);
        await expect(trainingSearch(page)).toBeVisible();
    });
}

async function tiles(page: Page, t: { mandatory: string; plain: string; split: string }): Promise<void> {
    await test.step('Tiles name the hours, mandatory and certificate', async () => {
        await expect(trainingTile(page, t.mandatory)).toHaveAccessibleName(new RegExp(`^${t.mandatory}, Mandatory, 1\\.5 CEU hours, Awards a certificate`));
        await expect(trainingTile(page, t.plain)).toHaveAccessibleName(new RegExp(`^${t.plain}, 0\\.5 CEU hours, Awards a certificate$`));
        await expect(trainingTile(page, t.split)).toHaveAccessibleName(new RegExp(`^${t.split}, 2\\.5 CEU hours`));
    });

    await test.step('List view shows the same trainings with hours and key area', async () => {
        const gridOrder = await page.getByRole('button', { name: /^SabihAutomationTesting\d+[,\s]/ }).evaluateAll((e) => e.map((x) => (x.getAttribute('aria-label') ?? '').split(',')[0]));
        await listButton(page).click();
        await expect(listButton(page)).toHaveAttribute('aria-pressed', 'true');
        const listOrder = await page.getByRole('button', { name: /^SabihAutomationTesting\d+[,\s]/ }).evaluateAll((e) => e.map((x) => (x.getAttribute('aria-label') ?? '').split(',')[0]));
        expect(listOrder).toEqual(gridOrder);
        await shows(page, '1.5 CEU hrs');
        await gridButton(page).click();
        await expect(gridButton(page)).toHaveAttribute('aria-pressed', 'true');
    });
}

async function searching(page: Page, t: { mandatory: string; plain: string }): Promise<void> {
    await test.step('Search filters as you type and ignores case and spaces', async () => {
        const part = t.mandatory;
        for (const text of [part, part.toLowerCase(), part.toUpperCase(), `  ${part}  `]) {
            await trainingSearch(page).fill(text);
            await expect(trainingTile(page, t.mandatory)).toBeVisible();
            await expect(trainingTile(page, t.plain)).toHaveCount(0);
        }
    });

    await test.step('No match says so and offers Record other training', async () => {
        await trainingSearch(page).fill('zzzz');
        await shows(page, 'No trainings match.');
        await shows(page, 'Not on the list? Record other training');
        await page.getByRole('button', { name: 'Record other training' }).last().click();
        await expect(page.getByText('Step 1 of 2 · Details')).toBeVisible();
        await backOnList(page);
        await trainingSearch(page).fill('');
    });
}

async function advancedSearch(page: Page, t: { mandatory: string; plain: string; split: string }, certificate: string): Promise<void> {
    const all = [t.mandatory, t.plain, t.split];
    await test.step('The panel offers every filter and a count', async () => {
        await openPanel(page);
        for (const part of ['Key area', 'CEU hours', 'No CEU hours', 'Under 1', '1 to 2', 'Over 2', 'Mandatory', 'Not mandatory', 'Certificate', 'Sort by', 'Showing']) await shows(page, part);
        await expect(advancedButton(page)).toBeVisible();
    });

    await test.step('CEU hours options split the trainings by their total', async () => {
        await choice(page, 'Under 1').click();
        expect(await mine(page, all)).toEqual([0, 1, 0]);
        await choice(page, '1 to 2').click();
        expect(await mine(page, all)).toEqual([1, 0, 0]);
        await choice(page, 'Over 2').click();
        expect(await mine(page, all)).toEqual([0, 0, 1]);
        await expect(advancedButton(page)).toContainText('(1)');
        await choice(page, 'Any').first().click();
        expect(await mine(page, all)).toEqual([1, 1, 1]);
    });

    await test.step('Mandatory and Not mandatory split the list', async () => {
        await choice(page, 'Mandatory').click();
        expect(await mine(page, all)).toEqual([1, 0, 0]);
        await choice(page, 'Not mandatory').click();
        expect(await mine(page, all)).toEqual([0, 1, 1]);
        await choice(page, 'Any').last().click();
        expect(await mine(page, all)).toEqual([1, 1, 1]);
    });

    await test.step('The certificate dropdown filters by award', async () => {
        await dropdown(page, 0).click();
        const options = await page.getByRole('option').allInnerTexts();
        expect(options).toEqual(expect.arrayContaining(['Any', 'Awards a certificate', 'No certificate', 'Test Cert']));
        await page.getByRole('option', { name: 'Awards a certificate', exact: true }).click();
        expect(await mine(page, all)).toEqual([1, 1, 0]);
        await dropdown(page, 0).click();
        await page.getByRole('option', { name: 'No certificate', exact: true }).click();
        expect(await mine(page, all)).toEqual([0, 0, 1]);
        await dropdown(page, 0).click();
        await page.getByRole('option', { name: 'Test Cert', exact: true }).click();
        expect(await mine(page, all)).toEqual([1, 0, 0]);
        await dropdown(page, 0).click();
        await page.getByRole('option', { name: 'Any', exact: true }).click();
        await expect.poll(() => mine(page, all)).toEqual([1, 1, 1]);
        expect(certificate).toBeTruthy();
    });

    await test.step('Sort by orders by name and hours', async () => {
        await trainingSearch(page).fill('SabihAutomationTesting');
        const order = async () => {
            const names = await page.getByRole('button', { name: /^SabihAutomationTesting\d+[,\s]/ }).evaluateAll((e) => e.map((x) => (x.getAttribute('aria-label') ?? '').split(',')[0]));
            return names.filter((n) => all.includes(n));
        };
        await dropdown(page, 1).click();
        const options = await page.getByRole('option').allInnerTexts();
        expect(options).toEqual(expect.arrayContaining(['Name A to Z', 'Hours: high to low', 'Hours: low to high']));
        await page.getByRole('option', { name: 'Hours: high to low', exact: true }).click();
        await expect.poll(order).toEqual([t.split, t.mandatory, t.plain]);
        await dropdown(page, 1).click();
        await page.getByRole('option', { name: 'Hours: low to high', exact: true }).click();
        await expect.poll(order).toEqual([t.plain, t.mandatory, t.split]);
        await dropdown(page, 1).click();
        await page.getByRole('option', { name: 'Name A to Z', exact: true }).click();
        await expect.poll(order).toEqual([...all].sort((a, b) => a.localeCompare(b)));
    });

    await test.step('Clearing keeps the search and the closed panel notes the filters', async () => {
        await choice(page, 'Mandatory').click();
        await trainingSearch(page).fill('SabihAutomationTesting');
        await closePanel(page).click();
        await shows(page, 'Filters applied: showing');
        await page.getByText('Clear filters', { exact: true }).first().click();
        await hides(page, 'Filters applied');
        await expect(trainingSearch(page)).toHaveValue('SabihAutomationTesting');
        await clearAll(page);
    });

    await test.step('Switching between Grid and List keeps the filter', async () => {
        await openPanel(page);
        await choice(page, 'Not mandatory').click();
        await listButton(page).click();
        expect(await mine(page, all)).toEqual([0, 1, 1]);
        await gridButton(page).click();
        expect(await mine(page, all)).toEqual([0, 1, 1]);
        await clearAll(page);
    });
}

async function warnings(page: Page, t: { mandatory: string; plain: string }, certificate: string): Promise<void> {
    await test.step('An inactive certificate puts a warning on the tile and the template still opens', async () => {
        await setCertificateStatus(page, certificate, 'Inactive');
        await openRecordTraining(page);
        await expect(trainingTile(page, t.plain)).toHaveAccessibleName(/Can't be recorded until fixed: Inactive certificate/);
        await trainingTile(page, t.plain).click();
        await expect(page.getByText("This training can't be recorded")).toBeVisible();
        await backOnList(page);
        await setCertificateStatus(page, certificate, 'Active');
        await openRecordTraining(page);
        await expect(trainingTile(page, t.plain)).not.toHaveAccessibleName(/Can't be recorded/);
    });
}

async function lastOpened(page: Page, t: { mandatory: string; plain: string }): Promise<void> {
    await test.step('The last opened training is marked until another area is opened', async () => {
        await trainingTile(page, t.mandatory).click();
        await expect(page.getByText('Step 1 of 2')).toBeVisible();
        await page.getByRole('button', { name: 'Cancel' }).first().click();
        await expect(trainingSearch(page)).toBeVisible();
        await expect(trainingTile(page, t.mandatory)).toHaveAccessibleName(/Last opened/);
        await trainingTile(page, t.plain).click();
        await page.getByRole('button', { name: 'Cancel' }).first().click();
        await expect(trainingSearch(page)).toBeVisible();
        await expect(trainingTile(page, t.plain)).toHaveAccessibleName(/Last opened/);
        await expect(trainingTile(page, t.mandatory)).not.toHaveAccessibleName(/Last opened/);
    });
}

async function keyboardUse(page: Page, t: { mandatory: string; plain: string }): Promise<void> {
    await test.step('Enter and Space open a training from the keyboard', async () => {
        await trainingTile(page, t.mandatory).focus();
        await page.keyboard.press('Enter');
        await expect(page.getByText('Step 1 of 2')).toBeVisible();
        await page.getByRole('button', { name: 'Cancel' }).first().click();
        await expect(trainingSearch(page)).toBeVisible();
        await trainingTile(page, t.plain).focus();
        await page.keyboard.press('Space');
        await expect(page.getByText('Step 1 of 2')).toBeVisible();
        await page.getByRole('button', { name: 'Cancel' }).first().click();
        await expect(trainingSearch(page)).toBeVisible();
    });
}

// --- Test
test('T-75272 Record Training main page and filters', async ({ page }) => {
    test.setTimeout(900000);
    await loginToSchoolCafe2(page);

    const [mandatory, plain, split] = automationNames(3);
    const t = { mandatory, plain, split };
    let passed = false;
    try {
        await cleanUp(page);
        const certificate = await createCertificate(page);
        await openTemplates(page);
        await createTemplate(page, { name: mandatory, hours: 1.5, topic: '1110', mandatory: true, certificate: 'Test Cert' });
        await createTemplate(page, { name: plain, hours: 0.5, topic: '1110', certificate });
        await createTemplate(page, { name: split, hours: 2.5, topic: '2110' });

        await test.step('Page layout', () => pageLayout(page));
        await test.step('Tiles and List view', () => tiles(page, t));
        await test.step('Search', () => searching(page, t));
        await test.step('Advanced search', () => advancedSearch(page, t, certificate));
        await test.step('Warnings', () => warnings(page, t, certificate));
        await test.step('Last opened', () => lastOpened(page, t));
        await test.step('Keyboard', () => keyboardUse(page, t));
        passed = true;
    } finally {
        // a failed run keeps its own error instead of the cleanup's
        await (async () => {
            if (await dialog(page).count()) await page.keyboard.press('Escape');
            await backOnList(page);
            await cleanUp(page);
        })().catch((error) => {
            if (passed) throw error;
        });
    }
});
