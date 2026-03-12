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
  currentPromptId: string | null;
}

export interface WorkflowInput {
  hour24: number;
  minute: number;
}

type SubmitLearningPayload = string | { promptId?: string; text?: unknown };

export const submitLearningSignal = defineSignal<[SubmitLearningPayload]>('submitLearning');
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
  let currentPromptId: string | null = null;

  function openPromptNow() {
    if (pendingPrompt) {
      return;
    }

    promptCount += 1;
    pendingPrompt = true;
    lastPromptAt = new Date(Date.now()).toISOString();
    currentPromptId = `${Date.now()}-${promptCount}`;
  }

  setHandler(submitLearningSignal, (payload: SubmitLearningPayload) => {
    if (!pendingPrompt) {
      return;
    }

    let promptId: string | null = null;
    let text: unknown = '';

    if (typeof payload === 'string') {
      text = payload;
    } else if (payload && typeof payload === 'object') {
      if (typeof payload.promptId === 'string') {
        promptId = payload.promptId;
      }
      text = payload.text;
    }

    if (promptId && (!currentPromptId || promptId !== currentPromptId)) {
      return;
    }

    const trimmed = typeof text === 'string' ? text.trim() : String(text ?? '').trim();
    if (!trimmed) {
      return;
    }

    lastResponse = trimmed;
    pendingPrompt = false;
    currentPromptId = null;
  });

  setHandler(triggerPromptSignal, () => {
    openPromptNow();
  });

  setHandler(getStatusQuery, () => ({
    pendingPrompt,
    promptCount,
    lastPromptAt,
    lastResponse,
    currentPromptId,
  }));

  while (true) {
    const waitMs = msUntilNextPrompt(input.hour24, input.minute);
    await sleep(waitMs);

    openPromptNow();

    await condition(() => !pendingPrompt);
  }
}
