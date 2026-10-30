// Professional Standards - shared Training Templates helpers

import { expect, Locator, Page } from '@playwright/test';
import {
    answerConfirmation,
    AUTOMATION_PREFIX,
    dialog,
    openProfessionalStandardsPage,
    toast,
    trainingListSection,
} from './professionalStandards';

// --- Locators
export const newTemplate = (page: Page) => page.getByRole('button', { name: 'New training template' });
export const search = (page: Page) => page.getByPlaceholder('Search by template name');
export const advancedButton = (page: Page) => page.getByRole('button', { name: /^Advanced search/ });
export const closePanel = (page: Page) => page.getByRole('button', { name: 'Close advanced search' });
export const dropdown = (page: Page, name: string) => page.getByRole('combobox', { name });

export const openIcon = (page: Page, name: string) => page.getByRole('button', { name: `Open ${name}`, exact: true });
export const nameField = (page: Page) => page.getByPlaceholder('e.g. Back of the house training');

export const clearFilters = (page: Page) => page.getByText('Clear filters', { exact: true }).first();

export const topicStatus = (page: Page, name: string) => page.getByRole('switch', { name: `${name} Status`, exact: true });

export interface TemplateOptions {
    name: string;
    hours: number;
    topic: string;
    mandatory?: boolean;
    certificate?: string;
    source?: string;
    method?: string;
    sites?: string[];
}

export async function openTemplates(page: Page): Promise<void> {
    await openProfessionalStandardsPage(page, 'Training Templates', newTemplate(page));
    await expect(search(page)).toBeVisible();
    await expect(page.getByText('Loading training templates...')).toHaveCount(0);
}

export async function chooseFrom(page: Page, control: Locator, option: string): Promise<void> {
    await control.click();
    await page.getByRole('option', { name: option, exact: true }).click();
}

export async function createTemplate(page: Page, o: TemplateOptions): Promise<void> {
    await newTemplate(page).click();
    await expect(nameField(page)).toBeVisible();
    await nameField(page).fill(o.name);
    await page.locator('#template-hours').fill(String(o.hours));
    const topic = page.getByRole('combobox', { name: /Add a topic or sub-topic/ });
    await topic.click();
    await topic.fill(o.topic);
    await page.getByRole('option').filter({ hasText: o.topic }).first().click();
    await page.keyboard.press('Escape');
    if (o.mandatory) await page.getByText('Mandatory training', { exact: true }).first().click();
    if (o.certificate) await chooseFrom(page, page.getByRole('combobox', { name: 'Certificate to issue (optional)' }), o.certificate);
    if (o.source) await chooseFrom(page, page.getByRole('combobox', { name: 'Training source' }), o.source);
    if (o.method) await chooseFrom(page, page.getByRole('combobox', { name: 'Training method' }), o.method);
    for (const site of o.sites ?? []) {
        const sites = page.getByRole('combobox', { name: 'Search sites' });
        await sites.click();
        await sites.fill(site);
        await page.getByRole('option').first().click();
        await page.keyboard.press('Escape');
    }
    await page.getByRole('button', { name: 'Save training template' }).click();
    await expect(toast(page, `"${o.name}" saved`).first()).toBeVisible();
    await expect(openIcon(page, o.name)).toBeVisible();
}

/** Reads the names of the first sites in the editor's site picker, so no site name is baked into the test. */
export async function firstSites(page: Page, count: number): Promise<string[]> {
    await newTemplate(page).click();
    await expect(nameField(page)).toBeVisible();
    const sites = page.getByRole('combobox', { name: 'Search sites' });
    await sites.click();
    const options = await page.getByRole('option').allInnerTexts();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '← Cancel' }).click();
    await expect(newTemplate(page)).toBeVisible();
    return options.slice(0, count).map((o) => o.trim());
}

export const siteName = (option: string) => option.replace(/^\S+\s+-\s+/, '');

export async function resetFilters(page: Page): Promise<void> {
    if (await clearFilters(page).count()) await clearFilters(page).click();
    await expect(clearFilters(page)).toHaveCount(0);
}

/** Switches an item on one of the configuration pages and answers the confirmation when one shows. */
export async function flip(page: Page, pill: Locator): Promise<void> {
    await pill.click();
    const confirm = page.getByRole('dialog');
    await expect(confirm.or(page.getByRole('alert')).first()).toBeVisible();
    if (await confirm.count()) await answerConfirmation(page, 'Yes');
}

export async function setCertificateStatus(page: Page, certificate: string, status: 'Active' | 'Inactive'): Promise<void> {
    await openProfessionalStandardsPage(page, 'Certificates', page.getByRole('button', { name: 'Add certificate' }));
    const pill = page.getByRole('switch', { name: `${certificate} Status`, exact: true });
    if ((await pill.innerText()).trim() !== status) await flip(page, pill);
    await expect(pill).toHaveText(status);
}

/** Sets the USDA source and the Online method, both defaults, active or inactive and saves. */
export async function setSourceAndMethodStatus(page: Page, status: 'Active' | 'Inactive'): Promise<void> {
    await openProfessionalStandardsPage(page, 'Training Sources and Methods', page.getByText('Training Sources & Methods', { exact: true }));
    for (const [kind, name] of [['source', 'USDA'], ['method', 'Online']] as const) {
        const list = trainingListSection(page, kind);
        await list.getByRole('combobox', { name: 'Status' }).click();
        await page.getByRole('option', { name: 'All', exact: true }).click();
        const toggle = list.getByRole('button', { name: /^(Show|Hide) defaults$/ }).first();
        if ((await toggle.getAttribute('aria-label')) === 'Show defaults') await toggle.click();
        const pill = list.getByRole('switch', { name: `${name} Status`, exact: true });
        if ((await pill.innerText()).trim() !== status) await pill.click();
    }
    const save = page.getByRole('button', { name: 'Save', exact: true });
    if (await save.count()) {
        await save.click();
        await expect(toast(page, 'Training sources and methods saved').first()).toBeVisible();
    }
}

export async function openTopics(page: Page): Promise<void> {
    await openProfessionalStandardsPage(page, 'Topics & Sub Topics', page.getByText('Nutrition', { exact: true }));
}

export async function expandTopic(page: Page, topic: string): Promise<void> {
    const expand = page.getByRole('button', { name: `Expand ${topic}`, exact: true });
    if (await expand.count()) await expand.click();
}

export async function addTopicWithSubTopic(page: Page, topic: string, subTopic: string): Promise<void> {
    await openTopics(page);
    await page.getByRole('button', { name: 'Add topic' }).click();
    await page.getByRole('textbox', { name: 'Topic name', exact: true }).last().fill(topic);
    await page.keyboard.press('Tab');
    await expect(toast(page, 'Topic added').first()).toBeVisible();
    await expandTopic(page, topic);
    await page.getByText('Add sub-topic', { exact: false }).last().click();
    await page.getByRole('textbox', { name: 'Sub-topic name', exact: true }).last().fill(subTopic);
    await page.keyboard.press('Enter');
    await expect(toast(page, 'Sub-topic added').first()).toBeVisible();
}

export async function setSubTopicStatus(page: Page, topic: string, subTopic: string, status: 'Active' | 'Inactive'): Promise<void> {
    await openTopics(page);
    await expandTopic(page, topic);
    const pill = topicStatus(page, subTopic);
    if ((await pill.innerText()).trim() !== status) await flip(page, pill);
    await expect(toast(page, /./).first()).toBeVisible();
}

/** Removes every test topic, sub-topics first, from this or an earlier run. */
export async function removeTestTopics(page: Page): Promise<void> {
    await openTopics(page);
    const topics = page.getByRole('button', { name: new RegExp(`^Expand ${AUTOMATION_PREFIX}`) });
    for (let guard = 0; guard < 10 && (await topics.count()); guard++) await topics.first().click();
    const items = page.getByRole('button', { name: new RegExp(`^Delete ${AUTOMATION_PREFIX}`) });
    for (let guard = 0; guard < 20 && (await items.count()); guard++) {
        const before = await items.count();
        await items.last().click();
        await answerConfirmation(page, 'Yes');
        await expect(items).toHaveCount(before - 1);
    }
}

/** Removes every test certificate nobody holds, from this or an earlier run. */
export async function removeTestCertificates(page: Page): Promise<void> {
    await openProfessionalStandardsPage(page, 'Certificates', page.getByRole('button', { name: 'Add certificate' }));
    const icons = page.getByRole('button', { name: new RegExp(`^Delete ${AUTOMATION_PREFIX}`) });
    for (let guard = 0; guard < 10 && (await icons.count()); guard++) {
        const before = await icons.count();
        await icons.first().click();
        await answerConfirmation(page, 'Yes');
        await expect(icons).toHaveCount(before - 1);
    }
}

/** Removes every custom training source and method a run added, from this or an earlier run. */
export async function removeTestSourcesAndMethods(page: Page): Promise<void> {
    await openProfessionalStandardsPage(page, 'Training Sources and Methods', page.getByText('Training Sources & Methods', { exact: true }));
    for (const kind of ['source', 'method'] as const) {
        const list = trainingListSection(page, kind);
        await list.getByRole('combobox', { name: 'Status' }).click();
        await page.getByRole('option', { name: 'All', exact: true }).click();
        const icons = list.getByRole('button', { name: new RegExp(`^Delete ${AUTOMATION_PREFIX}`) });
        for (let guard = 0; guard < 10 && (await icons.count()); guard++) {
            const before = await icons.count();
            await icons.first().click();
            await expect(icons).toHaveCount(before - 1);
        }
    }
    const save = page.getByRole('button', { name: 'Save', exact: true });
    if (await save.count()) {
        await save.click();
        await expect(toast(page, 'Training sources and methods saved').first()).toBeVisible();
    }
}

/** Puts back whatever a run made inactive, then deletes its templates, topics and certificates. */
export async function cleanUp(page: Page): Promise<void> {
    await page.keyboard.press('Escape').catch(() => undefined);
    await setSourceAndMethodStatus(page, 'Active');
    await removeTestSourcesAndMethods(page);
    await openTemplates(page);
    await resetFilters(page);
    await search(page).fill(AUTOMATION_PREFIX);
    for (let guard = 0; guard < 20; guard++) {
        const left = page.getByRole('button', { name: new RegExp(`^Delete ${AUTOMATION_PREFIX}`) });
        const before = await left.count();
        if (!before) break;
        await left.first().click();
        await dialog(page).getByText(/yes, delete/i).click();
        await expect(left).toHaveCount(before - 1);
    }
    await removeTestTopics(page);
    await removeTestCertificates(page);
}
