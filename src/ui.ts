import express from 'express';
import { Connection, WorkflowClient } from '@temporalio/client';
import { getStatusQuery, submitLearningSignal, triggerPromptSignal } from './workflows';

const app = express();
app.use(express.urlencoded({ extended: false }));

const workflowId = 'daily-learning-workflow';

function renderPage(params: {
  pendingPrompt: boolean;
  promptCount: number;
  lastPromptAt: string | null;
  lastResponse: string | null;
  message?: string;
}): string {
  const { pendingPrompt, promptCount, lastPromptAt, lastResponse, message } = params;

  return `<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Daily Learning Check-In</title>
  <style>
    :root {
      --bg: #f4f6ff;
      --panel: #ffffff;
      --ink: #0f172a;
      --muted: #475569;
      --accent: #0ea5e9;
      --ok: #16a34a;
      --warn: #d97706;
    }
    body {
      margin: 0;
      font-family: "Segoe UI", Tahoma, sans-serif;
      background: radial-gradient(circle at top left, #e0f2fe 0%, var(--bg) 45%, #eef2ff 100%);
      color: var(--ink);
    }
    .wrap {
      max-width: 720px;
      margin: 48px auto;
      background: var(--panel);
      border-radius: 16px;
      box-shadow: 0 18px 40px rgba(2, 6, 23, 0.12);
      padding: 28px;
    }
    h1 { margin-top: 0; }
    .meta { color: var(--muted); margin-bottom: 16px; }
    .status {
      display: inline-block;
      padding: 6px 12px;
      border-radius: 999px;
      color: white;
      background: ${pendingPrompt ? 'var(--warn)' : 'var(--ok)'};
      font-size: 14px;
      margin-bottom: 16px;
    }
    textarea {
      width: 100%;
      min-height: 130px;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 12px;
      font-size: 15px;
      resize: vertical;
      box-sizing: border-box;
    }
    button {
      margin-top: 12px;
      border: 0;
      border-radius: 10px;
      padding: 10px 16px;
      color: white;
      background: var(--accent);
      font-weight: 600;
      cursor: pointer;
    }
    .message { margin: 12px 0; color: var(--accent); }
    .history {
      margin-top: 18px;
      padding: 14px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      color: #334155;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Daily Learning Check-In</h1>
    <div class="status">${pendingPrompt ? 'Prompt waiting for your input' : 'No pending prompt right now'}</div>
    <div class="meta">Prompts triggered: ${promptCount}<br/>Last prompt: ${lastPromptAt ?? 'n/a'}</div>

    ${message ? `<div class="message">${message}</div>` : ''}

    <form method="post" action="/trigger">
      <button type="submit">Trigger Daily Prompt Now</button>
    </form>

    ${pendingPrompt ? `
      <form method="post" action="/submit">
        <label for="learning">What did you learn today?</label>
        <textarea id="learning" name="learning" required placeholder="Example: I learned how Temporal signals unblock a waiting workflow condition."></textarea>
        <button type="submit">Submit Learning</button>
      </form>
    ` : '<p>The workflow has no pending end-of-day prompt yet. Come back after the next scheduled time.</p>'}

    <div class="history"><strong>Last submitted learning:</strong><br/>${lastResponse ?? 'No submission yet.'}</div>
  </div>
</body>
</html>`;
}

async function getWorkflowHandle(client: WorkflowClient) {
  return client.getHandle(workflowId);
}

app.get('/', async (_req, res) => {
  try {
    const connection = await Connection.connect({ address: 'localhost:7233' });
    const client = new WorkflowClient({ connection });
    const handle = await getWorkflowHandle(client);
    const status = await handle.query(getStatusQuery);
    res.status(200).send(renderPage(status));
  } catch (err) {
    res.status(500).send(`Failed to load status. Is the workflow started? Error: ${String(err)}`);
  }
});

app.post('/submit', async (req, res) => {
  const text = String(req.body.learning ?? '').trim();
  if (!text) {
    res.redirect('/');
    return;
  }

  try {
    const connection = await Connection.connect({ address: 'localhost:7233' });
    const client = new WorkflowClient({ connection });
    const handle = await getWorkflowHandle(client);
    await handle.signal(submitLearningSignal, text);
    const status = await handle.query(getStatusQuery);
    res.status(200).send(renderPage({ ...status, message: 'Learning submitted successfully.' }));
  } catch (err) {
    res.status(500).send(`Failed to submit learning. Error: ${String(err)}`);
  }
});

app.post('/trigger', async (_req, res) => {
  try {
    const connection = await Connection.connect({ address: 'localhost:7233' });
    const client = new WorkflowClient({ connection });
    const handle = await getWorkflowHandle(client);
    await handle.signal(triggerPromptSignal);
    const status = await handle.query(getStatusQuery);
    const message = 'Daily prompt is now pending.';
    res.status(200).send(renderPage({ ...status, message }));
  } catch (err) {
    res.status(500).send(`Failed to trigger prompt. Error: ${String(err)}`);
  }
});

app.listen(3000, () => {
  console.log('UI running at http://localhost:3000');
});
