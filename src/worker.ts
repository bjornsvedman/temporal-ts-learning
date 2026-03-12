import { Worker } from '@temporalio/worker';

async function run(): Promise<void> {
  const worker = await Worker.create({
    workflowsPath: require.resolve('./workflows'),
    taskQueue: 'daily-learning-queue',
  });

  console.log('Worker listening on task queue: daily-learning-queue');
  await worker.run();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
