//import { db } from "./testdb";
import { JoyApi } from "./joyApi";
import { config } from "dotenv";
import { Text } from "@polkadot/types";
import { Vec } from '@polkadot/types/codec';
import { EventRecord, Moment, AccountId, Balance } from '@polkadot/types/interfaces';
import { db, Exchange } from './db';
config();

const provider = process.env.PROVIDER || "ws://127.0.0.1:9944";

const joy = new JoyApi(provider);

// Known account we want to use (available on dev chain, with funds)

// Listen to all tx to Jsgenesis address
// Add them to exchanges. Calculate the Dollar Value, and log all the other info. Set completed to false.

async function main() {
  // Create an await for the API
  const { api } = await joy.init;

  api.rpc.chain.subscribeFinalizedHeads(async head => {
    const blockNumber = head.number;
    const blockHash = head.hash;
    const events = await api.query.system.events.at(blockHash) as Vec<EventRecord>;

    for (let { event } of events) {
      if (event.section === 'balances' && event.method === 'Transfer') {
        const sender = event.data[0] as AccountId;
        const recipient = event.data[1] as AccountId;
        if (recipient.toString() === process.env.JSGENESIS_ADDRESS) {
          const amountJOY = event.data[2] as Balance;
          const feesJOY = event.data[3] as Balance;
          const timestamp = await api.query.timestamp.now.at(blockHash) as Moment;
          const memo = await api.query.memo.memo.at(blockHash, sender) as Text;
          // For price we use parent hash (so it's a price before the transaction, not after)
          const price = await joy.price(head.parentHash);

          const exchange: Exchange = {
            sender: sender.toString(),
            recipient: recipient.toString(),
            senderMemo: memo.toString(),
            amount: amountJOY.toNumber(),
            fees: feesJOY.toNumber(),
            date: new Date(timestamp.toNumber()),
            blockHeight: blockNumber.toNumber(),
            price: parseFloat(price),
          };

          (await db)
            .get('exchanges', [])
            .push(exchange)
            .write();
        }
      }
    }
  });
}

main().catch(console.error);
