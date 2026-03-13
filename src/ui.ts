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
  currentPromptId: string | null;
  answers: Array<{
    dayNumber: number;
    promptedAt: string | null;
    respondedAt: string;
    response: string;
  }>;
  completed: boolean;
  summary: string | null;
  summarySavedAt: string | null;
  message?: string;
}): string {
  const {
    pendingPrompt,
    promptCount,
    lastPromptAt,
    lastResponse,
    currentPromptId,
    answers,
    completed,
    summary,
    summarySavedAt,
    message,
  } = params;

  const answeredCount = answers.length;
  const answerRows = answers
    .map(
      (answer) =>
        `<li><strong>Day ${answer.dayNumber}:</strong> ${escapeHtml(answer.response)}<br/><small>Submitted at ${escapeHtml(
          answer.respondedAt
        )}</small></li>`
    )
    .join('');

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
    .prompt-id {
      margin: 6px 0 16px;
      display: inline-block;
      padding: 6px 12px;
      border-radius: 8px;
      background: #e2e8f0;
      color: #0f172a;
      font-size: 13px;
      font-family: Consolas, "Courier New", monospace;
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
    .progress {
      margin: 12px 0;
      font-weight: 600;
      color: #0f172a;
    }
    .summary {
      margin-top: 18px;
      padding: 14px;
      background: #ecfeff;
      border: 1px solid #67e8f9;
      border-radius: 10px;
      color: #164e63;
      white-space: pre-wrap;
    }
    .answers {
      margin-top: 12px;
      padding-left: 20px;
      color: #334155;
    }
    .answers li {
      margin-bottom: 10px;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Daily Learning Check-In</h1>
    <div class="status">${completed ? 'Saga complete for this week' : pendingPrompt ? 'Prompt waiting for your input' : 'No pending prompt right now'}</div>
    <div class="prompt-id">Current Prompt ID: ${currentPromptId ?? 'n/a'}</div>
    <div class="meta">Workflow ID: ${workflowId}<br/>Prompts triggered: ${promptCount}<br/>Last prompt: ${lastPromptAt ?? 'n/a'}</div>
    <div class="progress">Progress: ${answeredCount}/5 daily answers collected</div>

    ${message ? `<div class="message">${message}</div>` : ''}

    ${completed ? '' : `
      <form method="post" action="/trigger">
        <button type="submit">Trigger Daily Prompt Now</button>
      </form>
    `}

    ${pendingPrompt && !completed ? `
      <form method="post" action="/submit">
        <input type="hidden" name="promptId" value="${currentPromptId ?? ''}" />
        <label for="learning">What did you learn today?</label>
        <textarea id="learning" name="learning" required placeholder="Example: I learned how Temporal signals unblock a waiting workflow condition."></textarea>
        <button type="submit">Submit Learning</button>
      </form>
    ` : completed ? '<p>All five daily prompts are complete for this saga.</p>' : '<p>The workflow has no pending end-of-day prompt yet. Come back after the next scheduled time.</p>'}

    <div class="history"><strong>Last submitted learning:</strong><br/>${escapeHtml(lastResponse ?? 'No submission yet.')}</div>
    <ul class="answers">${answerRows || '<li>No daily answers yet.</li>'}</ul>

    ${summary ? `<div class="summary"><strong>Saved weekly summary (${escapeHtml(summarySavedAt ?? 'n/a')}):</strong><br/>${escapeHtml(summary)}</div>` : ''}
  </div>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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
  const promptId = String(req.body.promptId ?? '').trim();
  if (!text) {
    res.redirect('/');
    return;
  }

  try {
    const connection = await Connection.connect({ address: 'localhost:7233' });
    const client = new WorkflowClient({ connection });
    const handle = await getWorkflowHandle(client);
    await handle.signal(submitLearningSignal, { promptId, text });
    const status = await handle.query(getStatusQuery);
    const message = status.pendingPrompt
      ? 'Submission was ignored (prompt may be stale or not active).'
      : 'Learning submitted successfully.';
    res.status(200).send(renderPage({ ...status, message }));
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
