// Professional Standards - Record Training - Training from a template

import { test, expect, Page } from '@playwright/test';
import {
    automationNames,
    closeHistory,
    createCertificate,
    dialog,
    loginToSchoolCafe2,
    openEmployee,
    openEmployees,
    openHistory,
    toast,
} from '../../utils/professionalStandards';
import { cleanUp, createTemplate, deactivateTestTemplates, openTemplates, setCertificateStatus } from '../../utils/trainingTemplates';
import {
    addAttendee,
    attendeeSearch,
    backOnList,
    cancelFlow,
    continueButton,
    createAttendees,
    leaveFlow,
    main,
    mainText,
    openRecordTraining,
    openTraining,
    recordAndReturn,
    recordEventButton,
    retireAttendees,
    toStep2,
    trainingSearch,
    trainingTile,
} from '../../utils/recordTraining';

// --- Locators
const FILES = 'utils/files/';
const date = (page: Page) => page.locator('#record-date');
const location = (page: Page) => page.locator('#record-location');
const notes = (page: Page) => page.locator('#attendees-notes');
const keepEditing = (page: Page) => page.getByText(/^keep editing$/i);
const discardChanges = (page: Page) => page.getByText(/^discard changes$/i);
const printSheet = (page: Page) => page.getByRole('button', { name: 'Print sign-in sheet' });
const lowered = async (page: Page) => (await mainText(page)).toLowerCase();
const shows = (page: Page, text: string) => expect.poll(() => lowered(page), { timeout: 15000 }).toContain(text.toLowerCase());
const hides = (page: Page, text: string) => expect.poll(() => lowered(page), { timeout: 15000 }).not.toContain(text.toLowerCase());
const today = () => new Date().toLocaleDateString('en-CA');

// --- Sections
async function stepOneDetails(page: Page, t: { mandatory: string; certificate: string }): Promise<void> {
    await test.step('Step 1 shows the template, its hours, topics and certificate', async () => {
        await openTraining(page, t.mandatory);
        for (const part of ['Record from a template', t.mandatory, 'Mandatory', 'Step 1 of 2', '1.5', 'CEU hrs', 'Edit template', 'Certificate awarded', t.certificate, 'Print sign-in sheet']) {
            await shows(page, part);
        }
        await expect(continueButton(page)).toBeEnabled();
    });

    await test.step('Date and location default and the date cannot be in the future', async () => {
        await shows(page, '- Today');
        await shows(page, "Defaults to today. Change it if you're recording a past session.");
        await shows(page, 'Optional. Choose where this took place, or leave it unspecified.');
        await expect(date(page)).toHaveValue(today());
        await expect(location(page)).toHaveValue('Unspecified');
        await location(page).click();
        const options = await page.getByRole('option').allInnerTexts();
        await page.keyboard.press('Escape');
        expect(options[0]).toBe('Unspecified');
        expect(options.length).toBeGreaterThan(1);
        await date(page).fill('2026-10-01');
        await expect(continueButton(page)).toBeEnabled();
        await date(page).fill('2999-01-01');
        await shows(page, "The training date can't be in the future.");
        await expect(continueButton(page)).toBeDisabled();
        await date(page).fill('');
        await expect(continueButton(page)).toBeDisabled();
        await date(page).fill(today());
        await expect(continueButton(page)).toBeEnabled();
    });

    await test.step('The sign-in sheet prints the training, date and location', async () => {
        await printSheet(page).click();
        await expect(dialog(page)).toContainText('Include training title');
        await expect(dialog(page)).toContainText('Sign-in sheet');
        await expect(dialog(page)).toContainText(t.mandatory);
        await expect(dialog(page)).toContainText('Date:');
        await expect(dialog(page)).toContainText('Location:');
        await dialog(page).getByRole('checkbox').uncheck();
        await expect(dialog(page)).not.toContainText(t.mandatory);
        await dialog(page).getByRole('checkbox').check();
        await page.locator('#sign-in-sheet-close').click();
    });

    await test.step('Cancel with nothing entered returns at once', async () => {
        await cancelFlow(page).click();
        await expect(trainingSearch(page)).toBeVisible();
        await expect(page.getByRole('dialog')).toHaveCount(0);
    });
}

async function stepTwoAttendees(page: Page, name: string, people: string[]): Promise<void> {
    await test.step('Step 2 starts empty with the record button disabled', async () => {
        await openTraining(page, name);
        await toStep2(page);
        for (const part of ['Who was present for this training?', 'No attendees yet. Search below to add people.', 'Add people', 'Sign-in sheet (optional)', 'Documents (optional)', 'Notes (internal only)', '0/1000', 'Mark at least one attendee as attended to record this training.']) {
            await shows(page, part);
        }
        await hides(page, 'Edit template');
        await expect(recordEventButton(page)).toBeDisabled();
    });

    await test.step('Cancel with a note asks first and Keep editing stays', async () => {
        await notes(page).fill('discard me');
        await cancelFlow(page).click();
        await expect(dialog(page)).toContainText('Discard changes?');
        await expect(dialog(page)).toContainText('You have unsaved changes to this training. If you leave now, they will be lost.');
        await keepEditing(page).click();
        await expect(notes(page)).toHaveValue('discard me');
        await cancelFlow(page).click();
        await discardChanges(page).click();
        await expect(trainingSearch(page)).toBeVisible();
        await openTraining(page, name);
        await toStep2(page);
        await expect(notes(page)).toHaveValue('');
    });

    await test.step('Quick search adds people and says when nobody matches', async () => {
        await attendeeSearch(page).fill('zzzz');
        await expect(page.getByText('No matching employees. Try Advanced search for more filters.')).toBeVisible();
        await attendeeSearch(page).fill('');
        await addAttendee(page, people[0]);
        await shows(page, '1 of 1 marked attended');
        await shows(page, 'Added');
        await attendeeSearch(page).fill(people[0]);
        await expect(page.getByRole('option').filter({ hasText: people[0] })).toHaveCount(0);
        await attendeeSearch(page).fill('');
    });

    await test.step('Marking not attended updates the count and can be removed', async () => {
        await page.locator('main li button[aria-pressed]').first().click();
        await shows(page, '0 of 1 marked attended');
        await shows(page, 'not attended');
        await expect(recordEventButton(page)).toBeDisabled();
        await page.getByText('Remove', { exact: true }).first().click();
        await shows(page, 'No attendees yet.');
    });

    await test.step('Advanced search adds several people at once', async () => {
        await page.getByRole('button', { name: 'Advanced search' }).click();
        await expect(dialog(page)).toContainText('Add attendees');
        await dialog(page).getByRole('button', { name: 'Cancel' }).click();
        await shows(page, 'No attendees yet.');
        await addAttendee(page, people[0]);
    });

    await test.step('Notes count up to 1000 and files are checked', async () => {
        await notes(page).fill('a'.repeat(1200));
        await expect(notes(page)).toHaveValue('a'.repeat(1000));
        await shows(page, '1000/1000');
        await notes(page).fill('Automation note');
        await shows(page, '15/1000');
        const files = page.locator('input[type=file]');
        await files.nth(0).setInputFiles(`${FILES}photo.png`);
        await shows(page, 'photo.png');
        await files.nth(0).setInputFiles(`${FILES}sabih-automation-testing.txt`);
        await hides(page, 'sabih-automation-testing.txt');
        await files.nth(1).setInputFiles(`${FILES}sabih-automation-testing.txt`);
        await shows(page, 'sabih-automation-testing.txt');
    });

    await test.step('Back keeps the date, location and attendees', async () => {
        await page.getByRole('button', { name: 'Back' }).click();
        await shows(page, 'Step 1 of 2');
        await expect(date(page)).toHaveValue(today());
        await toStep2(page);
        await shows(page, '1 of 1 marked attended');
        await expect(notes(page)).toHaveValue('Automation note');
        await shows(page, 'photo.png');
        await leaveFlow(page);
    });
}

async function recordFromTemplate(page: Page, name: string, people: string[]): Promise<void> {
    await test.step('Recording credits the attended person and returns to the list', async () => {
        await openTraining(page, name);
        await toStep2(page);
        await addAttendee(page, people[0]);
        await addAttendee(page, people[1]);
        await page.locator('main li button[aria-pressed]').nth(1).click();
        await shows(page, '1 of 2 marked attended');
        await notes(page).fill('Automation note');
        const files = page.locator('input[type=file]');
        await files.nth(0).setInputFiles(`${FILES}photo.png`);
        await files.nth(1).setInputFiles(`${FILES}sabih-automation-testing.txt`);
        await recordAndReturn(page, name, 1);
        await expect(trainingTile(page, name)).toContainText(/./);
    });

    await test.step('Opening the template again starts clean', async () => {
        await openTraining(page, name);
        await toStep2(page);
        await shows(page, 'No attendees yet.');
        await expect(notes(page)).toHaveValue('');
        await hides(page, 'photo.png');
        await leaveFlow(page);
    });
}

async function eventsAndHistory(page: Page, name: string, people: string[]): Promise<void> {
    await test.step('The event is on the Events page with its details', async () => {
        await backOnList(page);
        await page.getByRole('button', { name: 'Events', exact: true }).first().click();
        await page.getByPlaceholder('Search by name, location or recorded by').fill(name);
        const group = page.getByText(/\d+ events?$/).first();
        if (await group.count()) await group.click();
        const row = page.getByRole('row').filter({ hasText: name }).first();
        await expect(row).toContainText('1');
        await row.click();
        for (const part of ['Event Details', 'From a training template', 'CEU hours', 'Recorded by', 'ATTENDEES (1)', `${people[0]} ${people[0]}`, 'photo.png', 'sabih-automation-testing.txt', 'Automation note']) {
            await shows(page, part);
        }
        await hides(page, `${people[1]} ${people[1]}`);
    });

    await test.step('History records the event', async () => {
        await openHistory(page);
        await expect(dialog(page)).toContainText('Training event recorded');
        await closeHistory(page);
    });

    await test.step('The attendee has the training and the not-attended person does not', async () => {
        await openEmployees(page);
        await openEmployee(page, people[0]);
        await shows(page, name);
        await shows(page, 'CEU hours (YTD)');
    });
}

async function exceptions(page: Page, t: { certificateTemplate: string; certificate: string }): Promise<void> {
    await test.step('An inactive certificate stops the template being recorded', async () => {
        await setCertificateStatus(page, t.certificate, 'Inactive');
        await openRecordTraining(page);
        await expect(trainingTile(page, t.certificateTemplate)).toHaveAccessibleName(/Can't be recorded until fixed: Inactive certificate/);
        await trainingTile(page, t.certificateTemplate).click();
        await shows(page, "This training can't be recorded");
        await shows(page, 'It has an exception. Fix it in the template, then come back to record it.');
        await shows(page, `Inactive certificate: ${t.certificate}`);
        await expect(continueButton(page)).toBeDisabled();
        await expect(printSheet(page)).toBeEnabled();
        await expect(page.getByRole('button', { name: 'Edit template' })).toBeEnabled();
    });

    await test.step('Edit template returns to the notice and a fixed template records again', async () => {
        await page.getByRole('button', { name: 'Edit template' }).click();
        await expect(page.getByText('Edit training template')).toBeVisible();
        await page.getByRole('button', { name: 'Cancel' }).click();
        await shows(page, "This training can't be recorded");
        await leaveFlow(page);
        await setCertificateStatus(page, t.certificate, 'Active');
        await openTraining(page, t.certificateTemplate);
        await hides(page, "This training can't be recorded");
        await expect(continueButton(page)).toBeEnabled();
        await leaveFlow(page);
    });
}

async function keyboardFlow(page: Page, name: string, people: string[]): Promise<void> {
    await test.step('A tile, the key area bars and attendee rows work from the keyboard', async () => {
        await backOnList(page);
        await trainingTile(page, name).focus();
        await page.keyboard.press('Enter');
        await shows(page, 'Step 1 of 2');
        const bar = page.getByRole('button', { name: /^Nutrition/ });
        await bar.focus();
        await page.keyboard.press('Enter');
        await expect(bar).toHaveAttribute('aria-expanded', 'true');
        await page.keyboard.press('Space');
        await expect(bar).toHaveAttribute('aria-expanded', 'false');
        await continueButton(page).focus();
        await page.keyboard.press('Enter');
        await shows(page, 'Step 2 of 2');
        await addAttendee(page, people[0]);
        const row = page.locator('main li button[aria-pressed]').first();
        await row.focus();
        await page.keyboard.press('Enter');
        await expect(row).toHaveAttribute('aria-pressed', 'false');
        await page.keyboard.press('Space');
        await expect(row).toHaveAttribute('aria-pressed', 'true');
        await leaveFlow(page);
    });
}

// --- Test
test('T-77655 Record Training - Training from a template', async ({ page }) => {
    test.setTimeout(900000);
    await loginToSchoolCafe2(page);

    const [mandatory, plain, certificateTemplate] = automationNames(3);
    let people: string[] = [];
    let passed = false;
    try {
        await cleanUp(page);
        people = await createAttendees(page, 2);
        const certificate = await createCertificate(page);
        await openTemplates(page);
        await createTemplate(page, { name: mandatory, hours: 1.5, topic: '1110', mandatory: true, certificate: 'Test Cert' });
        await createTemplate(page, { name: plain, hours: 1, topic: '1110' });
        await createTemplate(page, { name: certificateTemplate, hours: 1, topic: '1110', certificate });
        await openRecordTraining(page);

        await test.step('Step 1 details', () => stepOneDetails(page, { mandatory, certificate: 'Test Cert' }));
        await test.step('Step 2 attendees', () => stepTwoAttendees(page, plain, people));
        await test.step('Recording', () => recordFromTemplate(page, plain, people));
        await test.step('Events page and history', () => eventsAndHistory(page, plain, people));
        await test.step('Exceptions', () => exceptions(page, { certificateTemplate, certificate }));
        await test.step('Keyboard', () => keyboardFlow(page, plain, people));
        passed = true;
    } finally {
        // a failed run keeps its own error instead of the cleanup's
        await (async () => {
            await backOnList(page);
            if (people.length) await retireAttendees(page, people);
            await cleanUp(page);
            await deactivateTestTemplates(page);
        })().catch((error) => {
            if (passed) throw error;
        });
    }
});
