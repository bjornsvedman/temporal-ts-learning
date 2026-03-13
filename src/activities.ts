export interface DailyLearningAnswer {
  dayNumber: number;
  promptedAt: string | null;
  respondedAt: string;
  response: string;
}

export interface SummarySaveResult {
  summary: string;
  savedAt: string;
  storageKey: string;
}

export async function summarizeAndSaveWeek(
  answers: DailyLearningAnswer[]
): Promise<SummarySaveResult> {
  const lines = answers.map(
    (answer) => `Day ${answer.dayNumber}: ${answer.response}`
  );

  const summary = [
    'Weekly Learning Summary',
    ...lines,
  ].join('\n');

  const savedAt = new Date().toISOString();

  // This is intentionally a placeholder save target until DB persistence is added.
  const storageKey = `local-summary-${savedAt}`;

  return {
    summary,
    savedAt,
    storageKey,
  };
}
