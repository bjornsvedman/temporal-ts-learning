import { Connection, WorkflowClient, WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import { endOfDayLearningWorkflow } from './workflows';

async function run(): Promise<void> {
  const connection = await Connection.connect({ address: 'localhost:7233' });
  const client = new WorkflowClient({ connection });

  const workflowId = 'daily-learning-workflow';

  try {
    await client.start(endOfDayLearningWorkflow, {
      taskQueue: 'daily-learning-queue',
      workflowId,
      args: [{ hour24: 18, minute: 0 }],
    });
    console.log('Started workflow:', workflowId);
  } catch (err) {
    if (err instanceof WorkflowExecutionAlreadyStartedError) {
      console.log('Workflow already running:', workflowId);
      return;
    }
    throw err;
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
