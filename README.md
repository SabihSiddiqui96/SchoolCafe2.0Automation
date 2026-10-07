# SchoolCafe 2.0 Automation

Playwright tests for SchoolCafe 2.0 on QA (`https://qa.perseusedge.com`).

## Setup

```
npm install
npx playwright install chromium
cp .env.example .env
```

Fill in `SC2_USERNAME` and `SC2_PASSWORD` in `.env`. It is git-ignored.

## Run

```
npx playwright test --workers=1
npx playwright show-report
```
