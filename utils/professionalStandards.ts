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

/** The Configuration landing page lists these pages, sometimes under a slightly different name. */
const CONFIGURATION_PAGES: Record<string, string> = {
    'CEU Levels': 'CEU Levels',
    'Topics & Sub Topics': 'Topics & Sub-topics',
    'Sites & Locations': 'Sites & Locations',
    Certificates: 'Certificates',
    'Job Titles': 'Job Titles',
    Rosters: 'Rosters',
    'Training Sources and Methods': 'Training Sources and Methods',
};

const sideMenu = (page: Page, name: string): Locator => page.getByRole('button', { name, exact: true }).filter({ visible: true }).first();

/** Opens the Professional Standards menu when it is not showing, then Configuration and its landing page. */
export async function openConfiguration(page: Page): Promise<void> {
    if (!(await sideMenu(page, 'Configuration').count())) await page.locator('nav div[title="Professional Standards"]').first().click();
    await sideMenu(page, 'Configuration').click();
    await expect(page.getByText('Regular upkeep', { exact: true })).toBeVisible();
}

export async function openProfessionalStandardsPage(page: Page, menuName: string, ready: Locator): Promise<void> {
    const landingName = CONFIGURATION_PAGES[menuName];
    if (landingName) {
        await openConfiguration(page);
        await page.locator('main').getByRole('button', { name: landingName, exact: true }).click();
    } else {
        if (!(await sideMenu(page, menuName).count())) await page.locator('nav div[title="Professional Standards"]').first().click();
        await sideMenu(page, menuName).click();
    }
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
    await showMoreHistoryRows(page, panel);
    return panel;
}

/** The pipeline's window shows 10 rows a page, so older entries sit on later pages. */
async function showMoreHistoryRows(page: Page, panel: Locator): Promise<void> {
    const size = panel.getByRole('combobox', { name: 'Page size' });
    await size.waitFor({ timeout: 10000 }).catch(() => undefined);
    if (!(await size.count())) return;
    await size.click();
    await page.getByRole('option', { name: '50', exact: true }).click();
    await expect(size).toContainText('50');
}

/** Escape does not close the History drawer, and it hides the page behind it. */
export async function closeHistory(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Close drawer' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
}

export const uniqueName = (prefix: string): string => `${prefix} ${Date.now().toString(36)}`;

// --- Employees
export const AUTOMATION_PREFIX = 'SabihAutomationTesting';

/** Names for this run's test data: the prefix plus a number from the clock, so no list has to be read. */
export function automationNames(count: number): string[] {
    const d = new Date();
    const pad = (v: number) => String(v).padStart(2, '0');
    const stamp = `${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    return Array.from({ length: count }, (_, i) => `${AUTOMATION_PREFIX}${Number(stamp) * 10 + i}`);
}

export const addEmployeeButton = (page: Page): Locator => page.getByRole('button', { name: 'Add employee' });
export const searchBox = (page: Page): Locator => page.getByPlaceholder('Search by Name or ID');
export const employmentFilter = (page: Page): Locator => page.getByRole('combobox', { name: 'Employment status' }).first();
export const employeeRow = (page: Page, name: string): Locator => page.getByRole('row').filter({ hasText: `${name} ${name}` });

export async function openEmployees(page: Page): Promise<void> {
    await openProfessionalStandardsPage(page, 'Employees', addEmployeeButton(page));
}

export async function chooseOption(page: Page, control: Locator, option: string): Promise<void> {
    await control.click();
    await page.getByRole('option', { name: option, exact: true }).click();
    await expect(page.getByRole('listbox')).toHaveCount(0);
}

export async function searchEmployees(page: Page, text: string): Promise<void> {
    await searchBox(page).fill(text);
    await page.waitForLoadState('networkidle');
}

/** Adds an employee with the five required fields and returns once the row is listed. */
export async function addEmployee(page: Page, name: string, site?: string): Promise<void> {
    await addEmployeeButton(page).click();
    const form = page.getByRole('dialog').last();
    await form.locator('#add-employee-first-name').fill(name);
    await form.locator('#add-employee-last-name').fill(name);
    await form.locator('#add-employee-number').fill(name);
    await chooseOption(page, form.locator('#add-employee-site'), site ?? (await firstOption(page, form.locator('#add-employee-site'))));
    await chooseOption(page, form.locator('#add-employee-ceu-level'), '<20 Hours Staff');
    await form.getByRole('button', { name: 'Add employee' }).click();
    await expect(toast(page, 'Employee added').first()).toBeVisible();
}

export async function openEmployee(page: Page, name: string): Promise<void> {
    await chooseOption(page, employmentFilter(page), 'All employment');
    await searchEmployees(page, `${name} ${name}`);
    await employeeRow(page, name).click();
    await expect(page.getByText('Employee Details')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit name' })).toBeVisible();
}

/** Leaves the details page; confirms the discard prompt when one shows. */
export async function backToEmployees(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Back' }).first().click();
    if (await page.getByRole('dialog').count()) await answerConfirmation(page, 'Yes');
    await expect(addEmployeeButton(page)).toBeVisible();
}

const saveBar = (page: Page): Locator => page.getByRole('button', { name: 'Save', exact: true });

/** Commits the staged changes on the details page and waits for the bar to go. */
export async function saveEmployee(page: Page): Promise<void> {
    await saveBar(page).click();
    await expect(toast(page, 'Employee saved').first()).toBeVisible();
    await expect(saveBar(page)).toHaveCount(0);
}

export async function setEmployeeStatus(page: Page, status: 'Active' | 'Inactive'): Promise<void> {
    const pill = page.getByRole('switch', { name: 'Employment status' });
    if ((await pill.innerText()).trim() === status) return;
    await pill.click();
    await saveEmployee(page);
    await expect(pill).toHaveText(status);
}

/** Opens the Employment section for editing - the pill, ID, job title and site live there. */
export async function editEmployment(page: Page): Promise<void> {
    if (!(await page.locator('#employee-job-title').count())) {
        await page.getByRole('button', { name: 'Edit', exact: true }).nth(1).click();
    }
    await expect(page.locator('#employee-job-title')).toBeVisible();
}

/** Sets an employee's job title from their details page and saves. */
export async function setEmployeeJobTitle(page: Page, title: string): Promise<void> {
    await editEmployment(page);
    await chooseOption(page, page.locator('#employee-job-title'), title);
    await saveEmployee(page);
}

/** Closes a History drawer or dialog a failed step left open, so cleanup can reach the menu. */
export async function dismissOverlays(page: Page): Promise<void> {
    const close = page.getByRole('button', { name: 'Close drawer' });
    if (await close.count()) await close.click();
    if (await page.getByRole('dialog').count()) {
        await page.getByRole('dialog').last().getByText(/^(cancel|no)$/i).first().click({ timeout: 3000 }).catch(() => undefined);
    }
}

/** Puts the Employees directory back to its defaults. */
export async function resetEmployeesView(page: Page): Promise<void> {
    await chooseOption(page, employmentFilter(page), 'Active only');
    await chooseOption(page, page.getByRole('combobox', { name: 'Site' }).first(), 'All sites');
    await chooseOption(page, page.getByRole('combobox', { name: 'Job title' }).first(), 'All job titles');
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await searchEmployees(page, '');
}

/** The real choices of a dropdown, skipping None and the All entries. */
export async function realOptions(page: Page, control: Locator): Promise<string[]> {
    await control.click();
    const options = await page.getByRole('option').allInnerTexts();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    const real = options.filter((o) => o !== 'None' && !o.startsWith('All '));
    if (!real.length) throw new Error('The dropdown has no real option to pick');
    return real;
}

export async function firstOption(page: Page, control: Locator): Promise<string> {
    return (await realOptions(page, control))[0];
}

/** Adds a certificate that expires after 3 years; returns its name. */
export async function createCertificate(page: Page): Promise<string> {
    await openProfessionalStandardsPage(page, 'Certificates', page.getByRole('button', { name: 'Add certificate' }));
    const [name] = automationNames(1);
    await page.getByRole('button', { name: 'Add certificate' }).click();
    const form = page.getByRole('dialog').last();
    await form.getByRole('textbox').first().fill(name);
    await form.getByRole('checkbox', { name: 'This certificate expires' }).check();
    await chooseOption(page, form.getByRole('combobox'), '3 years');
    await form.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(toast(page, 'Certificate added').first()).toBeVisible();
    return name;
}

/** Deletes a certificate nobody holds any more, from the Certificates page. */
export async function deleteCertificate(page: Page, name: string): Promise<void> {
    await openProfessionalStandardsPage(page, 'Certificates', page.getByRole('button', { name: 'Add certificate' }));
    const icon = page.getByRole('button', { name: `Delete ${name}`, exact: true });
    if (!(await icon.count())) return;
    await icon.click();
    await answerConfirmation(page, 'Yes');
    await expect(toast(page, 'Certificate deleted').first()).toBeVisible();
}


/** Shows up to 100 employees a page so a search on a shared start keeps both rows in view. */
export async function showMoreEmployees(page: Page): Promise<void> {
    const size = page.getByRole('combobox', { name: 'Page size' });
    if (!(await size.count())) return;
    await chooseOption(page, size, '100');
    await expect(size).toContainText('100');
}

/** Issues the certificate from the details page with this award date; Save still has to be pressed. */
export async function issueCertificate(page: Page, certificate: string, awarded: string): Promise<void> {
    await page.getByRole('button', { name: 'Issue certificate' }).click();
    await dialog(page).locator('#issue-certificate').click();
    await page.getByRole('option', { name: certificate, exact: true }).click();
    await dialog(page).locator('#issue-certificate-date').fill(awarded);
    await page.keyboard.press('Tab');
    await dialog(page).getByRole('button', { name: 'Issue', exact: true }).click();
}

/** Stages the removal of every copy of the certificate and saves when something changed. */
export async function removeCertificates(page: Page, certificate: string): Promise<void> {
    const remove = page.getByRole('button', { name: `Remove ${certificate}`, exact: true });
    for (let guard = 0; guard < 5 && (await remove.count()); guard++) {
        await remove.first().click();
    }
    if (await saveBar(page).count()) await saveEmployee(page);
}

/** An award date that makes a 3-year certificate expire this many days from today (negative: already expired). */
export function awardedToExpireIn(days: number): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 3);
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const noEmployees = (page: Page): Locator => page.getByText('No employees match these filters.');

/** True when an employee with this name is on file, active or not. A stale "no match" can show while the list loads, so it looks again. */
async function employeeExists(page: Page, name: string): Promise<boolean> {
    await chooseOption(page, employmentFilter(page), 'All employment');
    await searchEmployees(page, `${name} ${name}`);
    for (let attempt = 0; attempt < 3; attempt++) {
        await page.waitForLoadState('networkidle');
        await expect(employeeRow(page, name).or(noEmployees(page)).first()).toBeVisible();
        if (await employeeRow(page, name).count()) return true;
        await page.waitForTimeout(1500);
    }
    return (await employeeRow(page, name).count()) > 0;
}

/** A reusable test employee: created the first time, Active for the run, left Inactive by the cleanup. */
export async function prepareEmployee(page: Page, name: string): Promise<void> {
    if (!(await employeeExists(page, name))) {
        await searchEmployees(page, '');
        await addEmployee(page, name);
    }
    await openEmployee(page, name);
    await setEmployeeStatus(page, 'Active');
    await backToEmployees(page);
}

/** Employee IDs stop at 25 characters, so new ones take a free 3-digit number after the prefix. */
export async function freshEmployeeNames(page: Page, count: number): Promise<string[]> {
    const names: string[] = [];
    while (names.length < count) {
        const name = `${AUTOMATION_PREFIX}${200 + Math.floor(Math.random() * 800)}`;
        if (!names.includes(name) && !(await employeeExists(page, name))) names.push(name);
    }
    await searchEmployees(page, '');
    return names;
}

/** Two new names that share a start no other employee has, so one search keeps both in view. */
export async function freshEmployeePair(page: Page): Promise<[string, string]> {
    for (;;) {
        const shared = `${AUTOMATION_PREFIX}${20 + Math.floor(Math.random() * 80)}`;
        const pair: [string, string] = [`${shared}0`, `${shared}1`];
        if (!(await employeeExists(page, pair[0])) && !(await employeeExists(page, pair[1]))) {
            await searchEmployees(page, '');
            return pair;
        }
    }
}
