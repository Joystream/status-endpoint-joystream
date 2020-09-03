import low from "lowdb";
import FileAsync from "lowdb/adapters/FileAsync";
import { log } from './debug';

const ExchangeStatuses = [ 'PENDING', 'FINALIZED' ] as const;
type ExchangeStatus = typeof ExchangeStatuses[number];

type Exchange = {
  sender: string;
  recipient: string;
  senderMemo: string;
  xmrAddress: string;
  amount: number;
  date: Date;
  logTime: Date;
  blockHeight: number;
  price: number;
  amountUSD: number;
  status: ExchangeStatus;
};

type BlockProcessingError = {
  blockNumber: number;
  logTime: Date;
  reason?: string;
};

type Burn = {
  amount: number;
  blockHeight: number;
  date: Date;
  logTime: Date;
};

type BlockProcessingWarning = {
  blockNumber: number;
  logTime: Date;
  message: string;
};

type ScheduledPoolIncrease = {
  blockHeight: number;
  amount: number;
};

type Schema = {
  exchanges?: Exchange[];
  sizeDollarPool?: number;
  lastBlockProcessed?: number;
  replenishAmount?: number;
  tokensBurned?: number;
  errors?: BlockProcessingError[];
  warnings?: BlockProcessingWarning[];
  burns?: Burn[];
  scheduledPoolIncreases?: ScheduledPoolIncrease[];
};

const adapter = new FileAsync<Schema>("exchanges.json");
const db = low(adapter);

const refreshDb = async (currentBlockNumber?: number) => {
  // Re-read from file
  await (await db).read();
  if (currentBlockNumber) {
    // Check if any scheduled dollar pool increases should be executed
    const { scheduledPoolIncreases = [] } = (await db).valueOf() as Schema;
    for (let [index, { blockHeight, amount }] of Object.entries(scheduledPoolIncreases)) {
      if (blockHeight <= currentBlockNumber) {
        await (await db).get('scheduledPoolIncreases').pullAt(parseInt(index)).write();
        await (await db).update('sizeDollarPool', (current: number) => current + amount).write();
        log(`Sheduled dollar pool size increase by $${amount} on block >= ${blockHeight} has been executed!`);
      }
    }
  }
}

export { 
  db,
  Exchange,
  BlockProcessingError,
  BlockProcessingWarning,
  Burn,
  Schema,
  ScheduledPoolIncrease,
  refreshDb,
  ExchangeStatuses
};
