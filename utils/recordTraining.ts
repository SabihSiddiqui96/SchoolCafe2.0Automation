import { expect, Locator, Page } from '@playwright/test';
import {
    addEmployee,
    backToEmployees,
    freshEmployeeNames,
    openEmployee,
    openEmployees,
    openProfessionalStandardsPage,
    setEmployeeStatus,
    toast,
} from './professionalStandards';

export const trainingSearch = (page: Page): Locator => page.getByPlaceholder('Search trainings');
export const recordOtherButton = (page: Page): Locator => page.locator('#record-other-training');
export const continueButton = (page: Page): Locator => page.getByRole('button', { name: 'Continue', exact: true });
export const cancelFlow = (page: Page): Locator => page.locator('#record-cancel');
export const recordEventButton = (page: Page): Locator => page.getByRole('button', { name: 'Record this Training Event' });
export const attendeeSearch = (page: Page): Locator => page.getByPlaceholder('Search by name or employee ID');
export const main = (page: Page): Locator => page.locator('main');
export const mainText = async (page: Page): Promise<string> => (await main(page).innerText()).replace(/\s+/g, ' ');

/** The tile or row for a training; its accessible name starts with the training name. */
export const trainingTile = (page: Page, name: string): Locator =>
    page.getByRole('button', { name: new RegExp(`^${name}[,\\s]`) }).first();

export async function openRecordTraining(page: Page): Promise<void> {
    await openProfessionalStandardsPage(page, 'Record Training', trainingSearch(page));
    await expect(trainingSearch(page)).toBeVisible();
    await expect(recordOtherButton(page)).toBeVisible();
}

/** Leaves a recording flow from wherever it is, discarding what was entered. */
export async function leaveFlow(page: Page): Promise<void> {
    if (!(await cancelFlow(page).count())) return;
    await cancelFlow(page).click();
    const discard = page.getByText(/^discard changes$/i);
    await expect(discard.or(trainingSearch(page)).first()).toBeVisible();
    if (await discard.count()) await discard.click();
    await expect(trainingSearch(page)).toBeVisible();
}

/** Back on the Record Training list from any state, flow or not. */
export async function backOnList(page: Page): Promise<void> {
    await leaveFlow(page);
    if (!(await trainingSearch(page).count())) await openRecordTraining(page);
}

export async function openTraining(page: Page, name: string): Promise<void> {
    await backOnList(page);
    await expect(trainingTile(page, name)).toBeVisible();
    await trainingTile(page, name).click();
    await expect(page.getByText('Step 1 of 2')).toBeVisible();
}

export async function openOther(page: Page): Promise<void> {
    await backOnList(page);
    await recordOtherButton(page).click();
    await expect(page.getByText('Step 1 of 2 · Details')).toBeVisible();
}

export async function toStep2(page: Page): Promise<void> {
    await continueButton(page).click();
    await expect(page.getByText('Step 2 of 2')).toBeVisible();
}

/** Adds an employee from the quick search and waits for them to show on the list. */
export async function addAttendee(page: Page, name: string): Promise<void> {
    await attendeeSearch(page).fill(name);
    await page.getByRole('option').first().click();
    await expect(main(page).locator('li').filter({ hasText: `${name} ${name}` })).toBeVisible();
}

/** Creates active test employees and returns their names. */
export async function createAttendees(page: Page, count: number): Promise<string[]> {
    await openEmployees(page);
    const names = await freshEmployeeNames(page, count);
    for (const name of names) await addEmployee(page, name);
    return names;
}

/** Test employees cannot be deleted, so they are left inactive. */
export async function retireAttendees(page: Page, names: string[]): Promise<void> {
    await openEmployees(page);
    for (const name of names) {
        await openEmployee(page, name);
        await setEmployeeStatus(page, 'Inactive');
        await backToEmployees(page);
    }
}

export async function recordAndReturn(page: Page, trainingName: string, attended: number): Promise<void> {
    await recordEventButton(page).click();
    await expect(toast(page, `Training Event recorded for ${trainingName} (${attended} attended)`).first()).toBeVisible();
    await expect(trainingSearch(page)).toBeVisible();
}
