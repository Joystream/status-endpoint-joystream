import { db, ExchangeStatuses, ExchangeStatus, Schema, Exchange } from '../db';
import { confirm } from './utils';

async function main() {
  const index = parseInt(process.argv[2]);
  const status = process.argv[3];

  if (!ExchangeStatuses.includes(status as any)) {
    console.warn('Invalid status! Available statuses are:', ExchangeStatuses);
    return;
  }

  const { exchanges = [] } = (await db).valueOf() as Schema;
  const exchange = exchanges[index];

  if (!exchange) {
    console.warn('No exchange found by given index!');
    return;
  }

  if (exchange.status === 'FINALIZED') {
    console.warn('Cannot change status of FINALIZED exchange!')
    return;
  }

  console.log('Exchange that will be updated:', exchange);
  const confirmed = await confirm(`Are you sure you want to change its status to ${status}?`);

  if (confirmed) {
    // Update exchange status
    (await db)
        .defaults({ exchanges: [] as Exchange[] })
        .get('exchanges')
        .get(index)
        .assign({ status })
        .value();
    if ((status as ExchangeStatus) === 'FINALIZED') {
      // Update totalUSDPaid
      (await db)
        .defaults({ totalUSDPaid: 0 })
        .update('totalUSDPaid', (prev) => prev + exchange.amountUSD)
        .value();
    }
    // Save changes
    (await db).write()
    console.log(`Exchange status and totalUSDPaid updated!`);
  }
}

main();
