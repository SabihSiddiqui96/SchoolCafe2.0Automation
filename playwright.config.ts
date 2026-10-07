import * as dotenv from 'dotenv';
import { defineConfig, devices } from '@playwright/test';
import { getEnvVar } from './utils/env';

dotenv.config({ path: getEnvVar('ENV_FILE', { required: false }) || '.env' });

function positiveIntFromEnv(name: string, fallback: number): number {
    const value = Number.parseInt(process.env[name]?.trim() ?? '', 10);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

export default defineConfig({
    testDir: './tests',
    timeout: positiveIntFromEnv('TEST_TIMEOUT_MS', process.env.CI ? 180000 : 90000),
    expect: { timeout: positiveIntFromEnv('EXPECT_TIMEOUT_MS', 15000) },
    workers: process.env.CI ? 1 : undefined,
    retries: process.env.CI ? 1 : 0,
    reporter: [
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
        ['junit', { outputFile: 'test-results/results.xml' }],
        ['json', { outputFile: 'test-results/results.json' }]
    ],
    use: {
        baseURL: getEnvVar('BASE_URL', { required: false }) || 'https://qa.perseusedge.com',
        headless: !!process.env.CI,
        ignoreHTTPSErrors: true,
        actionTimeout: 15000,
        navigationTimeout: positiveIntFromEnv('NAVIGATION_TIMEOUT_MS', process.env.CI ? 60000 : 45000),
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'off'
    },
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                channel: process.env.CI ? 'chrome' : undefined
            }
        }
    ]
});
