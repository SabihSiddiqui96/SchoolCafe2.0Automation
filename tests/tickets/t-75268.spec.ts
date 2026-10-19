// Professional Standards - Employees - Employee Profile & Details

import { test, expect, Locator, Page } from '@playwright/test';
import path from 'path';
import {
    prepareEmployee,
    backToEmployees,
    awardedToExpireIn,
    chooseOption,
    closeHistory,
    createCertificate,
    deleteCertificate,
    dialog,
    dismissOverlays,
    editEmployment,
    issueCertificate,
    removeCertificates,
    loginToSchoolCafe2,
    AUTOMATION_PREFIX,
    openEmployee,
    openEmployees,
    openHistory,
    resetEmployeesView,
    saveEmployee,
    setEmployeeStatus,
    toast,
} from '../../utils/professionalStandards';

// --- Locators
const saveButton = (page: Page) => page.getByRole('button', { name: 'Save', exact: true });
const pill = (page: Page) => page.getByRole('button', { name: 'Employment status' });
const photo = (page: Page, name: string) => page.locator(`img[alt="${name} ${name}"]`);
const confirmYes = (page: Page) => page.getByRole('dialog').last().getByText(/^yes$/i);
const main = (page: Page) => page.locator('main');

// --- Helpers
/** Cancels the staged changes; nothing to do when the fields are back to their saved values. */
async function discardPending(page: Page): Promise<void> {
    if (await saveButton(page).count()) await page.getByRole('button', { name: 'Cancel', exact: true }).last().click();
    await expect(saveButton(page)).toHaveCount(0);
}

/** Clicks a field label until it becomes an input; falls back to the section's Edit button. */
async function editSection(page: Page, id: string, label: string, section: 'Contact' | 'Employment' | 'Personal'): Promise<void> {
    const input = page.locator(`#${id}`);
    if (await input.count()) return;
    await page.getByText(label, { exact: true }).first().click();
    if (!(await input.count())) {
        const index = { Contact: 0, Employment: 1, Personal: 2 }[section];
        await page.getByRole('button', { name: 'Edit', exact: true }).nth(index).click();
    }
    await expect(input).toBeVisible();
}

/** Whether `Unsaved changes` sits next to the section's heading. */
async function sectionIsDirty(page: Page, heading: string): Promise<boolean> {
    const text = (await main(page).innerText()).replace(/\s+/g, ' ');
    const at = text.toUpperCase().indexOf(`${heading.toUpperCase()} `);
    return at >= 0 && /Unsaved changes/.test(text.slice(at, at + 60));
}

const photoFile = path.join(__dirname, '..', '..', 'utils', 'files', 'photo.png');
const textFile = path.join(__dirname, '..', '..', 'utils', 'files', 'sabih-automation-testing.txt');
const wrongTypeFile = path.join(__dirname, '..', '..', 'utils', 'files', 'sabih-automation-testing.zip');

async function chooseFile(page: Page, trigger: Locator, file: string): Promise<void> {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), trigger.click()]);
    await chooser.setFiles(file);
}

// --- Sections
async function headerAndSections(page: Page, name: string): Promise<void> {
    await test.step('Header, tiles and the seven sections show', async () => {
        const text = await main(page).innerText();
        expect(text).toContain(`ID ${name}`);
        expect(text).toMatch(/of \d+\.\d CEU hrs YTD/);
        expect(text).toContain('badges earned');
        for (const heading of ['CONTACT', 'EMPLOYMENT', 'PERSONAL', 'CERTIFICATES', 'DOCUMENTS', 'NOTES', 'TRAINING HISTORY']) {
            expect(text).toContain(heading);
        }
        await expect(page.getByRole('button', { name: 'Change photo' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Edit name' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'History' }).first()).toBeVisible();
        await expect(page.getByRole('button', { name: 'Back' }).first()).toBeVisible();
    });
}

async function stagedEditing(page: Page, name: string, stamp: string): Promise<void> {
    const email = `${name}.${stamp}@example.com`;

    await test.step('Clicking a value makes it an input and only its section shows Unsaved changes', async () => {
        await editSection(page, 'employee-email', 'Email', 'Contact');
        await page.locator('#employee-email').fill(email);
        await expect(saveButton(page)).toBeVisible();
        expect(await sectionIsDirty(page, 'Contact')).toBe(true);
        expect(await sectionIsDirty(page, 'Employment')).toBe(false);
        const done = page.getByRole('button', { name: 'Done' });
        if (await done.count()) await done.first().click();
        await expect(saveButton(page)).toBeVisible();
    });

    await test.step('Cancel puts every field back', async () => {
        await discardPending(page);
        await expect(main(page)).not.toContainText(email);
    });

    await test.step('Invalid contact values show their messages and disable Save', async () => {
        await editSection(page, 'employee-email', 'Email', 'Contact');
        await page.locator('#employee-email').fill('bad');
        await expect(page.getByText('Enter a valid email address.')).toBeVisible();
        await expect(saveButton(page)).toBeDisabled();
        await page.locator('#employee-email').fill(email);
        await editSection(page, 'employee-work-phone', 'Work phone', 'Contact');
        await page.locator('#employee-work-phone').fill('12');
        await expect(page.getByText('Enter a 10 digit phone number.')).toBeVisible();
        await expect(saveButton(page)).toBeDisabled();
        await page.locator('#employee-work-phone').fill(`512555${stamp.slice(-4)}`);
    });

    await test.step('One Save commits the staged changes of several sections', async () => {
        await editSection(page, 'employee-city', 'City', 'Personal');
        await page.locator('#employee-city').fill(`Austin${stamp}`);
        await editSection(page, 'employee-zip', 'Zip', 'Personal');
        await page.locator('#employee-zip').fill('abcde');
        await expect(page.getByText(/Enter a valid zip/)).toBeVisible();
        await expect(saveButton(page)).toBeDisabled();
        await page.locator('#employee-zip').fill(String(10000 + (Number(stamp) % 80000)));
        await editSection(page, 'employee-birth-date', 'Birthdate', 'Personal');
        await page.locator('#employee-birth-date').fill('2099-01-01');
        await expect(page.getByText("Birthdate can't be in the future.")).toBeVisible();
        await page.locator('#employee-birth-date').fill('1990-05-17');
        expect(await sectionIsDirty(page, 'Contact')).toBe(true);
        expect(await sectionIsDirty(page, 'Personal')).toBe(true);
        expect(await sectionIsDirty(page, 'Employment')).toBe(false);
        await saveEmployee(page);
        await expect(main(page)).toContainText(email);
        await expect(main(page)).toContainText(`Austin${stamp}`);
        await expect(main(page)).toContainText(`(512) 555-${stamp.slice(-4)}`);
    });
}

async function nameAndEmployeeId(page: Page, name: string, other: string): Promise<void> {
    await test.step('Blank or spaces-only required fields show Required and disable Save', async () => {
        await page.getByRole('button', { name: 'Edit name' }).click();
        await expect(page.locator('#employee-first-name')).toBeVisible();
        await expect(page.locator('#employee-last-name')).toBeVisible();
        for (const id of ['#employee-first-name', '#employee-last-name']) {
            for (const value of ['', '   ']) {
                await page.locator(id).fill(value);
                await expect(page.getByText('Required').first()).toBeVisible();
                await expect(saveButton(page)).toBeDisabled();
            }
            await page.locator(id).fill(name);
        }
        await discardPending(page);
    });

    await test.step('A duplicate Employee ID shows the owner and disables Save', async () => {
        await editEmployment(page);
        await page.locator('#employee-number').fill(other);
        await expect(page.getByText(/Employee ID already belongs to/)).toBeVisible();
        await expect(saveButton(page)).toBeDisabled();
        await page.locator('#employee-number').fill(other.toUpperCase());
        await expect(page.getByText(/Employee ID already belongs to/)).toBeVisible();
        await page.locator('#employee-number').fill('');
        await expect(page.getByText('Required').first()).toBeVisible();
        await expect(saveButton(page)).toBeDisabled();
        await page.locator('#employee-number').fill(name);
        await expect(page.getByText(/Employee ID already belongs to/)).toHaveCount(0);
        await discardPending(page);
    });
}

async function employmentFields(page: Page, name: string, certificate: string): Promise<void> {
    await test.step('Site lists the active sites and a blank Hire date saves as today', async () => {
        await editEmployment(page);
        await page.locator('#employee-site').click();
        const sites = await page.getByRole('option').allInnerTexts();
        expect(sites).toContain('None');
        expect(sites.length).toBeGreaterThan(1);
        await page.keyboard.press('Escape');
        await page.locator('#employee-job-title').click();
        expect(await page.getByRole('option').allInnerTexts()).toContain('None');
        await page.keyboard.press('Escape');
        await page.locator('#employee-hire-date').fill('2099-01-01');
        await expect(page.getByText("Hire date can't be in the future.")).toBeVisible();
        await page.locator('#employee-hire-date').fill('2026-09-01');
        await saveEmployee(page);
        await editEmployment(page);
        await page.locator('#employee-hire-date').fill('');
        await saveEmployee(page);
        const today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
        await expect(main(page)).toContainText(today);
    });

    await test.step('CEU level can be changed and the required hours follow it', async () => {
        const requiredHours = async () => /of (\d+\.\d) CEU hrs YTD/.exec(await main(page).innerText())?.[1];
        const before = await requiredHours();
        await editEmployment(page);
        await page.locator('#employee-ceu-level').click();
        await expect(page.getByRole('option')).toHaveText(['Program Director', 'Manager', 'Program Staff', '<20 Hours Staff']);
        await page.getByRole('option', { name: 'Program Director', exact: true }).click();
        expect(await sectionIsDirty(page, 'Employment')).toBe(true);
        await saveEmployee(page);
        await expect.poll(requiredHours).not.toBe(before);
        await editEmployment(page);
        await chooseOption(page, page.locator('#employee-ceu-level'), '<20 Hours Staff');
        await saveEmployee(page);
        await expect.poll(requiredHours).toBe(before);
    });

    await test.step('The status pill stages a change and the header updates after Save', async () => {
        const before = (await pill(page).innerText()).trim();
        const flipped = before === 'Active' ? 'Inactive' : 'Active';
        await editEmployment(page);
        await pill(page).click();
        await expect(pill(page)).toHaveText(flipped);
        expect(await sectionIsDirty(page, 'Employment')).toBe(true);
        await expect(page.getByText('Inactive', { exact: true })).toHaveCount(before === 'Inactive' ? 2 : 1);
        await saveEmployee(page);
        await expect(pill(page)).toHaveText(flipped);
        await editEmployment(page);
        await pill(page).click();
        await discardPending(page);
        await expect(pill(page)).toHaveText(flipped);
        await setEmployeeStatus(page, before as 'Active' | 'Inactive');
    });

    await test.step('Changing the Employee ID keeps the certificate and shows in the list and History', async () => {
        await issueCertificate(page, certificate, awardedToExpireIn(60));
        await saveEmployee(page);
        await editEmployment(page);
        await page.locator('#employee-number').fill(`${name}x`);
        await saveEmployee(page);
        await expect(main(page)).toContainText(`ID ${name}x`);
        await expect(main(page)).toContainText(certificate);
        const history = await openHistory(page);
        await history.getByText('Employee updated', { exact: true }).first().click();
        await expect(history).toContainText(name);
        await expect(history).toContainText(`${name}x`);
        await closeHistory(page);
        await editEmployment(page);
        await page.locator('#employee-number').fill(name);
        await saveEmployee(page);
        await page.getByRole('button', { name: `Remove ${certificate}`, exact: true }).first().click();
        await saveEmployee(page);
    });
}

async function photoSection(page: Page, name: string): Promise<void> {
    await test.step('A chosen photo previews, Cancel reverts it and Save keeps it', async () => {
        const had = await photo(page, name).count();
        await chooseFile(page, page.getByRole('button', { name: 'Change photo' }), photoFile);
        await expect(photo(page, name)).toHaveCount(1);
        await expect(saveButton(page)).toBeVisible();
        await discardPending(page);
        await expect(photo(page, name)).toHaveCount(had);
        await chooseFile(page, page.getByRole('button', { name: 'Change photo' }), photoFile);
        await saveEmployee(page);
        await expect(photo(page, name)).toHaveCount(1);
    });
}

async function certificatesSection(page: Page, certificate: string): Promise<void> {
    await test.step('The Issue certificate popup lists active certificates and checks the date', async () => {
        await page.getByRole('button', { name: 'Issue certificate' }).click();
        await expect(dialog(page).getByRole('button', { name: 'Issue', exact: true })).toBeDisabled();
        await dialog(page).locator('#issue-certificate').click();
        expect(await page.getByRole('option').allInnerTexts()).toContain(certificate);
        await page.getByRole('option', { name: certificate, exact: true }).click();
        await dialog(page).locator('#issue-certificate-date').fill('2099-01-01');
        await expect(dialog(page)).toContainText('Certificates cannot be awarded in the future.');
        await dialog(page).locator('#issue-certificate-date').fill(awardedToExpireIn(30));
        await expect(dialog(page)).toContainText(/Expir(es|ing) \d{2}\/\d{2}\/\d{4}/);
        await expect(dialog(page).getByRole('button', { name: 'Manage certificates' })).toBeVisible();
        await dialog(page).getByText(/^cancel$/i).click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
    });

    await test.step('An issued certificate counts its expiry from the issue date and needs Save', async () => {
        await issueCertificate(page, certificate, awardedToExpireIn(30));
        await expect(main(page)).toContainText('New');
        expect(await sectionIsDirty(page, 'Certificates')).toBe(true);
        await saveEmployee(page);
        await expect(main(page)).toContainText('Expiring Cert');
    });

    await test.step('A saved certificate can be removed, undone and removed for good', async () => {
        await page.getByRole('button', { name: `Remove ${certificate}`, exact: true }).last().click();
        await expect(main(page)).toContainText('Removed');
        expect(await sectionIsDirty(page, 'Certificates')).toBe(true);
        await page.getByRole('button', { name: `Undo removing ${certificate}`, exact: true }).click();
        await expect(main(page)).not.toContainText('Removed');
        await expect(saveButton(page)).toHaveCount(0);
        await page.getByRole('button', { name: `Remove ${certificate}`, exact: true }).last().click();
        await saveEmployee(page);
        await expect(main(page)).not.toContainText('Expiring Cert');
    });
}

async function documentsSection(page: Page): Promise<void> {
    await test.step('A document uploads at once, a wrong type is refused', async () => {
        await page.locator('input[type=file]').nth(1).setInputFiles(textFile);
        await expect(toast(page, 'Document uploaded').first()).toBeVisible();
        await expect(main(page)).toContainText('sabih-automation-testing.txt');
        await expect(saveButton(page)).toHaveCount(0);
        await page.locator('input[type=file]').nth(1).setInputFiles(wrongTypeFile);
        await expect(toast(page, 'Choose a PDF, Word, Excel, image or text file.').first()).toBeVisible();
    });

    await test.step('Removing a document asks first and ignores a pending edit', async () => {
        await editSection(page, 'employee-email', 'Email', 'Contact');
        await page.locator('#employee-email').fill('pending@example.com');
        await page.getByRole('button', { name: 'Remove sabih-automation-testing.txt' }).click();
        await expect(dialog(page)).toContainText('Are you sure you want to delete "sabih-automation-testing.txt"?');
        await expect(dialog(page)).toContainText('This action cannot be undone.');
        await confirmYes(page).click();
        await expect(toast(page, 'Document removed').first()).toBeVisible();
        await expect(saveButton(page)).toBeVisible();
        await discardPending(page);
        await expect(main(page)).toContainText('No documents attached.');
    });
}

async function notesSection(page: Page, name: string): Promise<void> {
    const add = page.getByRole('button', { name: 'Add note' });
    const field = page.locator('#employee-new-note');

    await test.step('Add note needs text, saves at once and lists newest first', async () => {
        await expect(add).toBeDisabled();
        await field.fill('   ');
        await expect(add).toBeDisabled();
        await field.fill(`${name} note one`);
        await add.click();
        await expect(toast(page, 'Note saved').first()).toBeVisible();
        await expect(main(page)).toContainText(`${name} note one`);
        await field.fill(`${name} note two`);
        await add.click();
        await expect(main(page)).toContainText(`${name} note two`);
        const text = await main(page).innerText();
        expect(text.indexOf('note two')).toBeLessThan(text.indexOf('note one'));
        await field.fill('x'.repeat(1001));
        await expect(main(page)).toContainText('1000/1000');
        await field.fill('');
    });

    await test.step('A note edits in place with its own Save and ignores the page Cancel', async () => {
        await editSection(page, 'employee-email', 'Email', 'Contact');
        await page.locator('#employee-email').fill('pending@example.com');
        await page.getByRole('button', { name: 'Edit note' }).last().click();
        await page.locator('textarea').filter({ hasText: 'note one' }).first().fill(`${name} note one edited`);
        await page.getByRole('button', { name: 'Save', exact: true }).first().click();
        await expect(main(page)).toContainText('(edited)');
        await discardPending(page);
        await expect(main(page)).toContainText(`${name} note one edited`);
    });

    await test.step('Removing a note asks first', async () => {
        for (let i = 0; i < 2; i++) {
            await page.getByRole('button', { name: 'Remove note' }).first().click();
            await expect(dialog(page)).toContainText('Are you sure you want to remove this note?');
            await confirmYes(page).click();
            await expect(toast(page, 'Note removed').first()).toBeVisible();
        }
        await expect(page.getByRole('button', { name: 'Remove note' })).toHaveCount(0);
    });
}

async function trainingAndLeaving(page: Page): Promise<void> {
    await test.step('Training history is empty and export is not available yet', async () => {
        await expect(main(page)).toContainText('No training recorded yet.');
        const exportButton = page.getByRole('button', { name: 'Export training record' });
        await expect(exportButton).toBeDisabled();
    });

    await test.step('Leaving with unsaved changes asks first and No keeps them', async () => {
        await editSection(page, 'employee-email', 'Email', 'Contact');
        await page.locator('#employee-email').fill('guard@example.com');
        await page.getByRole('button', { name: 'Back' }).first().click();
        await expect(dialog(page)).toContainText('You have unsaved changes.');
        await expect(dialog(page)).toContainText('Leave this page and discard them?');
        await page.getByRole('dialog').last().getByText(/^no$/i).click();
        await expect(page.getByText('Employee Details')).toBeVisible();
        await expect(main(page)).toContainText('guard@example.com');
        await expect(saveButton(page)).toBeVisible();
        await discardPending(page);
    });
}

async function historySection(page: Page): Promise<void> {
    await test.step('History lists the changes with old and new values', async () => {
        const history = await openHistory(page);
        await expect(history).toContainText('Performed By');
        for (const action of ['Employee updated', 'Certificate issued', 'Certificate removed', 'Document added', 'Document removed', 'Note added', 'Note edited', 'Note removed']) {
            await expect(history.getByText(action, { exact: true }).first()).toBeVisible();
        }
        await history.getByText('Employee updated', { exact: true }).first().click();
        await expect(history).toContainText('Changed Value(s)');
        await closeHistory(page);
    });
}

/** Clears the test employee's leftovers and makes them inactive. */
async function cleanUp(page: Page, names: string[], certificate: string): Promise<void> {
    await page.keyboard.press('Escape').catch(() => undefined);
    await dismissOverlays(page);
    if (await page.getByText('Employee Details').count()) await backToEmployees(page);
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
test('T-75268 Employee Details', async ({ page }) => {
    test.setTimeout(900000);
    await loginToSchoolCafe2(page);
    await openEmployees(page);

    const [name, other] = [3, 4].map((i) => `${AUTOMATION_PREFIX}${i}`);
    const stamp = String(Date.now()).slice(-6);
    const certificate = await createCertificate(page);
    await openEmployees(page);
    await resetEmployeesView(page);

    let passed = false;
    try {
        await prepareEmployee(page, name);
        await prepareEmployee(page, other);
        await openEmployee(page, name);
        await test.step('Header, tiles and sections', () => headerAndSections(page, name));
        await test.step('Staged editing across the sections', () => stagedEditing(page, name, stamp));
        await test.step('Name and Employee ID', () => nameAndEmployeeId(page, name, other));
        await test.step('Employment fields, CEU level, status and ID change', () => employmentFields(page, name, certificate));
        await test.step('Photo', () => photoSection(page, name));
        await test.step('Certificates', () => certificatesSection(page, certificate));
        await test.step('Documents', () => documentsSection(page));
        await test.step('Notes', () => notesSection(page, name));
        await test.step('Training history and leaving the page', () => trainingAndLeaving(page));
        await test.step('History', () => historySection(page));
        passed = true;
    } finally {
        // a failed run keeps its own error instead of the cleanup's
        await cleanUp(page, [name, other], certificate).catch((error) => {
            if (passed) throw error;
        });
    }
});

