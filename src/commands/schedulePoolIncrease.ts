import { db, ScheduledPoolIncrease } from '../db';
import { confirm } from './utils';

async function main() {
  const amount = parseInt(process.argv[2]);
  const blockHeight = parseInt(process.argv[3]) || 0;

  if (!amount) {
    console.warn('No amount provided!');
    return;
  }

  const confirmed = await confirm(
    `Are you sure you want to schedule dollar pool increase by $${amount} on processedBlock >= ${blockHeight}?`
  );

  if (confirmed) {
    (await db)
      .defaults({ scheduledPoolIncreases: [] as ScheduledPoolIncrease[] })
      .get('scheduledPoolIncreases')
      .push({ amount, blockHeight })
      .write();
    console.log('Dollar pool increase scheduled!');
  }
}

main();
