# Temporal TypeScript Daily Learning App

This sample starts a long-running Temporal workflow that triggers an end-of-day prompt and exposes a small UI for submitting what you learned.

## What It Includes

- Temporal workflow: waits until configured hour/minute each day and opens a prompt
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

## Notes

- Task queue used: `daily-learning-queue`
- Workflow ID used: `daily-learning-workflow`
- Default schedule in `src/client.ts` is 18:00 (local timezone of workflow runtime)
