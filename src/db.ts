import low from "lowdb";
import FileAsync from "lowdb/adapters/FileAsync";

type Exchange = {
    sender: string,
    recipient: string,
    senderMemo: string,
    amount: number,
    fees: number,
    date: Date,
    blockHeight: number,
    price: number
};

type Schema = {
    exchanges: Exchange[];
    sizeDollarPool: number,
    replenishAmount: number,
    tokensBurned: number
};

const adapter = new FileAsync<Schema>("exchanges.test.json");
const db = low(adapter);

export { db, Exchange };
