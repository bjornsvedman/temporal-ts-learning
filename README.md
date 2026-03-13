# Temporal TypeScript Daily Learning App

This sample starts a Temporal workflow saga that triggers one end-of-day prompt each day for five days, then runs a final activity that summarizes and saves the week.

## What It Includes

- Temporal workflow saga: waits until configured hour/minute each day and opens a prompt
- Five-day completion rule: accepts exactly five daily answers and then completes
- Final activity: summarizes all five days and returns a saved summary result
- Worker: executes the workflow
- UI: asks "What did you learn today?" and signals the workflow with your answer

## Run

1. Start Temporal server (recommended for local dev):

```bash
temporal server start-dev
```

2. Install packages:

```bash
npm install
```

3. Start worker:

```bash
npm run worker
```

4. Start workflow (once):

```bash
npm run start-workflow
```

5. Start UI:

```bash
npm run ui
```

Open: http://localhost:3000

## Query Current Weekly Learning

While the workflow is running, you can query current weekly progress and answers:

```bash
npm run query-week
```

This calls the workflow query `getWeeklyLearning` on workflow id `daily-learning-workflow`.

## Notes

- Task queue used: `daily-learning-queue`
- Workflow ID used: `daily-learning-workflow`
- Default schedule in `src/client.ts` is 18:00 (local timezone of workflow runtime)
