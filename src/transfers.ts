//import { db } from "./testdb";
import { JoyApi } from "./joyApi";
import { config } from "dotenv";
import { Text } from "@polkadot/types";
import { Vec } from '@polkadot/types/codec';
import { EventRecord, Moment, AccountId, Balance, Header } from '@polkadot/types/interfaces';
import { db, Exchange, BlockProcessingError } from './db';
import { ApiPromise } from "@polkadot/api";
import locks from "locks";
config();

const processingLock = locks.createMutex();

const provider = process.env.PROVIDER || "ws://127.0.0.1:9944";

const joy = new JoyApi(provider);

const BLOCK_PROCESSING_TIMEOUT = 10000;
const FIRST_BLOCK_TO_PROCESS = 1;

// Known account we want to use (available on dev chain, with funds)

// Listen to all tx to Jsgenesis address
// Add them to exchanges. Calculate the Dollar Value, and log all the other info. Set completed to false.

// If for some reason we cannot process given block and all the attempts to do so fail,
// we log the fault block number, update the database and exit the process to avoid inconsistencies. 
async function critialExit(faultBlockNumber: number, reason?: string) {
  await (await db)
    .defaults({ errors: [] as BlockProcessingError[] })
    .get('errors')
    .push({ blockNumber: faultBlockNumber, reason })
    .write();

  await (await db)
    .set('lastBlockProcessed', faultBlockNumber)
    .write();

  console.log('Critical error, extiting...');
  console.log('Faulty block:', faultBlockNumber);
  console.log('Reason:', reason);
  process.exit();
}

async function processBlock(api: ApiPromise, head: Header) {
  try {
    await new Promise(async (resolve, reject) => {
      // Set block processing timeout to avoid infinite lock
      const processingTimeout = setTimeout(
        () => reject('Block processing timeout'),
        BLOCK_PROCESSING_TIMEOUT
      );
      // Set lock to avoid processing multiple blocks at the same time
      processingLock.lock(async () => {
        const blockNumber = head.number;
        const { lastBlockProcessed = FIRST_BLOCK_TO_PROCESS - 1 } = (await db).valueOf();

        // Ignore blocks that are (or should be) already processed
        if (blockNumber.toNumber() <= lastBlockProcessed) {
          processingLock.unlock();
          clearTimeout(processingTimeout);
          return;
        }

        console.log(`\nProcessing block #${ blockNumber }...`);

        const blockHash = head.hash;
        const events = await api.query.system.events.at(blockHash) as Vec<EventRecord>;
        const { sizeDollarPool: currentDollarPool = 0, tokensBurned: currentTokensBurned = 0 } = (await db).valueOf();
        let sumDollarsInBlock = 0, sumTokensInBlock = 0;

        // To calcultate the price we use parent hash (so all the transactions that happend in this block have no effect on it)
        const price = await joy.price(head.parentHash, currentDollarPool);

        // Processing all events in the finalized block
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

              const exchange: Exchange = {
                sender: sender.toString(),
                recipient: recipient.toString(),
                xmrAddress: memo.toString(),
                amount: amountJOY.toNumber(),
                fees: feesJOY.toNumber(),
                date: new Date(timestamp.toNumber()),
                blockHeight: blockNumber.toNumber(),
                price: parseFloat(price),
              };

              await (await db)
                .defaults({ exchanges: [] as Exchange[] })
                .get('exchanges', [])
                .push(exchange)
                .write();

              console.log('Exchange happened!', exchange);

              sumDollarsInBlock += exchange.amount * exchange.price;
              sumTokensInBlock  += exchange.amount;
            }
          }
        }

        // We update the dollar pool after processing all transactions in this block
        await (await db)
          .set('sizeDollarPool', currentDollarPool - sumDollarsInBlock)
          .set('tokensBurned', currentTokensBurned + sumTokensInBlock)
          .set('lastBlockProcessed', blockNumber.toNumber())
          .write();

        console.log('Tokens in block:', sumTokensInBlock);
        console.log('Token price:', price);
        console.log('Dollars in block:', sumDollarsInBlock);
        console.log('Dollar pool after:', currentDollarPool - sumDollarsInBlock);
        console.log('Tokens burned after:', currentTokensBurned + sumTokensInBlock);

        processingLock.unlock();
        clearTimeout(processingTimeout);
        resolve();
      });
    });
  } catch (e) {
    await critialExit(head.number.toNumber(), JSON.stringify(e));
  }
}

async function processPastBlocks(api: ApiPromise, from: number, to: number) {
  for (let blockNumber = from; blockNumber <= to; ++blockNumber) {
    const hash = await api.rpc.chain.getBlockHash(blockNumber);
    const singedBlock = await api.rpc.chain.getBlock(hash);
    const header = singedBlock.block.header;
    try {
      await processBlock(api, header);
    } catch (e) {
      critialExit(header.number.toNumber(), JSON.stringify(e));
    }
  }
}

async function main() {
  // Create an await for the API
  const { api } = await joy.init;

  api.rpc.chain.subscribeFinalizedHeads(async head => {
    const { lastBlockProcessed = FIRST_BLOCK_TO_PROCESS - 1 } = (await db).valueOf();
    const blockNumber = head.number.toNumber();
    // Ignore already processed blocks
    if (blockNumber <= lastBlockProcessed) return;
    // Make sure all previous blocks are processed before processing the new one
    await processPastBlocks(api, lastBlockProcessed + 1, head.number.toNumber());
    // Process current block
    await processBlock(api, head);
  });
}

main().catch(console.error);
