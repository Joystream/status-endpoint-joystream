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
    price: number
};

type BlockProcessingError = {
    blockNumber: number;
    reason?: string;
}

type Schema = {
    exchanges: Exchange[];
    sizeDollarPool: number,
    lastBlockProcessed: number,
    replenishAmount: number,
    tokensBurned: number,
    errors: BlockProcessingError[]
};

const adapter = new FileAsync<Schema>("exchanges.test.json");
const db = low(adapter);

export { db, Exchange, BlockProcessingError };
