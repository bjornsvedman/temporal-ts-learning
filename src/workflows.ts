import {
  condition,
  defineQuery,
  defineSignal,
  proxyActivities,
  setHandler,
  sleep,
} from '@temporalio/workflow';

export interface LearningStatus {
  pendingPrompt: boolean;
  promptCount: number;
  lastPromptAt: string | null;
  lastResponse: string | null;
}

export interface WorkflowInput {
  hour24: number;
  minute: number;
}

export const submitLearningSignal = defineSignal<[string]>('submitLearning');
export const triggerPromptSignal = defineSignal('triggerPrompt');
export const getStatusQuery = defineQuery<LearningStatus>('getStatus');

function msUntilNextPrompt(hour24: number, minute: number): number {
  const now = new Date(Date.now());
  const target = new Date(now);
  target.setHours(hour24, minute, 0, 0);

  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }

  return target.getTime() - now.getTime();
}

export async function endOfDayLearningWorkflow(
  input: WorkflowInput = { hour24: 18, minute: 0 }
): Promise<void> {
  let pendingPrompt = false;
  let promptCount = 0;
  let lastPromptAt: string | null = null;
  let lastResponse: string | null = null;

  setHandler(submitLearningSignal, (text: string) => {
    if (!pendingPrompt) {
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    lastResponse = trimmed;
    pendingPrompt = false;
  });

  setHandler(triggerPromptSignal, () => {
    if (pendingPrompt) {
      return;
    }

    pendingPrompt = true;
    promptCount += 1;
    lastPromptAt = new Date(Date.now()).toISOString();
  });

  setHandler(getStatusQuery, () => ({
    pendingPrompt,
    promptCount,
    lastPromptAt,
    lastResponse,
  }));

  while (true) {
    const waitMs = msUntilNextPrompt(input.hour24, input.minute);
    await sleep(waitMs);

    pendingPrompt = true;
    promptCount += 1;
    lastPromptAt = new Date(Date.now()).toISOString();

    await condition(() => !pendingPrompt);
  }
}
