import low from "lowdb";
import FileAsync from "lowdb/adapters/FileAsync";

type Exchange = {
    sender: string,
    recipient: string,
    xmrAddress: string,
    amount: number,
    fees: number,
    date: Date,
    blockHeight: number,
    price: number,
    amountUSD: number
};

type BlockProcessingError = {
    blockNumber: number;
    reason?: string;
}

type Burn = {
    amount: number,
    tokensRecievedAtBlock: number,
    finalStatus: string,
    finalizedBlockHash?: string,
}

type BlockProcessingWarning = {
    blockNumber: number,
    message: string
}

type Schema = {
    exchanges: Exchange[];
    sizeDollarPool: number,
    lastBlockProcessed: number,
    replenishAmount: number,
    tokensBurned: number,
    errors: BlockProcessingError[],
    warnings: BlockProcessingWarning[],
    burns: Burn[]
};

const adapter = new FileAsync<Schema>("exchanges.test.json");
const db = low(adapter);

export { db, Exchange, BlockProcessingError, BlockProcessingWarning, Burn };
