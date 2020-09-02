import low from "lowdb";
import FileAsync from "lowdb/adapters/FileAsync";

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

type Schema = {
  exchanges?: Exchange[];
  sizeDollarPool?: number;
  lastBlockProcessed?: number;
  replenishAmount?: number;
  tokensBurned?: number;
  errors?: BlockProcessingError[];
  warnings?: BlockProcessingWarning[];
  burns?: Burn[];
};

const adapter = new FileAsync<Schema>("exchanges.json");
const db = low(adapter);

export { db, Exchange, BlockProcessingError, BlockProcessingWarning, Burn, Schema };
