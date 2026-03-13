import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import type { WorkflowHandle } from '@temporalio/client';
import {
  endOfDayLearningWorkflow,
  getStatusQuery,
  type LearningStatus,
  submitLearningSignal,
  triggerPromptSignal,
} from './workflows';
import type { DailyLearningAnswer, SummarySaveResult } from './activities';

async function waitForStatus(
  handle: WorkflowHandle<typeof endOfDayLearningWorkflow>,
  predicate: (status: LearningStatus) => boolean,
  timeoutMs = 5000
): Promise<LearningStatus> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const status = await handle.query(getStatusQuery);
      if (predicate(status)) {
        return status;
      }
    } catch (err) {
      lastError = err;
    }

    await sleep(20);
  }

  throw new Error(`Timed out waiting for workflow status. Last query error: ${String(lastError ?? 'none')}`);
}

async function runPromptCycle(
  handle: WorkflowHandle<typeof endOfDayLearningWorkflow>,
  dayNumber: number,
  answer: string
): Promise<void> {
  await handle.signal(triggerPromptSignal);

  const pending = await waitForStatus(
    handle,
    (status) => status.pendingPrompt && Boolean(status.currentPromptId)
  );

  assert.ok(pending.currentPromptId, 'Expected active prompt id before submission');

  await handle.signal(submitLearningSignal, {
    promptId: pending.currentPromptId,
    text: answer,
  });

  await waitForStatus(handle, (status) => status.answers.length >= dayNumber, 5000);
}

test('workflow completes after five valid daily answers', async () => {
  const env = await TestWorkflowEnvironment.createTimeSkipping();

  try {
    const taskQueue = `test-queue-${Date.now()}-complete`;
    let capturedSummaryInput: DailyLearningAnswer[] | null = null;

    const activities = {
      summarizeAndSaveWeek: async (answers: DailyLearningAnswer[]): Promise<SummarySaveResult> => {
        capturedSummaryInput = [...answers];
        return {
          summary: `summary-${answers.length}`,
          savedAt: new Date().toISOString(),
          storageKey: 'test-storage-key',
        };
      },
    };

    const worker = await Worker.create({
      connection: env.nativeConnection,
      taskQueue,
      workflowsPath: require.resolve('./workflows'),
      activities,
    });

    await worker.runUntil(async () => {
      const handle = await env.client.workflow.start(endOfDayLearningWorkflow, {
        taskQueue,
        workflowId: `wf-${Date.now()}-complete`,
        args: [{ hour24: 23, minute: 59 }],
      });

      for (let day = 1; day <= 5; day += 1) {
        await runPromptCycle(handle, day, `answer day ${day}`);
      }

      await handle.result();

      assert.ok(capturedSummaryInput, 'Expected summary activity to be called');
      assert.equal(capturedSummaryInput.length, 5);
      assert.deepEqual(
        capturedSummaryInput.map((a) => a.response),
        ['answer day 1', 'answer day 2', 'answer day 3', 'answer day 4', 'answer day 5']
      );
    });
  } finally {
    await env.teardown();
  }
});

test('final summary is not triggered before day five and triggers once on day five', async () => {
  const env = await TestWorkflowEnvironment.createTimeSkipping();

  try {
    const taskQueue = `test-queue-${Date.now()}-summary`;
    let summaryCallCount = 0;

    const activities = {
      summarizeAndSaveWeek: async (answers: DailyLearningAnswer[]): Promise<SummarySaveResult> => {
        summaryCallCount += 1;
        return {
          summary: `weekly-${answers.length}`,
          savedAt: new Date().toISOString(),
          storageKey: 'summary-once-key',
        };
      },
    };

    const worker = await Worker.create({
      connection: env.nativeConnection,
      taskQueue,
      workflowsPath: require.resolve('./workflows'),
      activities,
    });

    await worker.runUntil(async () => {
      const handle = await env.client.workflow.start(endOfDayLearningWorkflow, {
        taskQueue,
        workflowId: `wf-${Date.now()}-summary`,
        args: [{ hour24: 23, minute: 59 }],
      });

      for (let day = 1; day <= 4; day += 1) {
        await runPromptCycle(handle, day, `learning ${day}`);
      }

      const afterDayFour = await waitForStatus(handle, (status) => status.answers.length === 4);
      assert.equal(afterDayFour.completed, false);
      assert.equal(summaryCallCount, 0);

      await runPromptCycle(handle, 5, 'learning 5');
      await handle.result();

      assert.equal(summaryCallCount, 1);
    });
  } finally {
    await env.teardown();
  }
});
