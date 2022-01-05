import { db, ExchangeStatuses, ExchangeStatus, Schema, Exchange } from './db';

export async function setExchangeStatus(index: number, status: string) {
  if (!ExchangeStatuses.includes(status as any)) {
    console.warn("Invalid status! Available statuses are:", ExchangeStatuses);
    return;
  }

  const { exchanges = [] } = (await db).valueOf() as Schema;
  const exchange = exchanges[index];

  if (!exchange) {
    return "No exchange found at given index!";
  }

  if (exchange.status === "FINALIZED") {
    return "Cannot change status of FINALIZED exchange!";
  }

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
  return null;
}
