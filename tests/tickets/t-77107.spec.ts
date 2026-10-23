// Professional Standards - Configuration - Certificates

import { test, expect, Page } from '@playwright/test';
import {
    prepareEmployee,
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
    saveEmployee,
    setEmployeeStatus,
    toast,
    waitForPageReady,
} from '../../utils/professionalStandards';

// --- Locators
const HELPER_TEXT =
    "Certificates can be issued either through a training event or directly from an employee's details page. " +
    'A certificate can be renamed or have its expiration period changed at any time. ' +
    'A rename updates everyone who holds it, but a new expiration period only applies to certificates awarded from then onwards. ' +
    'Certificates already awarded keep the expiration date they were given. ' +
    'Making a certificate inactive stops it from being available to award going forward, ' +
    'but it will not remove the certificate from any employee who has already been awarded it.';
const addCertificate = (page: Page) => page.getByRole('button', { name: 'Add certificate' });
const chip = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const statusPill = (page: Page, name: string) => page.getByRole('switch', { name: `${name} Status`, exact: true });
const editIcon = (page: Page, name: string) => page.getByRole('button', { name: `Edit ${name}`, exact: true });
const deleteIcon = (page: Page, name: string) => page.getByRole('button', { name: `Delete ${name}`, exact: true });
const certRow = (page: Page, name: string) => page.getByRole('row').filter({ has: editIcon(page, name) });
const employeeCount = (page: Page, name: string) => certRow(page, name).locator('td').nth(2);
const nameInput = (page: Page) => dialog(page).getByRole('textbox').first();
const expires = (page: Page) => dialog(page).getByRole('checkbox', { name: 'This certificate expires' });
const period = (page: Page) => dialog(page).getByRole('combobox');

// --- Helpers
async function openCertificates(page: Page): Promise<void> {
    await loginToSchoolCafe2(page);
    await openProfessionalStandardsPage(page, 'Certificates', addCertificate(page));
}

async function certificateNames(page: Page): Promise<string[]> {
    const labels = await page.getByRole('button', { name: /^Edit / }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
    return labels.map((l) => l.replace(/^Edit /, ''));
}

/** Opens Add certificate, fills it and submits; `years` ticks the expiry box. */
async function addNamedCertificate(page: Page, name: string, years?: string): Promise<void> {
    await addCertificate(page).click();
    await nameInput(page).fill(name);
    if (years) {
        await expires(page).check();
        await period(page).click();
        await page.getByRole('option', { name: years, exact: true }).click();
    }
    await dialog(page).getByRole('button', { name: 'Add', exact: true }).click();
    await expect(toast(page, 'Certificate added').first()).toBeVisible();
    await expect(dialog(page)).toHaveCount(0);
}

async function editCertificate(page: Page, name: string, change: (p: Page) => Promise<void>): Promise<void> {
    await editIcon(page, name).click();
    await change(page);
    await dialog(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(toast(page, 'Certificate updated').first()).toBeVisible();
    await expect(dialog(page)).toHaveCount(0);
}

async function removeCertificate(page: Page, name: string): Promise<void> {
    await deleteIcon(page, name).click();
    await expect(dialog(page)).toContainText(`Are you sure you want to delete "${name}"?`);
    await expect(dialog(page)).toContainText('This action cannot be undone.');
    await answerConfirmation(page, 'Yes');
    await expect(toast(page, 'Certificate deleted').first()).toBeVisible();
    await expect(deleteIcon(page, name)).toHaveCount(0);
}

async function selectAllChip(page: Page): Promise<void> {
    await chip(page, 'All').click();
}

// --- Sections
async function pageAndList(page: Page): Promise<void> {
    await test.step('Page leads with History and the helper text', async () => {
        await expect(page.getByRole('button', { name: 'History' })).toBeVisible();
        await expect(page.getByText(HELPER_TEXT)).toBeVisible();
    });

    await test.step('List shows the filter chips, Add certificate and the columns', async () => {
        for (const name of ['All', 'Active', 'Inactive']) await expect(chip(page, name)).toBeVisible();
        await expect(addCertificate(page)).toBeVisible();
        for (const column of ['Name', 'Expiration', 'Employees', 'Status', 'Actions']) {
            await expect(page.getByText(column, { exact: true }).first()).toBeVisible();
        }
        const row = page.getByRole('row').filter({ has: page.getByRole('button', { name: /^Edit / }) }).first();
        await expect(row).toContainText(/Expires after \d+ years?|Does not expire/);
        await expect(row.getByRole('switch', { name: /Status$/ })).toBeVisible();
        await expect(row.getByRole('button', { name: /^Edit / })).toBeVisible();
    });
}

async function addDialog(page: Page): Promise<void> {
    await test.step('Add certificate dialog starts empty with Add disabled', async () => {
        await addCertificate(page).click();
        await expect(dialog(page)).toContainText('Add certificate');
        await expect(nameInput(page)).toBeVisible();
        await expect(expires(page)).not.toBeChecked();
        await expect(period(page)).toHaveCount(0);
        await expect(dialog(page).getByRole('button', { name: 'Add', exact: true })).toBeDisabled();
    });

    await test.step('Ticking the box shows the period options and unticking hides them', async () => {
        await expires(page).check();
        await period(page).click();
        await expect(page.getByRole('option')).toHaveText(['1 year', '2 years', '3 years', '5 years']);
        await page.keyboard.press('Escape');
        await expires(page).uncheck();
        await expect(period(page)).toHaveCount(0);
        await dialog(page).getByRole('button', { name: 'Cancel' }).click();
        await expect(dialog(page)).toHaveCount(0);
    });
}

async function certificateLifecycle(page: Page, plain: string, timed: string, renamed: string): Promise<void> {
    await test.step('A certificate that does not expire starts Active with no employees', async () => {
        await addNamedCertificate(page, plain);
        await expect(certRow(page, plain)).toContainText('Does not expire');
        await expect(statusPill(page, plain)).toHaveText('Active');
        await expect(employeeCount(page, plain)).toHaveText('0');
    });

    await test.step('A certificate that expires after 2 years starts Active with no employees', async () => {
        await addNamedCertificate(page, timed, '2 years');
        await expect(certRow(page, timed)).toContainText('Expires after 2 years');
        await expect(statusPill(page, timed)).toHaveText('Active');
    });

    await test.step('A duplicate name blocks Add and Save', async () => {
        await addCertificate(page).click();
        await nameInput(page).fill(plain);
        await expect(dialog(page)).toContainText(`A certificate named "${plain}" already exists.`);
        await expect(dialog(page).getByRole('button', { name: 'Add', exact: true })).toBeDisabled();
        await dialog(page).getByRole('button', { name: 'Cancel' }).click();
        await editIcon(page, timed).click();
        await nameInput(page).fill(plain);
        await expect(dialog(page)).toContainText(`A certificate named "${plain}" already exists.`);
        await expect(dialog(page).getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
        await dialog(page).getByRole('button', { name: 'Cancel' }).click();
        await expect(dialog(page)).toHaveCount(0);
    });

    await test.step('Rename, change the period and make it non-expiring', async () => {
        await editCertificate(page, timed, (p) => nameInput(p).fill(renamed));
        await expect(certRow(page, renamed)).toBeVisible();
        await editCertificate(page, renamed, async (p) => {
            await period(p).click();
            await p.getByRole('option', { name: '3 years', exact: true }).click();
        });
        await expect(certRow(page, renamed)).toContainText('Expires after 3 years');
        await editCertificate(page, renamed, async (p) => {
            await expires(p).uncheck();
            await expect(period(p)).toHaveCount(0);
        });
        await expect(certRow(page, renamed)).toContainText('Does not expire');
    });

    await test.step('The filter chips split Active and Inactive', async () => {
        await chip(page, 'Active').click();
        await expect(certRow(page, plain)).toBeVisible();
        await chip(page, 'Inactive').click();
        await expect(certRow(page, plain)).toHaveCount(0);
        await selectAllChip(page);
        await expect(certRow(page, plain)).toBeVisible();
    });

    await test.step('Making a certificate inactive asks first', async () => {
        await statusPill(page, plain).click();
        await expect(dialog(page)).toContainText(`Are you sure you want to make "${plain}" inactive?`);
        await expect(dialog(page)).toContainText('This only stops it from being awarded going forward. Employees who already have it keep it.');
        await answerConfirmation(page, 'No');
        await expect(statusPill(page, plain)).toHaveText('Active');
        await statusPill(page, plain).click();
        await answerConfirmation(page, 'Yes');
        await expect(toast(page, `"${plain}" is now inactive`).first()).toBeVisible();
        await expect(statusPill(page, plain)).toHaveText('Inactive');
    });

    await test.step('Inactive filter lists it and turning it on needs no dialog', async () => {
        await chip(page, 'Inactive').click();
        await expect(certRow(page, plain)).toBeVisible();
        await statusPill(page, plain).click();
        await expect(dialog(page)).toHaveCount(0);
        await expect(toast(page, `"${plain}" is now active`).first()).toBeVisible();
    });

    await test.step('A certificate added under the Inactive filter starts Active', async () => {
        await chip(page, 'Inactive').click();
        const extra = `${renamed}x`;
        await addNamedCertificate(page, extra);
        await expect(certRow(page, extra)).toHaveCount(0);
        await selectAllChip(page);
        await expect(statusPill(page, extra)).toHaveText('Active');
        await removeCertificate(page, extra);
    });

    await test.step('Delete asks first and No keeps the certificate', async () => {
        await deleteIcon(page, renamed).click();
        await expect(dialog(page)).toContainText(`Are you sure you want to delete "${renamed}"?`);
        await answerConfirmation(page, 'No');
        await expect(deleteIcon(page, renamed)).toBeVisible();
    });
}

async function certificateHeldByEmployee(page: Page, held: string, employee: string): Promise<void> {
    await test.step('Issue a 2-year certificate to a new employee from their details page', async () => {
        await addNamedCertificate(page, held, '2 years');
        await openEmployees(page);
        await prepareEmployee(page, employee);
        await openEmployee(page, employee);
        await page.getByRole('button', { name: 'Issue certificate' }).click();
        await dialog(page).locator('#issue-certificate').click();
        await page.getByRole('option', { name: held, exact: true }).click();
        const today = new Date();
        const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        await dialog(page).locator('#issue-certificate-date').fill(iso);
        await page.keyboard.press('Tab');
        await dialog(page).getByRole('button', { name: 'Issue', exact: true }).click();
        await saveEmployee(page);
        await expect(page.getByText(held, { exact: true })).toBeVisible();
        await expect(page.getByText(/Issued \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
        await expect(page.getByText(/(Expires|Expiring) \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
        await backToEmployees(page);
    });

    await test.step('A held certificate shows its count and loses the delete icon', async () => {
        await openProfessionalStandardsPage(page, 'Certificates', addCertificate(page));
        await expect(employeeCount(page, held)).toHaveText('1');
        await expect(deleteIcon(page, held)).toHaveCount(0);
        await expect(editIcon(page, held)).toBeVisible();
    });

    await test.step('Deactivating and reactivating keeps the employee holding it', async () => {
        await statusPill(page, held).click();
        await expect(dialog(page)).toContainText(`Are you sure you want to make "${held}" inactive?`);
        await answerConfirmation(page, 'Yes');
        await expect(toast(page, `"${held}" is now inactive`).first()).toBeVisible();
        await statusPill(page, held).click();
        await expect(toast(page, `"${held}" is now active`).first()).toBeVisible();
        await expect(statusPill(page, held)).toHaveText('Active');
    });
}

async function renameHeldCertificate(page: Page, held: string, renamed: string, employee: string): Promise<void> {
    await test.step('Renaming updates the employee and keeps their expiry date', async () => {
        await openEmployees(page);
        await openEmployee(page, employee);
        const expiry = await page.getByText(/(Expires|Expiring) \d{2}\/\d{2}\/\d{4}/).first().innerText();
        await backToEmployees(page);
        await openProfessionalStandardsPage(page, 'Certificates', addCertificate(page));
        await editCertificate(page, held, async (p) => {
            await nameInput(p).fill(renamed);
            await expires(p).check();
            await period(p).click();
            await p.getByRole('option', { name: '5 years', exact: true }).click();
        });
        await openEmployees(page);
        await openEmployee(page, employee);
        await expect(page.getByText(renamed, { exact: true })).toBeVisible();
        await expect(page.getByText(expiry)).toBeVisible();
        await backToEmployees(page);
    });
}

async function historyEntries(page: Page): Promise<void> {
    await test.step('History records who, what and when', async () => {
        await openProfessionalStandardsPage(page, 'Certificates', addCertificate(page));
        const history = await openHistory(page);
        await expect(history).toContainText('Performed By');
        await expect(history).toContainText('Date');
        for (const action of ['Certificate added', 'Certificate updated', 'Certificate deactivated', 'Certificate activated', 'Certificate deleted']) {
            await expect(history.getByText(action, { exact: true }).first()).toBeVisible();
        }
        await history.getByText('Certificate updated', { exact: true }).first().click();
        await expect(history).toContainText('Changed Value(s)');
        await closeHistory(page);
    });
}

/** Removes the certificate from the employee, makes them inactive, deletes the test certificates. */
async function cleanUp(page: Page, employee: string): Promise<void> {
    await page.keyboard.press('Escape').catch(() => undefined);
    await dismissOverlays(page);
    await openEmployees(page);
    await openEmployee(page, employee).catch(() => undefined);
    if (await page.getByText('Employee Details').count()) {
        for (let guard = 0; guard < 5 && (await page.getByRole('button', { name: /^Remove / }).count()); guard++) {
            await page.getByRole('button', { name: /^Remove / }).first().click();
        }
        if (await page.getByRole('button', { name: 'Save', exact: true }).count()) await saveEmployee(page);
        await setEmployeeStatus(page, 'Inactive');
        await backToEmployees(page);
    }
    await openProfessionalStandardsPage(page, 'Certificates', addCertificate(page));
    await selectAllChip(page);
    const mine = (await certificateNames(page)).filter((n) => n.startsWith(AUTOMATION_PREFIX));
    for (const name of mine) {
        if (await deleteIcon(page, name).count()) await removeCertificate(page, name);
    }
}

// --- Test
test('T-77107 Certificates', async ({ page }) => {
    test.setTimeout(600000);
    await openCertificates(page);
    await waitForPageReady(page, addCertificate(page));

    const [plain, timed, renamed, held, renamedAgain] = automationNames(5);
    const employee = `${AUTOMATION_PREFIX}1`;

    let passed = false;
    try {
        await test.step('Page, helper text and list', () => pageAndList(page));
        await test.step('Add certificate dialog', () => addDialog(page));
        await test.step('Add, edit, filter, status and delete', () => certificateLifecycle(page, plain, timed, renamed));
        await test.step('An employee holds a certificate', () => certificateHeldByEmployee(page, held, employee));
        await test.step('Renaming a held certificate', () => renameHeldCertificate(page, held, renamedAgain, employee));
        await test.step('History', () => historyEntries(page));
        passed = true;
    } finally {
        // a failed run keeps its own error instead of the cleanup's
        await cleanUp(page, employee).catch((error) => {
            if (passed) throw error;
        });
    }
});
