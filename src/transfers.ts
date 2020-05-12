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
let INITIALIZED = false;

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
    const previousBlockNumber = blockNumber.toNumber() - 1;
    let currentDollarPool = 0, sumDollarsInBlock = 0;

    // Since event handler is an async function, we await until previous block
    // is processed (which it probably is at this point) just to make sure we get
    // valid currentDollarPool to calculate the price
    await (new Promise((resolve) =>
      setTimeout(
        async () => {
          const { sizeDollarPool, poolLastUpdated } = (await db).valueOf();
          if (!INITIALIZED || poolLastUpdated === previousBlockNumber) {
            INITIALIZED = true;
            currentDollarPool = sizeDollarPool;
            resolve();
          }
        },
        100
      )
    ));

    // Processing all events in the finalized block
    console.log(`\nProcessing block #${ blockNumber }...`);
    for (let { event } of events) {
      if (event.section === 'balances' && event.method === 'Transfer') {
        const recipient = event.data[1] as AccountId;
        if (recipient.toString() === process.env.JSGENESIS_ADDRESS) {
          // For all events of "Transfer" type with matching recipient...
          const sender = event.data[0] as AccountId;
          const amountJOY = event.data[2] as Balance;
          const feesJOY = event.data[3] as Balance;
          const timestamp = await api.query.timestamp.now.at(blockHash) as Moment;
          const memo = await api.query.memo.memo.at(blockHash, sender) as Text;
          // To calcultate the price we use parent hash (so all the transactions that happend in this block have no effect on it)
          const price = await joy.price(head.parentHash, currentDollarPool);

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

          console.log('Exchange happened!', exchange);

          sumDollarsInBlock += exchange.amount * exchange.price;
        }
      }
    }

    // We update the dollar pool after processing all transactions in this block
    (await db)
      .set('sizeDollarPool', currentDollarPool - sumDollarsInBlock)
      .set('poolLastUpdated', blockNumber.toNumber())
      .write();

    console.log('Dollar pool before', currentDollarPool);
    console.log('Dollars in block:', sumDollarsInBlock);
    console.log('Dollar pool after:', currentDollarPool - sumDollarsInBlock);
  });
}

main().catch(console.error);
