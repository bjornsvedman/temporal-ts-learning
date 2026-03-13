import {
  condition,
  defineQuery,
  defineSignal,
  proxyActivities,
  setHandler,
} from '@temporalio/workflow';
import type * as weeklyActivities from './activities.js';
import type { DailyLearningAnswer, SummarySaveResult } from './activities.js';

export interface LearningStatus {
  pendingPrompt: boolean;
  promptCount: number;
  lastPromptAt: string | null;
  lastResponse: string | null;
  currentPromptId: string | null;
  answers: DailyLearningAnswer[];
  completed: boolean;
  summary: string | null;
  summarySavedAt: string | null;
}

export interface WeeklyLearningView {
  weekTarget: number;
  completedDays: number;
  pendingPrompt: boolean;
  completed: boolean;
  currentLearning: string;
  answers: DailyLearningAnswer[];
}

export interface WorkflowInput {
  hour24: number;
  minute: number;
}

const REQUIRED_ANSWERS = 5;

type SubmitLearningPayload = string | { promptId?: string; text?: unknown };

export const submitLearningSignal = defineSignal<[SubmitLearningPayload]>('submitLearning');
export const triggerPromptSignal = defineSignal('triggerPrompt');
export const getStatusQuery = defineQuery<LearningStatus>('getStatus');
export const getWeeklyLearningQuery = defineQuery<WeeklyLearningView>('getWeeklyLearning');

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
  const { summarizeAndSaveWeek } = proxyActivities<typeof weeklyActivities>({
    startToCloseTimeout: '1 minute',
  });

  let pendingPrompt = false;
  let promptCount = 0;
  let lastPromptAt: string | null = null;
  let lastResponse: string | null = null;
  let currentPromptId: string | null = null;
  let currentPromptedAt: string | null = null;
  const answers: DailyLearningAnswer[] = [];
  let completed = false;
  let summaryResult: SummarySaveResult | null = null;

  function openPromptNow() {
    if (pendingPrompt || completed || answers.length >= REQUIRED_ANSWERS) {
      return;
    }

    promptCount += 1;
    pendingPrompt = true;
    lastPromptAt = new Date(Date.now()).toISOString();
    currentPromptedAt = lastPromptAt;
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

    const dayNumber = answers.length + 1;
    answers.push({
      dayNumber,
      promptedAt: currentPromptedAt,
      respondedAt: new Date(Date.now()).toISOString(),
      response: trimmed,
    });

    lastResponse = trimmed;
    pendingPrompt = false;
    currentPromptedAt = null;
    currentPromptId = null;

    if (answers.length >= REQUIRED_ANSWERS) {
      completed = true;
    }
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
    answers: [...answers],
    completed,
    summary: summaryResult?.summary ?? null,
    summarySavedAt: summaryResult?.savedAt ?? null,
  }));

  setHandler(getWeeklyLearningQuery, () => ({
    weekTarget: REQUIRED_ANSWERS,
    completedDays: answers.length,
    pendingPrompt,
    completed,
    currentLearning: answers.length
      ? answers.map((a) => `Day ${a.dayNumber}: ${a.response}`).join('\n')
      : 'No learning submitted yet.',
    answers: [...answers],
  }));

  while (!completed) {
    const waitMs = msUntilNextPrompt(input.hour24, input.minute);
    const wokeBySignal = await condition(() => pendingPrompt || completed, waitMs);
    if (!wokeBySignal) {
      openPromptNow();
    }

    await condition(() => !pendingPrompt || completed);
  }

  summaryResult = await summarizeAndSaveWeek(answers);
}
