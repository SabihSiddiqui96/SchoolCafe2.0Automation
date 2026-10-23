// Professional Standards - Employees - Directory, Add Employee and Bulk Select

import { test, expect, Page } from '@playwright/test';
import {
    addEmployee,
    addEmployeeButton,
    awardedToExpireIn,
    AUTOMATION_PREFIX,
    answerConfirmation,
    backToEmployees,
    chooseOption,
    dialog,
    dismissOverlays,
    employeeRow,
    createCertificate,
    deleteCertificate,
    employmentFilter,
    firstOption,
    issueCertificate,
    realOptions,
    removeCertificates,
    loginToSchoolCafe2,
    freshEmployeeNames,
    freshEmployeePair,
    openEmployee,
    openEmployees,
    resetEmployeesView,
    openProfessionalStandardsPage,
    saveEmployee,
    searchBox,
    searchEmployees,
    showMoreEmployees,
    setEmployeeStatus,
    toast,
} from '../../utils/professionalStandards';

// --- Locators
const QUICK_FILTERS = ['All', 'Below hours', 'Compliant', 'Expiring Cert', 'Expired Cert'];
const quickFilter = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const form = (page: Page) => page.getByRole('dialog').last();
const submit = (page: Page) => form(page).getByRole('button', { name: 'Add employee' });
const siteFilter = (page: Page) => page.getByRole('combobox', { name: 'Site' }).first();
const jobFilter = (page: Page) => page.getByRole('combobox', { name: 'Job title' }).first();
const selectButton = (page: Page) => page.getByRole('button', { name: 'Select', exact: true });
const bulkStatus = (page: Page) => page.getByRole('button', { name: /^Make (Inactive|Active)$/ });
const selectedCount = (page: Page, n: number) => expect(page.getByText(`${n} selected`)).toBeVisible();
const chipsOf = (page: Page, name: string) => employeeRow(page, name);

// --- Helpers
/** The longest start two names share - a search that keeps both on one page of the list. */
function sharedStart(a: string, b: string): string {
    let end = 0;
    while (end < a.length && a[end] === b[end]) end++;
    return a.slice(0, end);
}

async function openDirectory(page: Page): Promise<void> {
    await loginToSchoolCafe2(page);
    await openEmployees(page);
}

async function setCeuRequirement(page: Page, hours: string, comment: string): Promise<string> {
    await openProfessionalStandardsPage(page, 'CEU Levels', page.getByRole('button', { name: 'Edit', exact: true }));
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const field = page.getByLabel('<20 Hours Staff Required hours');
    const previous = await field.inputValue();
    await field.fill(hours);
    await page.getByRole('button', { name: /^save/i }).first().click();
    await dialog(page).getByRole('textbox', { name: /comments/i }).fill(comment);
    await dialog(page).getByRole('button', { name: 'Confirm' }).click();
    await expect(toast(page, 'Successfully updated CEU hour requirements').first()).toBeVisible();
    return previous;
}

// --- Sections
async function directoryLayout(page: Page): Promise<void> {
    await test.step('Filters, quick filters and buttons show with their defaults', async () => {
        await expect(searchBox(page)).toBeVisible();
        await expect(siteFilter(page)).toContainText('All sites');
        await expect(employmentFilter(page)).toContainText('Active only');
        await expect(jobFilter(page)).toContainText('All job titles');
        for (const name of QUICK_FILTERS) await expect(quickFilter(page, name)).toBeVisible();
        await expect(quickFilter(page, 'All')).toHaveAttribute('aria-pressed', 'true');
        await expect(selectButton(page)).toBeVisible();
        await expect(addEmployeeButton(page)).toBeVisible();
        for (const column of ['Name', 'Job title', 'Site', 'Employee ID', 'Status', 'History']) {
            await expect(page.getByText(column, { exact: true }).first()).toBeVisible();
        }
    });
}

async function addEmployeeForm(page: Page): Promise<void> {
    await test.step('The popup lists the required fields with Add employee disabled', async () => {
        await addEmployeeButton(page).click();
        for (const field of ['#add-employee-first-name', '#add-employee-last-name', '#add-employee-number', '#add-employee-site', '#add-employee-ceu-level']) {
            await expect(form(page).locator(field)).toBeVisible();
        }
        await expect(submit(page)).toBeDisabled();
    });

    await test.step('Add more details lists every optional field', async () => {
        await form(page).getByRole('button', { name: /add more details/i }).click();
        for (const label of ['Email', 'Work phone', 'Mobile work phone', 'Home phone', 'Birthdate', 'Gender', 'Address line 1', 'Address line 2', 'City', 'State', 'Zip', 'Job title', 'Hire date']) {
            await expect(form(page).getByText(label, { exact: true }).first()).toBeVisible();
        }
        await expect(form(page)).toContainText("Leave blank to use today's date.");
    });

    await test.step('The dropdowns list their options', async () => {
        await form(page).locator('#add-employee-ceu-level').click();
        await expect(page.getByRole('option')).toHaveText(['Program Director', 'Manager', 'Program Staff', '<20 Hours Staff']);
        await page.keyboard.press('Escape');
        await form(page).locator('#add-employee-site').click();
        const sites = await page.getByRole('option').allInnerTexts();
        expect(sites).toContain('None');
        expect(sites.length).toBeGreaterThan(1);
        await page.keyboard.press('Escape');
    });

    await test.step('Invalid values show their messages and block Add employee', async () => {
        const check = async (id: string, value: string, message: string | RegExp) => {
            await form(page).locator(id).fill(value);
            await expect(form(page)).toContainText(message);
            await expect(submit(page)).toBeDisabled();
            await form(page).locator(id).fill('');
        };
        await check('#add-employee-email', 'not-an-email', 'Enter a valid email address.');
        await check('#add-employee-work-phone', '12', 'Enter a 10 digit phone number.');
        await check('#add-employee-zip', 'abcde', /Enter a valid zip/);
        await check('#add-employee-birth-date', '2099-01-01', "Birthdate can't be in the future.");
        await check('#add-employee-hire-date', '2099-01-01', "Hire date can't be in the future.");
    });

    await test.step('Closing the popup leaves nothing behind for next time', async () => {
        await form(page).locator('#add-employee-first-name').fill('Leftover');
        await form(page).locator('#add-employee-email').fill('leftover@example.com');
        await form(page).getByText(/^cancel$/i).click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await addEmployeeButton(page).click();
        await expect(form(page).locator('#add-employee-first-name')).toHaveValue('');
        await expect(form(page).locator('#add-employee-email')).toHaveCount(0);
        await expect(submit(page)).toBeDisabled();
        await form(page).locator('button[aria-label=close]').click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
    });
}

async function addingEmployees(page: Page, minimal: string, detailed: string): Promise<{ site: string; job: string }> {
    const choice = { site: '', job: '' };
    await test.step('An employee with only the required fields starts Active and Below hours', async () => {
        await addEmployee(page, minimal);
        await searchEmployees(page, minimal);
        await expect(chipsOf(page, minimal)).toContainText('Below Hours');
        await expect(chipsOf(page, minimal)).not.toContainText('Inactive');
        await chipsOf(page, minimal).click();
        await expect(page.getByText('Employee Details')).toBeVisible();
        await expect(page.getByRole('switch', { name: 'Employment status' })).toHaveText('Active');
        const today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
        await expect(page.getByText(today).first()).toBeVisible();
        await backToEmployees(page);
    });

    await test.step('A duplicate Employee ID blocks Add employee as you type', async () => {
        await searchEmployees(page, minimal);
        await expect(chipsOf(page, minimal)).toBeVisible();
        await addEmployeeButton(page).click();
        await form(page).locator('#add-employee-first-name').fill('Duplicate');
        await form(page).locator('#add-employee-last-name').fill('Duplicate');
        await chooseOption(page, form(page).locator('#add-employee-ceu-level'), '<20 Hours Staff');
        for (const id of [minimal, minimal.toUpperCase()]) {
            await form(page).locator('#add-employee-number').fill(id);
            await expect(form(page)).toContainText('Employee ID already belongs to');
            await expect(submit(page)).toBeDisabled();
        }
        await form(page).locator('#add-employee-number').fill(`Unused${Date.now()}`);
        await expect(form(page)).not.toContainText('Employee ID already belongs to');
        await expect(submit(page)).toBeEnabled();
        await form(page).getByText(/^cancel$/i).click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
    });

    await test.step('An employee with every detail keeps every value', async () => {
        await addEmployeeButton(page).click();
        await form(page).locator('#add-employee-first-name').fill(detailed);
        await form(page).locator('#add-employee-last-name').fill(detailed);
        await form(page).locator('#add-employee-number').fill(detailed);
        choice.site = (await realOptions(page, form(page).locator('#add-employee-site'))).pop() as string;
        await chooseOption(page, form(page).locator('#add-employee-site'), choice.site);
        await chooseOption(page, form(page).locator('#add-employee-ceu-level'), '<20 Hours Staff');
        await form(page).getByRole('button', { name: /add more details/i }).click();
        choice.job = await firstOption(page, form(page).locator('#add-employee-job-title'));
        await form(page).locator('#add-employee-email').fill(`${detailed}@example.com`);
        await form(page).locator('#add-employee-work-phone').fill('5125550101');
        await form(page).locator('#add-employee-mobile-work-phone').fill('5125550102');
        await form(page).locator('#add-employee-home-phone').fill('5125550103');
        await form(page).locator('#add-employee-birth-date').fill('1990-05-17');
        await chooseOption(page, form(page).locator('#add-employee-gender'), 'Female');
        await form(page).locator('#add-employee-address-1').fill('1 Test Way');
        await form(page).locator('#add-employee-address-2').fill('Suite 2');
        await form(page).locator('#add-employee-city').fill('Austin');
        await chooseOption(page, form(page).locator('#add-employee-state'), 'Texas');
        await form(page).locator('#add-employee-zip').fill('78701');
        await chooseOption(page, form(page).locator('#add-employee-job-title'), choice.job);
        await form(page).locator('#add-employee-hire-date').fill('2026-09-01');
        await submit(page).click();
        await expect(toast(page, 'Employee added').first()).toBeVisible();
        await searchEmployees(page, detailed);
        await expect(chipsOf(page, detailed)).toContainText(choice.job);
        await expect(chipsOf(page, detailed)).toContainText(choice.site.replace(/^\d+ - /, ''));
        await chipsOf(page, detailed).click();
        await expect(page.getByText('Employee Details')).toBeVisible();
        for (const value of [`${detailed}@example.com`, '(512) 555-0101', '(512) 555-0102', '(512) 555-0103', '05/17/1990', 'Female', '1 Test Way', 'Suite 2', 'Austin', 'Texas', '78701', '09/01/2026']) {
            await expect(page.getByText(value, { exact: true }).first()).toBeVisible();
        }
        await backToEmployees(page);
    });

    return choice;
}

async function searchingAndFiltering(page: Page, minimal: string, detailed: string, choice: { site: string; job: string }): Promise<void> {
    await test.step('Search starts at 3 characters and matches a name or an ID', async () => {
        await searchEmployees(page, 'zz');
        await expect(chipsOf(page, minimal)).toBeVisible();
        await searchEmployees(page, 'zzz');
        await expect(page.getByRole('row').filter({ hasText: minimal })).toHaveCount(0);
        await searchEmployees(page, minimal.toUpperCase());
        await expect(chipsOf(page, minimal)).toBeVisible();
        await expect(chipsOf(page, detailed)).toHaveCount(0);
        await searchEmployees(page, `  ${detailed}`);
        await expect(chipsOf(page, detailed)).toBeVisible();
        await searchEmployees(page, '');
    });

    await test.step('The Site and Job title filters narrow the list', async () => {
        await chooseOption(page, siteFilter(page), choice.site);
        await expect(chipsOf(page, detailed)).toBeVisible();
        await expect(chipsOf(page, minimal)).toHaveCount(0);
        await chooseOption(page, jobFilter(page), choice.job);
        await expect(chipsOf(page, detailed)).toBeVisible();
        await chooseOption(page, siteFilter(page), 'All sites');
        await chooseOption(page, jobFilter(page), 'All job titles');
    });
}

async function certificateChips(page: Page, minimal: string, certificate: string): Promise<void> {
    await test.step('Expiring and expired certificates show their chips in the details and the list', async () => {
        await openEmployee(page, minimal);
        await issueCertificate(page, certificate, awardedToExpireIn(30));
        await saveEmployee(page);
        await expect(page.locator('main')).toContainText('Expiring Cert');
        await backToEmployees(page);
        await searchEmployees(page, minimal);
        await expect(chipsOf(page, minimal)).toContainText('Expiring Cert');
        await expect(chipsOf(page, minimal)).not.toContainText('Expired Cert');
        await quickFilter(page, 'Expiring Cert').click();
        await expect(chipsOf(page, minimal)).toBeVisible();
        await quickFilter(page, 'Expired Cert').click();
        await expect(chipsOf(page, minimal)).toHaveCount(0);

        await quickFilter(page, 'All').click();
        await openEmployee(page, minimal);
        await removeCertificates(page, certificate);
        await issueCertificate(page, certificate, awardedToExpireIn(-30));
        await saveEmployee(page);
        await backToEmployees(page);
        await searchEmployees(page, minimal);
        await expect(chipsOf(page, minimal)).toContainText('Expired Cert');
        await expect(chipsOf(page, minimal)).not.toContainText('Expiring Cert');
        await quickFilter(page, 'Expired Cert').click();
        await expect(chipsOf(page, minimal)).toBeVisible();
        await quickFilter(page, 'All').click();

        await openEmployee(page, minimal);
        await removeCertificates(page, certificate);
        await issueCertificate(page, certificate, awardedToExpireIn(30));
        await issueCertificate(page, certificate, awardedToExpireIn(-30));
        await saveEmployee(page);
        await backToEmployees(page);
        await searchEmployees(page, minimal);
        await expect(chipsOf(page, minimal)).toContainText('Expiring Cert');
        await expect(chipsOf(page, minimal)).toContainText('Expired Cert');
        await expect(chipsOf(page, minimal)).toContainText('Below Hours');
        await expect(chipsOf(page, minimal)).not.toContainText('Compliant');
    });
}

async function compliantChip(page: Page, detailed: string): Promise<void> {
    let original = '';
    try {
        await test.step('Compliant shows when the required hours are met, and Below hours never shows with it', async () => {
            original = await setCeuRequirement(page, '0', `${AUTOMATION_PREFIX} requirement`);
            await openEmployees(page);
            await searchEmployees(page, detailed);
            await expect(chipsOf(page, detailed)).toContainText('Compliant');
            await expect(chipsOf(page, detailed)).not.toContainText('Below Hours');
            await quickFilter(page, 'Compliant').click();
            await expect(chipsOf(page, detailed)).toBeVisible();
            await quickFilter(page, 'Below hours').click();
            await expect(chipsOf(page, detailed)).toHaveCount(0);
            await quickFilter(page, 'All').click();
        });
    } finally {
        if (original) await setCeuRequirement(page, original, `${AUTOMATION_PREFIX} requirement restored`);
        await openEmployees(page);
        await searchEmployees(page, detailed);
        await expect(chipsOf(page, detailed)).toContainText('Below Hours');
        await searchEmployees(page, '');
    }
}

async function selectMode(page: Page, one: string, two: string): Promise<void> {
    await test.step('Select shows a checkbox per row and an empty bulk bar', async () => {
        await chooseOption(page, employmentFilter(page), 'Active only');
        await searchEmployees(page, sharedStart(one, two));
        await showMoreEmployees(page);
        await selectButton(page).click();
        await expect(page.getByRole('button', { name: 'Done' })).toBeVisible();
        await expect(page.getByRole('checkbox').first()).toBeVisible();
        await selectedCount(page, 0);
        for (const name of ['Add to roster', 'Make Inactive', 'Add to a Training']) {
            await expect(page.getByRole('button', { name })).toBeDisabled();
        }
    });

    await test.step('Clicking rows selects and deselects without leaving the list', async () => {
        await employeeRow(page, one).click();
        await employeeRow(page, two).click();
        await selectedCount(page, 2);
        await employeeRow(page, two).click();
        await selectedCount(page, 1);
        await employeeRow(page, two).click();
        await selectedCount(page, 2);
        await expect(page.getByText('Employee Details')).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Add to roster' })).toBeDisabled();
        await expect(page.getByRole('button', { name: 'Add to a Training' })).toBeDisabled();
    });

    await test.step('Make Inactive asks first and Cancel keeps the selection', async () => {
        await bulkStatus(page).click();
        await expect(dialog(page)).toContainText('Are you sure you want to make 2 employees Inactive?');
        await dialog(page).getByText(/^cancel$/i).click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await selectedCount(page, 2);
    });

    await test.step('Yes makes them inactive, closes select mode and refreshes the list', async () => {
        await bulkStatus(page).click();
        await answerConfirmation(page, 'Yes');
        await expect(toast(page, '2 employees made Inactive').first()).toBeVisible();
        await expect(selectButton(page)).toBeVisible();
        await expect(employeeRow(page, one)).toHaveCount(0);
        await chooseOption(page, employmentFilter(page), 'Inactive only');
        await expect(employeeRow(page, one)).toContainText('Inactive');
        await expect(employeeRow(page, two)).toContainText('Inactive');
    });

    await test.step('Only inactive employees offer Make Active, a mix offers Make Inactive', async () => {
        await selectButton(page).click();
        await employeeRow(page, one).click();
        await expect(page.getByRole('button', { name: 'Make Active' })).toBeEnabled();
        await page.getByRole('button', { name: 'Done' }).click();
        await chooseOption(page, employmentFilter(page), 'All employment');
        await selectButton(page).click();
        await employeeRow(page, one).click();
        await employeeRow(page, two).click();
        await expect(page.getByRole('button', { name: 'Make Active' })).toBeVisible();
        await page.getByRole('button', { name: 'Done' }).click();
    });

    await test.step('Make Active asks first and applies', async () => {
        await selectButton(page).click();
        await employeeRow(page, one).click();
        await page.getByRole('button', { name: 'Make Active' }).click();
        await expect(dialog(page)).toContainText('Are you sure you want to make 1 employee Active?');
        await answerConfirmation(page, 'Yes');
        await expect(toast(page, '1 employee made Active').first()).toBeVisible();
        await expect(employeeRow(page, one)).not.toContainText('Inactive');
    });

    await test.step('Done leaves select mode and clears the selection', async () => {
        await selectButton(page).click();
        await employeeRow(page, one).click();
        await page.getByRole('button', { name: 'Done' }).click();
        await expect(page.getByRole('checkbox')).toHaveCount(0);
        await selectButton(page).click();
        await selectedCount(page, 0);
        await page.getByRole('button', { name: 'Done' }).click();
    });
}

async function returningToTheList(page: Page, one: string, two: string): Promise<void> {
    await test.step('Going back keeps the filters and marks the last viewed row', async () => {
        await chooseOption(page, employmentFilter(page), 'All employment');
        await searchEmployees(page, sharedStart(one, two));
        await showMoreEmployees(page);
        await quickFilter(page, 'Below hours').click();
        await employeeRow(page, one).click();
        await expect(page.getByText('Employee Details')).toBeVisible();
        await backToEmployees(page);
        await expect(employmentFilter(page)).toContainText('All employment');
        await expect(searchBox(page)).toHaveValue(sharedStart(one, two));
        await expect(quickFilter(page, 'Below hours')).toHaveAttribute('aria-pressed', 'true');
        await expect(employeeRow(page, one)).toContainText('Last viewed');
        await employeeRow(page, two).click();
        await backToEmployees(page);
        await expect(employeeRow(page, two)).toContainText('Last viewed');
        await expect(employeeRow(page, one)).not.toContainText('Last viewed');
        await quickFilter(page, 'All').click();
    });

    await test.step('The history icon opens that employee’s history', async () => {
        await page.getByRole('button', { name: `History for ${one} ${one}` }).click();
        const history = page.getByRole('dialog').last();
        await expect(history).toContainText(`${one} ${one} - History`);
        await expect(history).toContainText('Employee added');
        await page.getByRole('button', { name: 'Close drawer' }).click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
    });
}

/** Clears certificates and makes every test employee inactive. */
async function cleanUp(page: Page, names: string[], certificate: string): Promise<void> {
    await page.keyboard.press('Escape').catch(() => undefined);
    await dismissOverlays(page);
    await openEmployees(page);
    for (const name of names) {
        await openEmployee(page, name).catch(() => undefined);
        if (!(await page.getByText('Employee Details').count())) continue;
        await removeCertificates(page, certificate);
        await setEmployeeStatus(page, 'Inactive');
        await backToEmployees(page);
    }
    await resetEmployeesView(page);
    await deleteCertificate(page, certificate);
}

// --- Test
test('T-75267 Employees', async ({ page }) => {
    test.setTimeout(900000);
    await openDirectory(page);

    const [minimal, detailed] = await freshEmployeeNames(page, 2);
    const [pairOne, pairTwo] = await freshEmployeePair(page);
    const certificate = await createCertificate(page);
    await openEmployees(page);
    await resetEmployeesView(page);

    let passed = false;
    try {
        await test.step('Directory layout and defaults', () => directoryLayout(page));
        await test.step('Add employee form', () => addEmployeeForm(page));
        const choice = await test.step('Adding employees', () => addingEmployees(page, minimal, detailed));
        await test.step('Search and filters', () => searchingAndFiltering(page, minimal, detailed, choice));
        await test.step('Certificate chips', () => certificateChips(page, minimal, certificate));
        await test.step('Compliant chip', () => compliantChip(page, detailed));
        await test.step('Select mode and bulk status', async () => {
            await addEmployee(page, pairOne);
            await addEmployee(page, pairTwo);
            await selectMode(page, pairOne, pairTwo);
        });
        await test.step('Returning to the list and row history', () => returningToTheList(page, pairOne, pairTwo));
        passed = true;
    } finally {
        // a failed run keeps its own error instead of the cleanup's
        await cleanUp(page, [minimal, detailed, pairOne, pairTwo], certificate).catch((error) => {
            if (passed) throw error;
        });
    }
});

