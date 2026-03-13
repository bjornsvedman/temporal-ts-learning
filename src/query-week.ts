import { Connection, WorkflowClient } from '@temporalio/client';
import { getStatusQuery, getWeeklyLearningQuery } from './workflows.js';

async function run(): Promise<void> {
  const connection = await Connection.connect({ address: 'localhost:7233' });
  const client = new WorkflowClient({ connection });

  const handle = client.getHandle('daily-learning-workflow');
  try {
    const week = await handle.query(getWeeklyLearningQuery);

    console.log('Weekly learning progress');
    console.log(`Completed days: ${week.completedDays}/${week.weekTarget}`);
    console.log(`Pending prompt: ${week.pendingPrompt}`);
    console.log(`Saga completed: ${week.completed}`);
    console.log('--- Current learning ---');
    console.log(week.currentLearning);
    return;
  } catch (err) {
    if (!String(err).includes('QueryNotRegisteredError')) {
      throw err;
    }
  }

  const status = await handle.query(getStatusQuery);
  console.log('Weekly learning progress (fallback from getStatus)');
  console.log(`Completed days: ${status.answers.length}/5`);
  console.log(`Pending prompt: ${status.pendingPrompt}`);
  console.log(`Saga completed: ${status.completed}`);
  console.log('--- Current learning ---');
  if (!status.answers.length) {
    console.log('No learning submitted yet.');
    return;
  }
  for (const answer of status.answers) {
    console.log(`Day ${answer.dayNumber}: ${answer.response}`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
