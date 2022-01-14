import { db, ExchangeStatuses, ExchangeStatus, Schema, Exchange } from './db';
import { confirm } from './commands/utils';

export async function setExchangeStatus(index: number, status: string, calledFromCLI?: boolean) {
  if (!ExchangeStatuses.includes(status as any)) {
    return `Invalid status! Available statuses are:, ${ExchangeStatuses}`;
  }

  const { exchanges = [] } = (await db).valueOf() as Schema;
  const exchange = exchanges[index];

  if (!exchange) {
    return 'No exchange found by given index!';
  }

  if (exchange.status === "FINALIZED") {
    return 'Cannot change status of FINALIZED exchange!';
  }

  let confirmed = false;
  if(calledFromCLI) {
    console.log('Exchange that will be updated:', exchange);
    confirmed = await confirm(`Are you sure you want to change its status to ${status}?`);
  }

  if((calledFromCLI && confirmed) || !calledFromCLI) {
    // Update exchange status
    (await db)
      .defaults({ exchanges: [] as Exchange[] })
      .get("exchanges")
      .get(index)
      .assign({ status })
      .value();
    if ((status as ExchangeStatus) === "FINALIZED") {
      // Update totalUSDPaid
      (await db)
        .defaults({ totalUSDPaid: 0 })
        .update("totalUSDPaid", prev => prev + exchange.amountUSD)
        .value();
    }
    // Save changes
    (await db).write();
    console.log(`Exchange status and totalUSDPaid updated!`);
  }

  return null;
}
