import { expect, Locator, Page } from '@playwright/test';
import { getRequiredEnvVar } from './env';

export async function loginToSchoolCafe2(page: Page): Promise<void> {
    const email = getRequiredEnvVar('SC2_USERNAME');
    const password = getRequiredEnvVar('SC2_PASSWORD');

    // QA sometimes answers "Network connection is slow" - retry the whole sign-in
    await expect(async () => {
        await page.goto('/login');
        await page.locator('#email').fill(email);
        await page.locator('#password').fill(password);
        await page.locator('#login-submit').click();
        await expect(page).not.toHaveURL(/\/login/, { timeout: 15000 });
    }).toPass({ timeout: 150000, intervals: [3000, 20000, 30000] });

    await expect(page.getByRole('button', { name: 'Account' })).toBeVisible();
}

/** QA sometimes leaves a page on its loading spinner - reload until the page is ready. */
export async function waitForPageReady(page: Page, ready: Locator): Promise<void> {
    await expect(async () => {
        try {
            await expect(ready).toBeVisible({ timeout: 20000 });
        } catch (error) {
            await page.reload();
            throw error;
        }
    }).toPass({ timeout: 100000, intervals: [500] });
}

export async function openProfessionalStandardsPage(page: Page, menuName: string, ready: Locator): Promise<void> {
    await page.locator('nav div[title="Professional Standards"]').first().click();
    await page.getByRole('button', { name: menuName, exact: true }).first().click();
    await waitForPageReady(page, ready);
}

/** Clicks an element the page keeps re-rendering, retrying until a click lands. */
export async function clickWhenSettled(target: Locator): Promise<void> {
    await expect(async () => {
        await target.click({ timeout: 4000 });
    }).toPass({ timeout: 30000 });
}

export const toast = (page: Page, text: string | RegExp): Locator =>
    page.getByRole('alert').filter({ hasText: text });

export const dialog = (page: Page): Locator => page.getByRole('dialog').first();

export async function answerConfirmation(page: Page, answer: 'Yes' | 'No'): Promise<void> {
    await page.getByText(new RegExp(`^${answer}$`, 'i')).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
}

export async function openHistory(page: Page): Promise<Locator> {
    await page.getByRole('button', { name: 'History' }).click();
    const panel = page.getByRole('dialog').last();
    await expect(panel).toContainText('Performed Action');
    return panel;
}

export const uniqueName = (prefix: string): string => `${prefix} ${Date.now().toString(36)}`;
