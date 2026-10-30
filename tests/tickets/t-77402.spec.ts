// Professional Standards - Training Template editor

import { test, expect, Locator, Page } from '@playwright/test';
import {
    addEmployeeButton,
    AUTOMATION_PREFIX,
    automationNames,
    closeHistory,
    createCertificate,
    dialog,
    loginToSchoolCafe2,
    toast,
} from '../../utils/professionalStandards';
import {
    addTopicWithSubTopic,
    cleanUp,
    nameField,
    newTemplate,
    openIcon,
    openTemplates,
    setCertificateStatus,
    setSourceAndMethodStatus,
    setSubTopicStatus,
} from '../../utils/trainingTemplates';

// --- Locators
const FILES = 'utils/files/';
const hours = (page: Page) => page.locator('#template-hours');
const saveButton = (page: Page) => page.getByRole('button', { name: 'Save training template' });
const statusSwitch = (page: Page) => page.getByRole('switch', { name: 'Template status' });
const topicBox = (page: Page) => page.getByRole('combobox', { name: /Add a topic or sub-topic/ });
const description = (page: Page) => page.locator('#template-description');
const combo = (page: Page, name: string) => page.getByRole('combobox', { name });
const field = (page: Page, name: string) => page.getByRole('textbox', { name, exact: true });
const main = (page: Page) => page.locator('main');
const choice = (page: Page, name: string) => main(page).getByRole('button', { name, exact: true });
const badge = (page: Page) => main(page).getByText('Mandatory', { exact: true });
const listSwitch = (page: Page, name: string) => page.getByRole('switch', { name: `${name} status`, exact: true });
const SECTIONS = [
    'Basics (required)',
    'Topics & sub-topics (required)',
    'Content & source',
    'Location',
    'Resources',
    'Certification',
    'Audience & availability',
    'Visual identity',
];
const ICON_TABS: Record<string, string[]> = {
    Food: ['Nutrition', 'Meal components', 'Fruits & vegetables', 'Whole grains', 'Dairy', 'Breakfast & protein', 'Meal service', 'Production'],
    Safety: ['Food safety', 'Temperatures', 'Handwashing & sanitation', 'Allergens', 'First aid & CPR', 'Fire safety', 'Emergency', 'Hazards'],
    Operations: ['Kitchen skills', 'Transportation', 'Deliveries', 'Storage', 'Inventory', 'Equipment', 'Purchasing', 'Production records'],
    Admin: ['Policy', 'Audits & monitoring', 'Compliance', 'Government', 'Administration', 'Certification', 'Reporting', 'Privacy & records'],
    Training: ['General training', 'Conference session', 'Webinar', 'Online module', 'Team session', 'Customer service', 'Communications', 'Ideas & innovation'],
};
const COLOURS = ['Green', 'Blue', 'Dark blue', 'Purple', 'Gold', 'Orange', 'Red-brown', 'Brown', 'Grey', 'Black'];
const REQUIRED_NOTE = 'Required to save: event name, CEU hours, and at least one topic.';
const ALL_SITES = 'This training template will be available for all sites. Select sites if Availability should be controlled.';
const SOME_SITES = 'This training template will only be available for the selected sites.';

// --- Helpers
async function startEditor(page: Page): Promise<void> {
    await newTemplate(page).click();
    await expect(nameField(page)).toBeVisible();
}

/** Cancels the editor and discards whatever was typed. */
async function leaveEditor(page: Page): Promise<void> {
    await page.getByRole('button', { name: '← Cancel' }).click();
    const discard = page.getByText(/^discard changes$/i);
    await expect(newTemplate(page).or(discard)).toBeVisible();
    if (await discard.count()) await discard.click();
    await expect(newTemplate(page)).toBeVisible();
}

async function addTopic(page: Page, query: string): Promise<void> {
    await topicBox(page).click();
    await topicBox(page).fill(query);
    await page.getByRole('option').filter({ hasText: query }).first().click();
    await page.keyboard.press('Escape');
}

async function chooseOption(page: Page, control: Locator, option: string | RegExp): Promise<void> {
    await control.click();
    await page.getByRole('option', { name: option, exact: typeof option === 'string' }).click();
}

async function pick(page: Page, tab: string, label: string): Promise<void> {
    await page.getByText(tab, { exact: true }).last().click();
    await choice(page, label).click();
}

async function upload(page: Page, button: string | RegExp, file: string): Promise<void> {
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: button }).click();
    await (await chooser).setFiles([`${FILES}${file}`]);
}

/** Background colour of a control, read from the first painted element inside it. */
const swatch = (target: Locator) =>
    target.evaluate((e) => {
        for (const x of [e, ...Array.from(e.querySelectorAll('*'))]) {
            const c = getComputedStyle(x).backgroundColor;
            if (c !== 'rgba(0, 0, 0, 0)') return c;
        }
        return '';
    });

async function selected(page: Page): Promise<string[]> {
    return page.evaluate(() =>
        Array.from(document.querySelectorAll('main button[aria-pressed="true"]'))
            .map((b) => b.getAttribute('aria-label') ?? '')
            .filter((l) => l && !/^(Program|Manager|<20)/.test(l)),
    );
}

// --- Sections
async function editorPage(page: Page): Promise<void> {
    await test.step('A new template opens with its title, status, sections and required note', async () => {
        await startEditor(page);
        await expect(page.getByText('New training template', { exact: true }).first()).toBeVisible();
        await expect(statusSwitch(page)).toContainText('Active');
        await expect(saveButton(page)).toBeDisabled();
        await expect(main(page)).toContainText(REQUIRED_NOTE);
        for (const section of SECTIONS) await expect(page.getByText(new RegExp(`^${section.replace(/[()&]/g, '\\$&')}$`, 'i')).first()).toBeVisible();
        await expect(main(page)).toContainText('No topics selected yet');
        await expect(main(page)).toContainText('No related links yet');
        await expect(main(page)).toContainText('No documents yet');
    });
}

async function cancelling(page: Page): Promise<void> {
    await test.step('Cancel with nothing entered returns to the list with no popup', async () => {
        await page.getByRole('button', { name: '← Cancel' }).click();
        await expect(newTemplate(page)).toBeVisible();
        await expect(page.getByRole('dialog')).toHaveCount(0);
    });

    await test.step('Cancel with edits asks first, and Keep editing keeps them', async () => {
        await startEditor(page);
        await nameField(page).fill(AUTOMATION_PREFIX);
        await page.getByRole('button', { name: '← Cancel' }).click();
        await expect(dialog(page)).toContainText('Discard changes?');
        await expect(dialog(page)).toContainText('You have unsaved changes to this training template. If you leave now, they will be lost.');
        await expect(page.getByText(/^keep editing$/i)).toBeVisible();
        await expect(page.getByText(/^discard changes$/i)).toBeVisible();
        await page.getByText(/^keep editing$/i).click();
        await expect(nameField(page)).toHaveValue(AUTOMATION_PREFIX);
    });

    await test.step('Leaving through the side menu asks the same and Discard changes leaves', async () => {
        await page.getByRole('button', { name: 'Employees', exact: true }).first().click();
        await expect(dialog(page)).toContainText('You have unsaved changes to this training template. If you leave now, they will be lost.');
        await page.getByText(/^discard changes$/i).click();
        await expect(addEmployeeButton(page)).toBeVisible();
        await openTemplates(page);
    });
}

async function ceuHours(page: Page, name: string): Promise<void> {
    await test.step('Hours round to quarter steps and zero is accepted', async () => {
        await startEditor(page);
        await nameField(page).fill(name);
        await addTopic(page, '1110');
        for (const [typed, shown] of [['0.3', '0.25'], ['0.375', '0.5'], ['2.6', '2.5'], ['0.1', '0'], ['.5', '0.5'], ['9999', '9999']]) {
            await hours(page).fill(typed);
            await page.keyboard.press('Tab');
            await expect(hours(page)).toHaveValue(shown);
            await expect(saveButton(page)).toBeEnabled();
        }
        await hours(page).fill('0');
        await page.keyboard.press('Tab');
        await expect(saveButton(page)).toBeEnabled();
    });

    await test.step('Text, too large and negative hours show a message and block Save', async () => {
        const invalid: [string, string][] = [
            ['abc', 'Hours are entered in 0.25 steps, for example 0.25, 0.5 or 1.75.'],
            ['10000', "CEU hours can't be more than 9999."],
            ['9999.25', "CEU hours can't be more than 9999."],
            ['-1', "CEU hours can't be negative."],
        ];
        for (const [typed, message] of invalid) {
            await hours(page).fill(typed);
            await page.keyboard.press('Tab');
            await expect(main(page)).toContainText(message);
            await expect(saveButton(page)).toBeDisabled();
        }
        await hours(page).fill('2');
        await page.keyboard.press('Tab');
        await expect(saveButton(page)).toBeEnabled();
    });
}

async function splitting(page: Page): Promise<void> {
    await test.step('Two key areas offer Split by key area with one field each and a total', async () => {
        await expect(main(page)).not.toContainText('Split by key area');
        await addTopic(page, '2110');
        await expect(main(page)).toContainText('Split by key area');
        await page.getByText('Split by key area', { exact: false }).first().click();
        await expect(page.locator('#template-hours-1')).toHaveValue('2');
        await expect(page.locator('#template-hours-2')).toBeVisible();
        await expect(main(page)).toContainText('Total CEU hours');
        await page.locator('#template-hours-1').fill('1.5');
        await page.locator('#template-hours-2').fill('2');
        await page.keyboard.press('Tab');
        await expect(main(page)).toContainText(/Total CEU hours[^0-9]*3\.5/);
    });

    await test.step('Use a single total carries the total, and removing a topic returns to one field', async () => {
        await page.getByText('Use a single total').click();
        await expect(hours(page)).toHaveValue('3.5');
        await page.getByText('Split by key area', { exact: false }).first().click();
        await expect(page.locator('#template-hours-1')).toBeVisible();
        await page.getByRole('button', { name: /^Remove / }).last().click();
        await expect(hours(page)).toHaveValue('3.5');
        await expect(main(page)).not.toContainText('Split by key area');
        await hours(page).fill('2.5');
        await page.keyboard.press('Tab');
    });

    await test.step('The topic list shows code and name, searches both and finds nothing for a miss', async () => {
        await topicBox(page).click();
        const options = await page.getByRole('option').allInnerTexts();
        expect(options.length).toBeGreaterThan(0);
        for (const option of options.slice(0, 20)) expect(option).toMatch(/\S+\s·\s\S+/);
        await topicBox(page).fill('1110');
        await expect(page.getByRole('option').filter({ hasText: '1110' }).first()).toBeVisible();
        await topicBox(page).fill('nutrition');
        await expect(page.getByRole('option').filter({ hasText: /nutrition/i }).first()).toBeVisible();
        await topicBox(page).fill(`${AUTOMATION_PREFIX}NoSuchTopic`);
        await expect(page.getByRole('option')).toHaveCount(0);
        await topicBox(page).fill('');
        await page.keyboard.press('Escape');
    });
}

async function descriptionText(page: Page): Promise<void> {
    await test.step('The description has a placeholder and Bold and Italic formatting', async () => {
        await expect(description(page)).toHaveAttribute('data-placeholder', 'What does this training cover?');
        await description(page).click();
        await page.keyboard.type('Plain ');
        await page.getByRole('button', { name: 'Bold' }).click();
        await page.keyboard.type('bold ');
        await page.getByRole('button', { name: 'Bold' }).click();
        await page.getByRole('button', { name: 'Italic' }).click();
        await page.keyboard.type('italic');
        await expect(description(page)).toContainText('Plain bold italic');
        await expect(description(page).locator('b, strong')).toHaveText('bold ');
        await expect(description(page).locator('i, em')).toHaveText('italic');
    });
}

async function sourceAndMethod(page: Page, source: string, method: string): Promise<void> {
    const kinds = [
        { label: 'Training source', plural: 'sources', add: /Add new training source/, box: 'New training source', value: source, existing: 'usda', real: 'USDA' },
        { label: 'Training method', plural: 'methods', add: /Add new training method/, box: 'New training method', value: method, existing: 'online', real: 'Online' },
    ];
    for (const k of kinds) {
        await test.step(`${k.label}: a new entry can be added, duplicates are refused and Cancel closes the field`, async () => {
            await combo(page, k.label).click();
            await page.getByRole('option', { name: k.add }).click();
            const add = page.getByRole('button', { name: 'Add', exact: true });
            await expect(field(page, k.box)).toBeVisible();
            await expect(add).toBeDisabled();
            await field(page, k.box).fill(k.existing);
            await add.click();
            await expect(main(page)).toContainText(`"${k.real}" already exists.`);
            await field(page, k.box).fill(` ${k.real.toUpperCase()} `);
            await add.click();
            await expect(main(page)).toContainText(`"${k.real}" already exists.`);
            await page.getByRole('button', { name: 'Cancel', exact: true }).first().click();
            await expect(field(page, k.box)).toHaveCount(0);

            await combo(page, k.label).click();
            await page.getByRole('option', { name: k.add }).click();
            await field(page, k.box).fill(k.value);
            await add.click();
            await expect(toast(page, `Added "${k.value}" to training ${k.plural}`).first()).toBeVisible();
            await expect(combo(page, k.label)).toContainText(k.value);
        });
    }

    await test.step('The defaults can be picked again', async () => {
        await chooseOption(page, combo(page, 'Training source'), 'USDA');
        await chooseOption(page, combo(page, 'Training method'), 'Online');
        await expect(combo(page, 'Training source')).toContainText('USDA');
    });
}

async function linksAndDocuments(page: Page): Promise<void> {
    await test.step('A link needs a valid address, which is tidied when it is left', async () => {
        await choice(page, '+ Add link').click();
        await field(page, 'Address 1').fill('notaurl');
        await field(page, 'Label 1').click();
        await expect(main(page)).toContainText('Enter a valid web address, like https://example.org');
        await field(page, 'Address 1').fill('example.org');
        await field(page, 'Label 1').click();
        await expect(field(page, 'Address 1')).toHaveValue('https://example.org/');
        await expect(main(page)).not.toContainText('Enter a valid web address');
    });

    await test.step('A second link keeps its label and a blank row is allowed', async () => {
        await choice(page, '+ Add link').click();
        await field(page, 'Label 2').fill('Course page');
        await field(page, 'Address 2').fill('https://example.org/course');
        await choice(page, '+ Add link').click();
        await expect(field(page, 'Address 3')).toBeVisible();
    });

    await test.step('Documents accept the listed types and can be removed', async () => {
        await upload(page, /Add document/, 'photo.png');
        await expect(main(page)).toContainText('photo.png');
        await upload(page, /Add document/, 'sabih-automation-testing.txt');
        await expect(main(page)).toContainText('sabih-automation-testing.txt');
        await expect(main(page)).not.toContainText('No documents yet');
        await page.getByRole('button', { name: /^Remove (document )?photo/i }).first().click();
        await expect(main(page)).not.toContainText('photo.png');
        await expect(main(page)).toContainText('sabih-automation-testing.txt');
    });
}

async function certificateAndSites(page: Page, certificate: string): Promise<void> {
    await test.step('The certificate list offers None and the active certificates', async () => {
        await expect(main(page)).toContainText('Awards the configured certificate to all attendees of this event.');
        await combo(page, 'Certificate to issue (optional)').click();
        const options = await page.getByRole('option').allInnerTexts();
        expect(options[0].trim()).toBe('None');
        expect(options).toContain(certificate);
        await page.getByRole('option', { name: certificate, exact: true }).click();
        await expect(combo(page, 'Certificate to issue (optional)')).toContainText(certificate);
    });

    await test.step('Sites default to all, narrow to the chosen ones and Select all and Clear work', async () => {
        const sites = combo(page, 'Search sites');
        await expect(main(page)).toContainText(ALL_SITES);
        await sites.click();
        await page.getByRole('option').first().click();
        await page.keyboard.press('Escape');
        await expect(main(page)).toContainText(SOME_SITES);
        await sites.click();
        await page.getByText(/^select all$/i).first().click();
        await page.keyboard.press('Escape');
        await expect(main(page)).toContainText(ALL_SITES);
        await sites.click();
        await page.getByText(/^clear$/i).first().click();
        await page.getByRole('option').first().click();
        await page.keyboard.press('Escape');
        await expect(main(page)).toContainText(SOME_SITES);
    });
}

async function audience(page: Page): Promise<void> {
    await test.step('Mandatory adds a badge to the tile preview', async () => {
        await expect(badge(page)).toHaveCount(0);
        await page.getByText('Mandatory training', { exact: true }).first().click();
        await expect(badge(page)).toBeVisible();
    });

    await test.step('Attendee filters show a preview and clearing them shows the empty note', async () => {
        await expect(main(page)).toContainText('No attendee filters set');
        await choice(page, 'Manager').click();
        await expect(main(page)).toContainText(/Preview attendees · \d+ employees? at /);
        await choice(page, 'Program Staff').click();
        await expect(choice(page, 'Manager')).toHaveAttribute('aria-pressed', 'true');
        await choice(page, 'Program Staff').click();
        await choice(page, 'Manager').click();
        await expect(main(page)).toContainText('No attendee filters set');
        await choice(page, 'Manager').click();
    });
}

async function appearance(page: Page): Promise<void> {
    await test.step('There are ten colours and five icon tabs of eight icons', async () => {
        for (const colour of COLOURS) await expect(choice(page, colour)).toBeVisible();
        for (const [tab, icons] of Object.entries(ICON_TABS)) {
            await page.getByText(tab, { exact: true }).last().click();
            for (const icon of icons) await expect(choice(page, icon)).toBeVisible();
        }
    });

    await test.step('A colour and an icon can be picked', async () => {
        await choice(page, 'Gold').click();
        await pick(page, 'Safety', 'Handwashing & sanitation');
        await expect(choice(page, 'Gold')).toHaveAttribute('aria-pressed', 'true');
        await expect(choice(page, 'Handwashing & sanitation')).toHaveAttribute('aria-pressed', 'true');
    });

    await test.step('An uploaded image replaces the icons and has fit and border options', async () => {
        await upload(page, /Upload image/, 'photo.png');
        await expect(main(page)).toContainText('Your uploaded image takes the place of the icon on the tile.');
        await expect(choice(page, 'Handwashing & sanitation')).toHaveCount(0);
        await expect(page.getByText('Fill', { exact: true })).toBeVisible();
        await expect(page.getByText('Maintain aspect ratio')).toBeVisible();
        await expect(page.locator('label').filter({ hasText: 'Add border' }).locator('input')).toBeChecked();
        const fit = () => main(page).locator('img').first().evaluate((e) => getComputedStyle(e).objectFit);
        await page.getByText('Maintain aspect ratio').click();
        await expect.poll(fit).toBe('contain');
        await page.getByText('Fill', { exact: true }).click();
        await expect.poll(fit).toBe('cover');
        await upload(page, /Upload image/, 'sabih-automation-testing.txt');
        await expect(main(page)).toContainText('Choose a JPG, PNG, GIF or WebP image.');
        await page.getByRole('button', { name: /Remove image/ }).click();
        await expect(choice(page, 'Handwashing & sanitation')).toBeVisible();
        await expect(choice(page, 'Handwashing & sanitation')).toHaveAttribute('aria-pressed', 'true');
    });
}

async function defaultLook(page: Page): Promise<void> {
    await test.step('A new template starts with the training icon in purple', async () => {
        await startEditor(page);
        expect((await selected(page)).sort()).toEqual(['General training', 'Purple']);
    });

    for (const [code, colour, icon] of [
        ['1110', 'Green', 'Nutrition'],
        ['2110', 'Blue', 'Kitchen skills'],
        ['3110', 'Purple', 'Audits & monitoring'],
        ['4110', 'Purple', 'General training'],
    ]) {
        await test.step(`The first topic ${code} sets the default colour and icon`, async () => {
            await leaveEditor(page);
            await startEditor(page);
            await addTopic(page, code);
            await expect.poll(async () => (await selected(page)).sort()).toEqual([colour, icon].sort());
        });
    }

    await test.step('A colour picked by hand is kept when the topic changes', async () => {
        await choice(page, 'Gold').click();
        await page.getByRole('button', { name: /^Remove / }).last().click();
        await addTopic(page, '1110');
        await expect(choice(page, 'Gold')).toHaveAttribute('aria-pressed', 'true');
        await leaveEditor(page);
    });
}

async function savingAndReopening(page: Page, o: { name: string; certificate: string }): Promise<void> {
    await test.step('Save returns to the list with a toast and the tile look', async () => {
        await saveButton(page).click();
        await expect(toast(page, `"${o.name}" saved`).first()).toBeVisible();
        await expect(openIcon(page, o.name)).toBeVisible();
        const tile = page.getByRole('row').filter({ has: openIcon(page, o.name) }).locator('td').first();
        await expect(tile).toBeVisible();
        const tileColour = await swatch(tile);
        await openIcon(page, o.name).click();
        await expect(nameField(page)).toHaveValue(o.name);
        expect(await swatch(choice(page, 'Gold'))).toBe(tileColour);
    });

    await test.step('Reopening shows every saved value', async () => {
        await expect(page.getByText('Edit training template', { exact: true }).first()).toBeVisible();
        await expect(page.getByRole('button', { name: 'History' })).toBeVisible();
        await expect(hours(page)).toHaveValue('2.5');
        await expect(description(page)).toContainText('Plain bold italic');
        await expect(description(page).locator('b, strong')).toHaveText('bold ');
        await expect(combo(page, 'Training source')).toContainText('USDA');
        await expect(combo(page, 'Training method')).toContainText('Online');
        await expect(combo(page, 'Certificate to issue (optional)')).toContainText(o.certificate);
        await expect(field(page, 'Address 1')).toHaveValue('https://example.org/');
        await expect(field(page, 'Label 1')).toHaveValue('https://example.org/');
        await expect(field(page, 'Label 2')).toHaveValue('Course page');
        await expect(field(page, 'Address 3')).toHaveCount(0);
        await expect(main(page)).toContainText('sabih-automation-testing.txt');
        await expect(main(page)).toContainText(SOME_SITES);
        await expect(choice(page, 'Manager')).toHaveAttribute('aria-pressed', 'true');
        await expect(choice(page, 'Gold')).toHaveAttribute('aria-pressed', 'true');
        await expect(choice(page, 'Handwashing & sanitation')).toHaveAttribute('aria-pressed', 'true');
        await expect(badge(page)).toBeVisible();
        await expect(page.getByText('Unsaved changes')).toHaveCount(0);
    });
}

async function inactiveItems(
    page: Page,
    o: { name: string; certificate: string; topic: string; subTopic: string },
): Promise<void> {
    await test.step('Inactive items are marked and a sub-topic does not stop a save', async () => {
        await setCertificateStatus(page, o.certificate, 'Inactive');
        await setSourceAndMethodStatus(page, 'Inactive');
        await setSubTopicStatus(page, o.topic, o.subTopic, 'Inactive');
        await openTemplates(page);
        await openIcon(page, o.name).click();
        await expect(nameField(page)).toHaveValue(o.name);
        await expect(combo(page, 'Certificate to issue (optional)')).toContainText(`${o.certificate} (inactive)`);
        await expect(combo(page, 'Training source')).toContainText('USDA (inactive)');
        await expect(combo(page, 'Training method')).toContainText('Online (inactive)');
        await expect(main(page)).toContainText('One or more sub-topics are inactive in the catalog. You can still save.');
    });

    await test.step('An inactive certificate blocks Save until it is changed', async () => {
        await expect(main(page)).toContainText('Please select an active certificate, or None, before saving.');
        await expect(saveButton(page)).toBeDisabled();
        await chooseOption(page, combo(page, 'Certificate to issue (optional)'), 'None');
        await expect(saveButton(page)).toBeEnabled();
        await topicBox(page).fill(o.subTopic);
        await expect(page.getByRole('option').filter({ hasText: o.subTopic })).toHaveCount(0);
        await topicBox(page).fill('');
        await page.keyboard.press('Escape');
        await saveButton(page).click();
        await expect(toast(page, `"${o.name}" saved`).first()).toBeVisible();
    });
}

async function statusAndHistory(page: Page, name: string): Promise<void> {
    await test.step('The status pill is saved with the template', async () => {
        await openIcon(page, name).click();
        await expect(nameField(page)).toHaveValue(name);
        await expect(statusSwitch(page)).toContainText('Active');
        await statusSwitch(page).click();
        await expect(statusSwitch(page)).toContainText('Inactive');
        await saveButton(page).click();
        await expect(toast(page, `"${name}" saved`).first()).toBeVisible();
        await expect(listSwitch(page, name)).not.toBeChecked();
    });

    await test.step('The editor history lists the template being added and saved', async () => {
        await openIcon(page, name).click();
        await expect(nameField(page)).toHaveValue(name);
        await page.getByRole('button', { name: 'History' }).click();
        const panel = page.getByRole('dialog').last();
        await expect(panel.getByText('Training template added', { exact: true }).first()).toBeVisible();
        await expect(panel.getByText('Training template saved', { exact: true }).first()).toBeVisible();
        await closeHistory(page);
        await leaveEditor(page);
    });
}

// --- Test
test('T-77402 Training Template editor', async ({ page }) => {
    test.setTimeout(900000);
    await loginToSchoolCafe2(page);

    const [name, topic, subTopic, source, method] = automationNames(5);
    let passed = false;
    try {
        await cleanUp(page);
        await addTopicWithSubTopic(page, topic, subTopic);
        const certificate = await createCertificate(page);
        await openTemplates(page);

        await test.step('Editor page', () => editorPage(page));
        await test.step('Cancelling', () => cancelling(page));
        await test.step('CEU hours', () => ceuHours(page, name));
        await test.step('Topics and splitting hours', () => splitting(page));
        await test.step('Description', () => descriptionText(page));
        await test.step('Source and method', () => sourceAndMethod(page, source, method));
        await test.step('Links and documents', () => linksAndDocuments(page));
        await test.step('Certificate and sites', () => certificateAndSites(page, certificate));
        await test.step('Mandatory and attendee filters', () => audience(page));
        await test.step('Colour, icon and image', () => appearance(page));
        await test.step('Saving and reopening', () => savingAndReopening(page, { name, certificate }));
        await test.step('Inactive items', async () => {
            await leaveEditor(page);
            await addSubTopicToTemplate(page, name, subTopic);
            await inactiveItems(page, { name, certificate, topic, subTopic });
        });
        await test.step('Status and history', () => statusAndHistory(page, name));
        await test.step('Default colour and icon', async () => {
            await openTemplates(page);
            await defaultLook(page);
        });
        passed = true;
    } finally {
        // a failed run keeps its own error instead of the cleanup's
        await cleanUp(page).catch((error) => {
            if (passed) throw error;
        });
    }
});

/** Adds the sub-topic to an existing template so it can later be made inactive under it. */
async function addSubTopicToTemplate(page: Page, name: string, subTopic: string): Promise<void> {
    await openTemplates(page);
    await openIcon(page, name).click();
    await expect(nameField(page)).toHaveValue(name);
    await addTopic(page, subTopic);
    await saveButton(page).click();
    await expect(toast(page, `"${name}" saved`).first()).toBeVisible();
}
