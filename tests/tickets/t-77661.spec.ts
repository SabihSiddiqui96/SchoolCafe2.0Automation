// Professional Standards - Record Training - Record Other Training

import { test, expect, Page } from '@playwright/test';
import { automationNames, closeHistory, createCertificate, dialog, loginToSchoolCafe2, openEmployee, openEmployees, openHistory, toast } from '../../utils/professionalStandards';
import { cleanUp } from '../../utils/trainingTemplates';
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
    openOther,
    openRecordTraining,
    recordAndReturn,
    recordEventButton,
    retireAttendees,
    toStep2,
    trainingSearch,
} from '../../utils/recordTraining';

// --- Locators
const FILES = 'utils/files/';
const eventName = (page: Page) => page.locator('#other-name');
const date = (page: Page) => page.locator('#other-date');
const location = (page: Page) => page.locator('#other-location');
const hours = (page: Page) => page.locator('#other-hours');
const topicBox = (page: Page) => page.getByRole('combobox', { name: /Add a topic or sub-topic/ });
const source = (page: Page) => page.getByRole('combobox', { name: 'Training source' });
const method = (page: Page) => page.getByRole('combobox', { name: 'Training method' });
const certificate = (page: Page) => page.getByRole('combobox', { name: /Certificate to issue/ });
const notes = (page: Page) => page.locator('#attendees-notes');
const keepEditing = (page: Page) => page.getByText(/^keep editing$/i);
const discardChanges = (page: Page) => page.getByText(/^discard changes$/i);
const NUTRITION = '1110 · Reimbursable Meal Menu Requirements';
const OPERATIONS = '2110 · Standardized Recipe Food Preparation';
const today = () => new Date().toLocaleDateString('en-CA');

// --- Helpers
const shows = (page: Page, text: string) => expect.poll(() => mainText(page), { timeout: 15000 }).toContain(text);
const hides = (page: Page, text: string) => expect.poll(() => mainText(page), { timeout: 15000 }).not.toContain(text);

async function pickTopic(page: Page, option: string): Promise<void> {
    await topicBox(page).click();
    await topicBox(page).fill(option.split(' ')[0]);
    await page.getByRole('option', { name: option, exact: true }).click();
    await page.keyboard.press('Escape');
}

async function setHours(page: Page, value: string): Promise<void> {
    await hours(page).fill(value);
    await page.keyboard.press('Tab');
}

async function optionsOf(page: Page, control: ReturnType<typeof source>): Promise<string[]> {
    await control.click();
    const options = await page.getByRole('option').allInnerTexts();
    await page.keyboard.press('Escape');
    return options;
}

async function fillRequired(page: Page, name: string, topic = NUTRITION): Promise<void> {
    await eventName(page).fill(name);
    await pickTopic(page, topic);
}

// --- Sections
async function formDefaults(page: Page): Promise<void> {
    await test.step('The form opens blank with its sections and defaults', async () => {
        await openOther(page);
        const text = (await mainText(page)).toLowerCase();
        for (const part of [
            'record other training', 'step 1 of 2 · details', 'no ceu', 'basics (required)', 'event name *', 'optional. choose where this took place, or leave it unspecified.',
            'date *', '- today', 'optional. leave blank for no ceu hours.', 'topics & sub-topics (required)', 'no topics selected yet', 'content & source',
            'training source', 'training method', 'resources', 'no related links yet', '+ add link', 'certification', 'certificate to issue (optional)',
            'awards the configured certificate to all attendees of this event.', 'required to continue: event name, at least one topic.',
        ]) expect(text, part).toContain(part);
        await expect(eventName(page)).toHaveAttribute('placeholder', 'e.g. Emergency allergy protocol review');
        await expect(date(page)).toHaveValue(today());
        await expect(location(page)).toHaveValue('Unspecified');
        await expect(continueButton(page)).toBeDisabled();
        await expect(page.locator('#template-description')).toHaveAttribute('data-placeholder', 'What does this training cover?');
    });

    await test.step('Location, source, method and certificate offer the right choices', async () => {
        await location(page).click();
        const places = await page.getByRole('option').allInnerTexts();
        await page.keyboard.press('Escape');
        expect(places[0]).toBe('Unspecified');
        expect(places.length).toBeGreaterThan(1);
        const sources = await optionsOf(page, source(page));
        expect(sources).toEqual(expect.arrayContaining(['District', 'USDA', '+ Add new training source…']));
        const methods = await optionsOf(page, method(page));
        expect(methods).toEqual(expect.arrayContaining(['Online', '+ Add new training method…']));
        const certificates = await optionsOf(page, certificate(page));
        expect(certificates[0]).toBe('None');
    });

    await test.step('Past dates are allowed and a future date is blocked', async () => {
        await fillRequired(page, 'check');
        await date(page).fill('2026-10-01');
        await expect(continueButton(page)).toBeEnabled();
        await date(page).fill('2999-01-01');
        await expect(page.getByText("The training date can't be in the future.")).toBeVisible();
        await expect(continueButton(page)).toBeDisabled();
        await date(page).fill(today());
        await expect(continueButton(page)).toBeEnabled();
    });

    await test.step('Cancel returns at once when nothing changed', async () => {
        await backOnList(page);
        await openOther(page);
        await cancelFlow(page).click();
        await expect(trainingSearch(page)).toBeVisible();
        await expect(page.getByRole('dialog')).toHaveCount(0);
    });
}

async function ceuHours(page: Page): Promise<void> {
    await test.step('Invalid hours show a message and block Continue', async () => {
        await openOther(page);
        await fillRequired(page, 'hours check');
        await setHours(page, 'abc');
        await expect(page.getByText('Hours are entered in 0.25 steps, for example 0.25, 0.5 or 1.75.')).toBeVisible();
        await expect(continueButton(page)).toBeDisabled();
        await shows(page, 'Fix to continue: CEU hours in 0.25 steps.');
        await setHours(page, '-1');
        await expect(page.getByText("CEU hours can't be negative.")).toBeVisible();
        await expect(continueButton(page)).toBeDisabled();
        await setHours(page, '10000');
        await expect(page.getByText("CEU hours can't be more than 9999.")).toBeVisible();
        await expect(continueButton(page)).toBeDisabled();
    });

    await test.step('Valid hours show in the header and blank means no CEU hours', async () => {
        for (const [value, header] of [['0.25', '0.25 CEU hrs'], ['1.75', '1.75 CEU hrs'], ['2', '2.0 CEU hrs'], ['', 'No CEU'], ['0', 'No CEU']]) {
            await setHours(page, value);
            await expect(continueButton(page)).toBeEnabled();
            await shows(page, header);
            await expect(page.getByText(/Hours are entered in 0.25 steps|can't be negative/)).toHaveCount(0);
        }
        await shows(page, 'Optional. Leave blank for no CEU hours.');
    });
}

async function topics(page: Page): Promise<void> {
    await test.step('A topic is required and the list is grouped by code', async () => {
        await openOther(page);
        await eventName(page).fill('topics check');
        await shows(page, 'Required to continue: at least one topic.');
        await expect(continueButton(page)).toBeDisabled();
        await topicBox(page).click();
        const all = await page.getByRole('option').allInnerTexts();
        await page.keyboard.press('Escape');
        expect(all.length).toBeGreaterThan(50);
        expect(all[0]).toBe('1000 · Nutrition');
        expect(all).toContain('2000 · Operations');
    });

    await test.step('Selected topics show by key area, cannot be picked twice and can be removed', async () => {
        await pickTopic(page, NUTRITION);
        await shows(page, 'Reimbursable Meal Menu Requirements');
        await expect(continueButton(page)).toBeEnabled();
        await topicBox(page).click();
        await topicBox(page).fill('1110');
        const again = page.getByRole('option', { name: NUTRITION, exact: true });
        if (await again.count()) await expect(again).toHaveAttribute('aria-disabled', 'true');
        await page.keyboard.press('Escape');
        await pickTopic(page, OPERATIONS);
        await shows(page, 'Standardized Recipe Food Preparation');
        await page.getByRole('button', { name: /^Remove Reimbursable/ }).click();
        await hides(page, 'Reimbursable Meal Menu Requirements');
        await page.getByRole('button', { name: /^Remove Standardized/ }).click();
        await shows(page, 'No topics selected yet');
        await expect(continueButton(page)).toBeDisabled();
    });
}

async function splitHours(page: Page, name: string): Promise<void> {
    await test.step('Two key areas offer a split with a running total', async () => {
        await openOther(page);
        await fillRequired(page, name);
        await setHours(page, '3');
        await hides(page, 'Split by key area');
        await pickTopic(page, OPERATIONS);
        await page.getByText('Split by key area').click();
        await shows(page, 'Use a single total');
        await shows(page, 'Total CEU hours:');
        await expect(page.locator('#other-hours-1')).toHaveValue('3');
        await page.locator('#other-hours-1').fill('1');
        await page.locator('#other-hours-2').fill('1.5');
        await page.keyboard.press('Tab');
        await shows(page, 'Total CEU hours: 2.5');
        await shows(page, '2.5 CEU hrs');
        await page.locator('#other-hours-2').fill('abc');
        await page.keyboard.press('Tab');
        await expect(continueButton(page)).toBeDisabled();
        await page.locator('#other-hours-2').fill('1.5');
        await page.keyboard.press('Tab');
    });

    await test.step('Using a single total puts the sum back in one field', async () => {
        await page.getByText('Use a single total').click();
        await expect(hours(page)).toHaveValue('2.5');
        await page.getByRole('button', { name: /^Remove Standardized/ }).click();
        await hides(page, 'Split by key area');
    });
}

async function relatedLinks(page: Page, name: string): Promise<void> {
    await test.step('Links need a valid address and empty rows are ignored', async () => {
        await openOther(page);
        await fillRequired(page, name);
        await setHours(page, '1');
        await page.getByRole('button', { name: '+ Add link' }).click();
        await expect(page.getByLabel('Label 1')).toHaveAttribute('placeholder', 'Label, e.g. Provider course page');
        await expect(page.getByLabel('Address 1')).toHaveAttribute('placeholder', 'https://example.org');
        await expect(continueButton(page)).toBeEnabled();
        await page.getByLabel('Address 1').fill('notaurl');
        await page.keyboard.press('Tab');
        await shows(page, 'Enter a valid web address, like https://example.org');
        await shows(page, 'Fix to continue: related link addresses.');
        await expect(continueButton(page)).toBeDisabled();
        await page.getByLabel('Address 1').fill(`https://example.org/${name}`);
        await page.keyboard.press('Tab');
        await expect(continueButton(page)).toBeEnabled();
    });
}

async function addNewSourceAndMethod(page: Page, newSource: string, newMethod: string): Promise<void> {
    await test.step('A new source is added, selected and kept district-wide', async () => {
        await openOther(page);
        await source(page).click();
        await page.getByRole('option', { name: '+ Add new training source…' }).click();
        await expect(page.locator('#template-add-Source')).toBeDisabled();
        for (const duplicate of ['District', 'district']) {
            await page.getByLabel('New training source').fill(duplicate);
            await page.locator('#template-add-Source').click();
            await expect(page.getByText(/already exists/).first()).toBeVisible();
        }
        await page.getByLabel('New training source').fill(newSource);
        await page.locator('#template-add-Source').click();
        await expect(toast(page, `Added "${newSource}" to training sources`).first()).toBeVisible();
        await expect(source(page)).toContainText(newSource);
        await source(page).click();
        await page.getByRole('option', { name: '+ Add new training source…' }).click();
        await page.locator('#template-cancel-Source').click();
        await expect(source(page)).toContainText(newSource);
    });

    await test.step('A new method is added the same way and survives cancelling', async () => {
        await method(page).click();
        await page.getByRole('option', { name: '+ Add new training method…' }).click();
        await page.getByLabel('New training method').fill('Online');
        await page.locator('#template-add-Method').click();
        await expect(page.getByText(/already exists/).first()).toBeVisible();
        await page.getByLabel('New training method').fill(newMethod);
        await page.locator('#template-add-Method').click();
        await expect(toast(page, `Added "${newMethod}" to training methods`).first()).toBeVisible();
        await expect(method(page)).toContainText(newMethod);
        await leaveFlow(page);
        await openOther(page);
        expect(await optionsOf(page, source(page))).toContain(newSource);
        expect(await optionsOf(page, method(page))).toContain(newMethod);
    });
}

async function discarding(page: Page, name: string): Promise<void> {
    await test.step('Cancel with changes asks first and Keep editing keeps them', async () => {
        await openOther(page);
        await eventName(page).fill(name);
        await cancelFlow(page).click();
        await expect(dialog(page)).toContainText('Discard changes?');
        await expect(dialog(page)).toContainText('You have unsaved changes to this training. If you leave now, they will be lost.');
        await keepEditing(page).click();
        await expect(eventName(page)).toHaveValue(name);
        await cancelFlow(page).click();
        await discardChanges(page).click();
        await expect(trainingSearch(page)).toBeVisible();
    });

    await test.step('The next form starts blank', async () => {
        await openOther(page);
        await expect(eventName(page)).toHaveValue('');
        await shows(page, 'No topics selected yet');
    });

    await test.step('Cancel on Step 2 with a note asks first', async () => {
        await fillRequired(page, name);
        await setHours(page, '1');
        await toStep2(page);
        await notes(page).fill('discard me');
        await cancelFlow(page).click();
        await expect(dialog(page)).toContainText('Discard changes?');
        await keepEditing(page).click();
        await expect(page.getByText('Step 2 of 2')).toBeVisible();
        await cancelFlow(page).click();
        await discardChanges(page).click();
        await expect(trainingSearch(page)).toBeVisible();
    });
}

async function attendeesStep(page: Page, name: string, people: string[]): Promise<void> {
    await test.step('Step 2 shows the event, an empty list and a disabled record button', async () => {
        await openOther(page);
        await fillRequired(page, name);
        await setHours(page, '1.5');
        await source(page).click();
        await page.getByRole('option', { name: 'District', exact: true }).click();
        await method(page).click();
        await page.getByRole('option', { name: 'Online', exact: true }).click();
        await toStep2(page);
        const text = (await mainText(page)).toLowerCase();
        for (const part of [name.toLowerCase(), '1.5 ceu hrs', 'who was present for this training?', 'no attendees yet. search below to add people.', 'add people', 'advanced search', 'sign-in sheet (optional)', 'print sign-in sheet', 'a photo or pdf of the signed sheet.', 'documents (optional)', 'handouts or other files from this session.', 'notes (internal only)', '0/1000', 'mark at least one attendee as attended to record this training.']) expect(text, part).toContain(part);
        expect(text).not.toContain('mandatory');
        expect(text).not.toContain('edit template');
        await expect(recordEventButton(page)).toBeDisabled();
    });

    await test.step('The printed sign-in sheet carries the event name', async () => {
        await page.getByRole('button', { name: 'Print sign-in sheet' }).click();
        await expect(dialog(page)).toContainText(name);
        await expect(dialog(page)).toContainText('Sign-in sheet');
        await page.locator('#sign-in-sheet-close').click();
    });

    await test.step('Quick search finds people, with a message when nobody matches', async () => {
        await attendeeSearch(page).fill('zzzz');
        await expect(page.getByText('No matching employees. Try Advanced search for more filters.')).toBeVisible();
        await attendeeSearch(page).fill('');
        await addAttendee(page, people[0]);
        await shows(page, '1 of 1 marked attended');
        await shows(page, 'Added');
        await expect(recordEventButton(page)).toBeEnabled();
    });

    await test.step('Marking not attended updates the count and the record button', async () => {
        await page.locator('main li button[aria-pressed]').first().click();
        await shows(page, '0 of 1 marked attended');
        await expect(recordEventButton(page)).toBeDisabled();
        await page.locator('main li button[aria-pressed]').first().click();
        await shows(page, '1 of 1 marked attended');
    });

    await test.step('Advanced search opens and cancels without adding anyone', async () => {
        await page.getByRole('button', { name: 'Advanced search' }).click();
        await expect(dialog(page)).toContainText('Add attendees');
        await dialog(page).getByRole('button', { name: 'Cancel' }).click();
        await shows(page, '1 of 1 marked attended');
    });

    await test.step('Back keeps Step 1 and Continue restores the attendees and note', async () => {
        await notes(page).fill('back and forth');
        await page.getByRole('button', { name: 'Back' }).click();
        await expect(page.getByText('Step 1 of 2 · Details')).toBeVisible();
        await expect(eventName(page)).toHaveValue(name);
        await expect(hours(page)).toHaveValue('1.5');
        await expect(source(page)).toContainText('District');
        await expect(method(page)).toContainText('Online');
        await shows(page, 'Reimbursable Meal Menu Requirements');
        await setHours(page, '2');
        await toStep2(page);
        await shows(page, '2.0 CEU hrs');
        await shows(page, '1 of 1 marked attended');
        await expect(notes(page)).toHaveValue('back and forth');
        await leaveFlow(page);
    });
}

async function recordEvent(page: Page, name: string, people: string[], newCertificate: string): Promise<void> {
    await test.step('Record with a certificate, links, files, a note and two attendees', async () => {
        await openOther(page);
        await fillRequired(page, name);
        await setHours(page, '1');
        await certificate(page).click();
        await page.getByRole('option', { name: newCertificate, exact: true }).click();
        await page.locator('#template-description').click();
        await page.keyboard.type('Automation description');
        await source(page).click();
        await page.getByRole('option', { name: 'District', exact: true }).click();
        await method(page).click();
        await page.getByRole('option', { name: 'Online', exact: true }).click();
        await page.getByRole('button', { name: '+ Add link' }).click();
        await page.getByLabel('Address 1').fill(`https://example.org/${name}`);
        await toStep2(page);
        await addAttendee(page, people[0]);
        await addAttendee(page, people[1]);
        await page.locator('main li button[aria-pressed]').nth(1).click();
        await shows(page, '1 of 2 marked attended');
        await notes(page).fill('Automation note');
        const files = page.locator('input[type=file]');
        await files.nth(0).setInputFiles(`${FILES}photo.png`);
        await files.nth(1).setInputFiles(`${FILES}sabih-automation-testing.txt`);
        await shows(page, 'photo.png');
        await shows(page, 'sabih-automation-testing.txt');
        await recordAndReturn(page, name, 1);
    });

    await test.step('The next recording starts blank', async () => {
        await page.locator('#record-other-training').click();
        await expect(eventName(page)).toHaveValue('');
        await shows(page, 'No topics selected yet');
        await fillRequired(page, name);
        await setHours(page, '1');
        await toStep2(page);
        await shows(page, 'No attendees yet.');
        await expect(notes(page)).toHaveValue('');
        await hides(page, 'photo.png');
        await leaveFlow(page);
    });
}

async function eventsPage(page: Page, name: string, people: string[], newCertificate: string): Promise<void> {
    await test.step('The event is listed as Other training with its details', async () => {
        await backOnList(page);
        await page.getByRole('button', { name: 'Events', exact: true }).first().click();
        await page.getByPlaceholder('Search by name, location or recorded by').fill(name);
        const group = page.getByText(/\d+ events?$/).first();
        if (await group.count()) await group.click();
        const row = page.getByRole('row').filter({ hasText: name }).first();
        await expect(row).toContainText(/other training/i);
        await row.click();
        for (const part of ['Event Details', 'Other training', 'Recorded by', 'District', 'Online', 'Automation description', 'example.org', `Certificate issued: ${newCertificate}`, 'ATTENDEES (1)', `${people[0]} ${people[0]}`, 'photo.png', 'sabih-automation-testing.txt', 'Automation note']) {
            await shows(page, part);
        }
        await hides(page, 'From a training template');
        await hides(page, `${people[1]} ${people[1]}`);
    });

    await test.step('History records the event', async () => {
        await openHistory(page);
        await expect(dialog(page)).toContainText('Training event recorded');
        await closeHistory(page);
    });

    await test.step('The Event source filter finds Other training events', async () => {
        await backOnList(page);
        await page.getByRole('button', { name: 'Events', exact: true }).first().click();
        await expect(page.getByPlaceholder('Search by name, location or recorded by')).toBeVisible();
        await page.waitForLoadState('networkidle');
        await page.getByRole('button', { name: 'Advanced search' }).click();
        await expect(page.getByRole('combobox', { name: /Event source/ })).toBeVisible();
        await page.getByRole('combobox', { name: /Event source/ }).click();
        await expect(page.getByRole('option')).toHaveText(['All events', 'From a training template', 'Other training']);
        await page.getByRole('option', { name: 'Other training', exact: true }).click();
        await page.getByPlaceholder('Search by name, location or recorded by').fill(name);
        const rows = page.getByRole('row').filter({ hasText: /\d+\/\d+/ });
        await expect(rows.first()).toContainText(/other training/i);
        await expect(page.getByRole('row').filter({ hasText: /from a training template/i })).toHaveCount(0);
    });

    await test.step('The attendee holds the certificate and the training', async () => {
        await openEmployees(page);
        await openEmployee(page, people[0]);
        await shows(page, newCertificate);
        await shows(page, name);
    });
}

async function keyboardFlow(page: Page, name: string): Promise<void> {
    await test.step('The whole of Step 1 works from the keyboard', async () => {
        await openOther(page);
        await eventName(page).focus();
        await page.keyboard.type(name);
        await topicBox(page).focus();
        await page.keyboard.type('1110');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await page.keyboard.press('Escape');
        await shows(page, 'Reimbursable Meal Menu Requirements');
        await expect(continueButton(page)).toBeEnabled();
        await cancelFlow(page).focus();
        await page.keyboard.press('Enter');
        await expect(dialog(page)).toContainText('Discard changes?');
        await keepEditing(page).click();
        await continueButton(page).focus();
        await page.keyboard.press('Enter');
        await expect(page.getByText('Step 2 of 2')).toBeVisible();
        await leaveFlow(page);
    });
}

// --- Test
test('T-77661 Record Other Training', async ({ page }) => {
    test.setTimeout(900000);
    await loginToSchoolCafe2(page);

    const [event, splitEvent, linkEvent, discardEvent, stepEvent, keyEvent, newSource, newMethod] = automationNames(8);
    let people: string[] = [];
    let passed = false;
    try {
        await cleanUp(page);
        people = await createAttendees(page, 2);
        const newCertificate = await createCertificate(page);
        await openRecordTraining(page);

        await test.step('Form defaults', () => formDefaults(page));
        await test.step('CEU hours', () => ceuHours(page));
        await test.step('Topics', () => topics(page));
        await test.step('Splitting hours', () => splitHours(page, splitEvent));
        await test.step('Related links', () => relatedLinks(page, linkEvent));
        await test.step('Adding a source and method', () => addNewSourceAndMethod(page, newSource, newMethod));
        await test.step('Discarding', () => discarding(page, discardEvent));
        await test.step('Attendees step', () => attendeesStep(page, stepEvent, people));
        await test.step('Recording', () => recordEvent(page, event, people, newCertificate));
        await test.step('Events page, history and employee', () => eventsPage(page, event, people, newCertificate));
        await test.step('Keyboard', () => keyboardFlow(page, keyEvent));
        passed = true;
    } finally {
        // a failed run keeps its own error instead of the cleanup's
        await (async () => {
            await backOnList(page);
            if (people.length) await retireAttendees(page, people);
            await cleanUp(page);
        })().catch((error) => {
            if (passed) throw error;
        });
    }
});
