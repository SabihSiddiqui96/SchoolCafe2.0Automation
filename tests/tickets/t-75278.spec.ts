// Professional Standards - Configuration - Topics & Sub Topics

import { test, expect, Locator, Page } from '@playwright/test';
import {
    answerConfirmation,
    clickWhenSettled,
    closeHistory,
    dialog,
    loginToSchoolCafe2,
    openHistory,
    openProfessionalStandardsPage,
    toast,
    uniqueName,
    waitForPageReady,
} from '../../utils/professionalStandards';

// --- Locators
const DEFAULT_TOPICS = [
    '1000 Nutrition',
    '2000 Operations',
    '3000 Administration',
    '4000 Communications and Marketing',
];
const SEARCH = (page: Page) => page.getByPlaceholder('Search sub-topics or LO codes');
const STATUS_FILTER = (page: Page) => page.getByRole('combobox').filter({ hasText: /^(All topics|Active only|Inactive only)$/ });
const button = (page: Page, name: string | RegExp) => page.getByRole('button', { name });
const topicInput = (page: Page, name: string) => rowInput(page, name, 'Topic name');
const subTopicInput = (page: Page, name: string) => rowInput(page, name, 'Sub-topic name');
const statusPill = (page: Page, name: string) => page.getByRole('button', { name: `${name} Status`, exact: true });
const deleteIcon = (page: Page, name: string) => page.getByRole('button', { name: `Delete ${name}`, exact: true });
const loPill = (page: Page, name: string) => page.getByLabel(new RegExp(`^LO code for ${name}: `));

// --- Helpers
/** The name field sitting in the same row as that item's delete icon. */
function rowInput(page: Page, name: string, label: string) {
    return deleteIcon(page, name)
        .locator(`xpath=ancestor::*[.//input[@aria-label='${label}']][1]`)
        .getByRole('textbox', { name: label });
}

async function openTopics(page: Page): Promise<void> {
    await loginToSchoolCafe2(page);
    await openProfessionalStandardsPage(page, 'Topics & Sub Topics', page.getByText('Nutrition', { exact: true }));
}

async function chooseStatusFilter(page: Page, option: string): Promise<void> {
    await STATUS_FILTER(page).click();
    await page.getByRole('option', { name: option, exact: true }).click();
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await page.waitForLoadState('networkidle');
}

/** Opens the LO code picker for a sub-topic, re-expanding its topic if the row moved. */
async function openLoPicker(page: Page, subTopic: string, topic: string): Promise<void> {
    if (!(await loPill(page, subTopic).count())) {
        const expand = page.getByRole('button', { name: `Expand ${topic}`, exact: true });
        if (await expand.count()) await expand.click();
    }
    await loPill(page, subTopic).click();
    await expect(page.getByRole('menuitem').first()).toBeVisible();
}

async function addTopic(page: Page, name: string): Promise<void> {
    await button(page, 'Add topic').click();
    await page.getByRole('textbox', { name: 'Topic name', exact: true }).last().fill(name);
    await page.keyboard.press('Tab');
    await expect(toast(page, 'Topic added').first()).toBeVisible();
    await expect(deleteIcon(page, name)).toBeVisible();
}

async function addSubTopic(page: Page, name: string): Promise<void> {
    await page.getByText('Add sub-topic', { exact: false }).last().click();
    await page.getByRole('textbox', { name: 'Sub-topic name', exact: true }).last().fill(name);
    await page.keyboard.press('Enter');
    await expect(toast(page, 'Sub-topic added').first()).toBeVisible();
    await expect(deleteIcon(page, name)).toBeVisible();
}

async function removeItem(page: Page, name: string): Promise<void> {
    const confirm = page.getByRole('dialog').filter({ hasText: `delete "${name}"` });
    await expect(async () => {
        if (!(await confirm.count())) await deleteIcon(page, name).click();
        await expect(confirm).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 20000 });
    await expect(confirm).toContainText(`Are you sure you want to delete "${name}"? This action cannot be undone.`);
    await answerConfirmation(page, 'Yes');
    await expect(deleteIcon(page, name)).toHaveCount(0);
}

/** Removes every test topic (and its sub-topics) left on the page, from this or earlier runs. */
async function removeStaleTopics(page: Page): Promise<void> {
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.reload();
    await waitForPageReady(page, page.getByText('Nutrition', { exact: true }));
    await page.waitForLoadState('networkidle');
    const staleTopics = page.getByRole('button', { name: /^Delete QA (Topic|Status) / });
    const staleSubTopics = page.getByRole('button', { name: /^Delete QA (Sub|Status Sub) / });
    const nameOf = async (item: Locator) => ((await item.first().getAttribute('aria-label')) ?? '').replace(/^Delete /, '');
    for (let guard = 0; guard < 40 && (await staleTopics.count()); guard++) {
        const topic = await nameOf(staleTopics);
        const expand = page.getByRole('button', { name: `Expand ${topic}`, exact: true });
        if (await expand.count()) await expand.click();
        while (await staleSubTopics.count()) await removeItem(page, await nameOf(staleSubTopics));
        await removeItem(page, topic);
    }
}

// --- Sections
async function pageDefaultsAndFilters(page: Page): Promise<void> {
    await loginToSchoolCafe2(page);

    await test.step('Topics & Sub Topics is second under Configuration', async () => {
        await page.locator('nav div[title="Professional Standards"]').first().click();
        const y = async (name: string) => (await button(page, name).first().boundingBox())!.y;
        const ceu = await y('CEU Levels');
        const topics = await y('Topics & Sub Topics');
        const sites = await y('Sites & Locations');
        expect(ceu).toBeLessThan(topics);
        expect(topics).toBeLessThan(sites);
        await button(page, 'Topics & Sub Topics').first().click();
        await waitForPageReady(page, page.getByText('Nutrition', { exact: true }));
    });

    await test.step('Controls are present', async () => {
        await expect(button(page, 'History')).toBeVisible();
        await expect(SEARCH(page)).toBeVisible();
        await expect(STATUS_FILTER(page)).toBeVisible();
        await expect(button(page, 'Hide defaults')).toBeVisible();
    });

    await test.step('Four default topics carry a Default badge', async () => {
        for (const topic of DEFAULT_TOPICS) {
            const [code, ...name] = topic.split(' ');
            await expect(page.getByText(code, { exact: true }).first()).toBeVisible();
            await expect(page.getByText(name.join(' '), { exact: true }).first()).toBeVisible();
        }
        await expect(page.getByText('Default', { exact: true })).toHaveCount(DEFAULT_TOPICS.length);
    });

    await test.step('A default topic expands to locked sub-topics with LO codes', async () => {
        await button(page, 'Expand Nutrition').click();
        await expect(page.getByText('Menu Planning', { exact: true })).toBeVisible();
        await expect(page.getByText('Reimbursable Meal Menu Requirements', { exact: true })).toBeVisible();
        await expect(page.getByText('1110', { exact: true })).toBeVisible();
        await expect(page.getByLabel("USDA default, can't be changed").first()).toBeVisible();
        await expect(page.getByLabel(/^LO code for Menu Planning: /)).toHaveAttribute('aria-disabled', 'true');
    });

    await test.step('Defaults have no delete, status or add sub-topic controls', async () => {
        await expect(deleteIcon(page, 'Nutrition')).toHaveCount(0);
        await expect(statusPill(page, 'Nutrition')).toHaveCount(0);
        await expect(deleteIcon(page, 'Menu Planning')).toHaveCount(0);
        await expect(page.getByText('Add sub-topic', { exact: false })).toHaveCount(0);
    });

    await test.step('Search matches sub-topic names and LO codes, ignoring case', async () => {
        await SEARCH(page).fill('1110');
        await expect(page.getByText('Reimbursable Meal Menu Requirements')).toBeVisible();
        await expect(page.getByText('Cycle Menu Planning')).toHaveCount(0);
        await SEARCH(page).fill('special diet');
        await expect(page.getByText('Special Diet & Food Allergy Menu Planning')).toBeVisible();
        await SEARCH(page).fill('zzzz');
        await expect(page.getByText('No matches')).toBeVisible();
        await SEARCH(page).fill('');
        await expect(page.getByText('Operations', { exact: true })).toBeVisible();
    });

    await test.step('Hide defaults flips to Show all and back', async () => {
        await button(page, 'Hide defaults').click();
        await expect(page.getByText('Operations', { exact: true })).toHaveCount(0);
        await SEARCH(page).fill('1110');
        await expect(page.getByText('No matches')).toBeVisible();
        await SEARCH(page).fill('');
        await button(page, 'Show all').click();
        await expect(page.getByText('Operations', { exact: true })).toBeVisible();
    });

    await test.step('Status offers all, active and inactive', async () => {
        await STATUS_FILTER(page).click();
        await expect(page.getByRole('option')).toHaveText(['All topics', 'Active only', 'Inactive only']);
        await page.keyboard.press('Escape');
    });
}

async function addRenameAndLoCodes(page: Page): Promise<void> {
    await removeStaleTopics(page);
    const topic = uniqueName('QA Topic');
    const renamed = `${topic} B`;
    const sub = uniqueName('QA Sub');
    const subRenamed = `${sub} B`;

    try {
        const topicFields = page.getByRole('textbox', { name: 'Topic name', exact: true });
        const existingTopics = await topicFields.count();

        await test.step('A blank topic can be cancelled with the x', async () => {
            await button(page, 'Add topic').click();
            await expect(topicFields).toHaveCount(existingTopics + 1);
            await expect(button(page, 'Add topic')).toBeDisabled();
            await button(page, 'Cancel').click();
            await expect(topicFields).toHaveCount(existingTopics);
        });

        await test.step('A blank topic is removed by clicking away', async () => {
            await button(page, 'Add topic').click();
            await expect(topicFields).toHaveCount(existingTopics + 1);
            await page.locator('h1').first().click();
            await expect(topicFields).toHaveCount(existingTopics);
        });

        await test.step('A named topic becomes real with delete and status controls', async () => {
            await addTopic(page, topic);
            await expect(statusPill(page, topic)).toHaveText('Active');
        });

        await test.step('A custom topic can be renamed', async () => {
            await page.getByRole('textbox', { name: 'Topic name', exact: true }).last().fill(renamed);
            await page.keyboard.press('Tab');
            await expect(toast(page, 'Topic renamed').first()).toBeVisible();
            await expect(deleteIcon(page, renamed)).toBeVisible();
        });

        await test.step('A sub-topic starts blank and can be cancelled', async () => {
            await page.getByRole('button', { name: `Expand ${renamed}`, exact: true }).click();
            await page.getByText('Add sub-topic', { exact: false }).last().click();
            await expect(page.getByRole('textbox', { name: 'Sub-topic name', exact: true })).toBeVisible();
            await button(page, 'Cancel').click();
            await expect(page.getByRole('textbox', { name: 'Sub-topic name', exact: true })).toHaveCount(0);
            await page.getByText('Add sub-topic', { exact: false }).last().click();
            await page.locator('h1').first().click();
            await expect(page.getByRole('textbox', { name: 'Sub-topic name', exact: true })).toHaveCount(0);
        });

        await test.step('A named sub-topic shows Set code, status and delete', async () => {
            await addSubTopic(page, sub);
            await expect(statusPill(page, sub)).toHaveText('Active');
            await expect(loPill(page, sub)).toHaveText('Set code');
        });

        await test.step('A sub-topic can be renamed', async () => {
            await page.getByRole('textbox', { name: 'Sub-topic name', exact: true }).last().fill(subRenamed);
            await page.keyboard.press('Tab');
            await expect(toast(page, 'Sub-topic updated').first()).toBeVisible();
        });

        await test.step('The LO picker lists N/A and every code, and keeps the choice', async () => {
            const options = page.getByRole('menuitem');
            await openLoPicker(page, subRenamed, renamed);
            await expect(options.first()).toHaveText('N/A');
            await expect(options.filter({ hasText: '1000 Nutrition' })).toHaveCount(1);
            await expect(options.filter({ hasText: '4160 Smarter Lunchrooms & Reduced Food Waste' })).toHaveCount(1);
            await options.filter({ hasText: '1110 Reimbursable Meal Menu Requirements' }).click();
            await expect(loPill(page, subRenamed)).toHaveText('1110');

            await openLoPicker(page, subRenamed, renamed);
            await expect(page.locator('[role=menuitem].Mui-selected')).toHaveText('1110 Reimbursable Meal Menu Requirements');
            await page.getByRole('menuitem', { name: 'N/A', exact: true }).click();
            await expect(loPill(page, subRenamed)).toHaveText('N/A');
        });

        await test.step('Search finds the custom topic by its sub-topic name', async () => {
            await SEARCH(page).fill(subRenamed.toLowerCase());
            await expect(page.getByRole('textbox', { name: 'Topic name', exact: true })).toHaveCount(1);
            await expect(deleteIcon(page, subRenamed)).toBeVisible();
            await SEARCH(page).fill('');
        });
    } finally {
        await removeStaleTopics(page);
    }
}

async function statusDeleteAndHistory(page: Page): Promise<void> {
    await removeStaleTopics(page);
    const topic = uniqueName('QA Status');
    const sub = uniqueName('QA Status Sub');

    try {
        await addTopic(page, topic);
        await page.getByRole('button', { name: `Expand ${topic}`, exact: true }).click();
        await addSubTopic(page, sub);

        await test.step('Turning a topic off asks, then turns its sub-topics off too', async () => {
            await clickWhenSettled(statusPill(page, topic));
            await expect(dialog(page)).toContainText(
                `Are you sure you want to make "${topic}" inactive? Its sub-topics will be turned off too.`,
            );
            await answerConfirmation(page, 'Yes');
            await expect(toast(page, 'Topic and its sub-topics deactivated').first()).toBeVisible();
            await expect(statusPill(page, topic)).toHaveText('Inactive');
            await expect(page.getByText('Paused with topic')).toBeVisible();
            await expect(page.getByText('Add sub-topic', { exact: false })).toHaveCount(0);
            await expect(subTopicInput(page, sub)).toHaveCount(0);
        });

        await test.step('An inactive topic can still be renamed', async () => {
            await topicInput(page, topic).fill(`${topic} B`);
            await page.keyboard.press('Tab');
            await expect(toast(page, 'Topic renamed').first()).toBeVisible();
            await topicInput(page, `${topic} B`).fill(topic);
            await page.keyboard.press('Tab');
            await expect(deleteIcon(page, topic)).toBeVisible();
        });

        await test.step('Status filter shows and hides the inactive topic', async () => {
            await chooseStatusFilter(page, 'Active only');
            await expect(deleteIcon(page, topic)).toHaveCount(0);
            await chooseStatusFilter(page, 'Inactive only');
            await expect(deleteIcon(page, topic)).toBeVisible();
            await chooseStatusFilter(page, 'All topics');
        });

        await test.step('Turning a topic back on offers just the topic or everything', async () => {
            await clickWhenSettled(statusPill(page, topic));
            await expect(dialog(page)).toContainText(`Restore just "${topic}", or the topic and all of its sub-topics?`);
            await expect(button(page, 'Cancel')).toBeVisible();
            await expect(button(page, 'Topic and all sub-topics')).toBeVisible();
            await button(page, 'Just the topic').click();
            await expect(toast(page, 'Topic activated').first()).toBeVisible();
            await expect(statusPill(page, topic)).toHaveText('Active');
            await expect(statusPill(page, sub)).toHaveText('Inactive');
        });

        await test.step('Restoring the topic and all sub-topics turns both on', async () => {
            await clickWhenSettled(statusPill(page, topic));
            await answerConfirmation(page, 'Yes');
            await expect(statusPill(page, topic)).toHaveText('Inactive');
            await clickWhenSettled(statusPill(page, topic));
            await button(page, 'Topic and all sub-topics').click();
            await expect(statusPill(page, topic)).toHaveText('Active');
            await expect(statusPill(page, sub)).toHaveText('Active');
        });

        await test.step('A sub-topic is switched on and off right away', async () => {
            await clickWhenSettled(statusPill(page, sub));
            await expect(toast(page, 'Sub-topic deactivated').first()).toBeVisible();
            await expect(statusPill(page, sub)).toHaveText('Inactive');
            await clickWhenSettled(statusPill(page, sub));
            await expect(toast(page, 'Sub-topic activated').first()).toBeVisible();
            await expect(statusPill(page, sub)).toHaveText('Active');
        });

        await test.step('Hide defaults keeps custom topics', async () => {
            await button(page, 'Hide defaults').click();
            await expect(deleteIcon(page, topic)).toBeVisible();
            await SEARCH(page).fill('1110');
            await expect(page.getByText('No matches')).toBeVisible();
            await SEARCH(page).fill('');
            await button(page, 'Show all').click();
        });

        await test.step('Delete asks first and No keeps the sub-topic', async () => {
            await deleteIcon(page, sub).click();
            await expect(dialog(page)).toContainText(`Are you sure you want to delete "${sub}"? This action cannot be undone.`);
            await answerConfirmation(page, 'No');
            await expect(deleteIcon(page, sub)).toBeVisible();
        });

        await removeItem(page, sub);
        await removeItem(page, topic);

        await test.step('History records who, what and when', async () => {
            const history = await openHistory(page);
            await expect(history).toContainText('Performed By');
            for (const action of ['Topic added', 'Sub-topic added', 'Topic deactivated with its sub-topics', 'Topic activated', 'Sub-topic deactivated', 'Sub-topic activated', 'Sub-topic deleted', 'Topic deleted']) {
                await expect(history.getByText(action, { exact: true }).first()).toBeVisible();
            }
            await history.getByText('Topic deleted', { exact: true }).first().click();
            await expect(history).toContainText('Changed Value(s)');
            await expect(history).toContainText(topic);
            await closeHistory(page);
        });
    } finally {
        await removeStaleTopics(page);
    }
}

// --- Test
test('T-75278 Topics & Sub Topics', async ({ page }) => {
    test.setTimeout(600000);

    await test.step('Page, default topics, search and filters', () => pageDefaultsAndFilters(page));
    await test.step('Add, rename and cancel topics and sub-topics, LO codes', () => addRenameAndLoCodes(page));
    await test.step('Deactivate, reactivate, delete and history', () => statusDeleteAndHistory(page));
});
