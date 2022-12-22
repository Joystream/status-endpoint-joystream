import { JoyApi, BURN_PAIR, BURN_ADDRESS } from "./joyApi";
import { Vec } from '@polkadot/types/codec';
import { EventRecord, Header } from '@polkadot/types/interfaces';
import { db, refreshDb, Exchange, BlockProcessingError, BlockProcessingWarning, Burn, PoolChange } from './db';
import { ApiPromise } from "@polkadot/api";
import locks from "locks";
import { log, error } from './debug';
import { calcPrice } from "./utils";
import { FrameSystemEventRecord } from "@polkadot/types/lookup";

const processingLock = locks.createMutex();
const burningLock = locks.createMutex();

const joy = new JoyApi();

const BLOCK_PROCESSING_TIMEOUT = 10000;
const FIRST_BLOCK_TO_PROCESS = 1;
const PROBABILISTIC_FINALITY_DEPTH = 10;

// Known account we want to use (available on dev chain, with funds)

// Listen to all tx to Jsgenesis address
// Add them to exchanges. Calculate the Dollar Value, and log all the other info. Set completed to false.

// If for some reason we cannot process given block and all the attempts to do so fail,
// we log the fault block number, update the database and exit the process to avoid inconsistencies. 
async function critialExit(faultBlockNumber: number, reason?: string) {
  const logTime = new Date();
  await (await db)
    .defaults({ errors: [] as BlockProcessingError[] })
    .get('errors')
    .push({ blockNumber: faultBlockNumber, reason, logTime })
    .write();

  await (await db)
    .set('lastBlockProcessed', faultBlockNumber)
    .write();

  log('Critical error, extiting...');
  log('Faulty block:', faultBlockNumber);
  log('Reason:', reason);
  process.exit();
}

// Exectue the actual tokens burn
function autoburn(api: ApiPromise) {
  // We need to use the lock to prevent executing multiple burns in the same block, since it causes transaction priority errors
  burningLock.lock(async () => {
    const burnAddressBalanceInHAPI = await joy.burnAddressBalanceInHAPI();
    const mockBurnTx = await api.tx.joystreamUtility.burnAccountTokens(burnAddressBalanceInHAPI)
    const burnTxFeeInHAPI = (await mockBurnTx.paymentInfo(BURN_ADDRESS)).partialFee
    const burnAmountInHAPI = burnAddressBalanceInHAPI.sub(burnTxFeeInHAPI)
    if (burnAmountInHAPI.lten(0)) {
      burningLock.unlock();
      return;
    }
    log(`Executing automatic burn of ${ burnAmountInHAPI.toString() } HAPI (tx fee: ${burnTxFeeInHAPI.toString()})`);
    try {
      api.tx.joystreamUtility.burnAccountTokens(burnAmountInHAPI)
        // We assume that required transaction fee is 0 (which is currently true)
        .signAndSend(BURN_PAIR, async result => {
          if (result.status.isInBlock) {
            const blockHash = result.status.asInBlock.toHex();
            log(`Automatic burn of ${ burnAmountInHAPI } HAPI included in block: ${blockHash}`);
            burningLock.unlock();
          }
          if (result.isError) {
            const statusType = result.status.type.toString() || 'Error';
            error(`Automatic burn of ${ burnAmountInHAPI } HAPI extrinsic failed with status: ${statusType}`);
            burningLock.unlock();
          }
        });
      } catch(e) {
        error(`Automatic burn of ${ burnAmountInHAPI } HAPI failed with: `, e);
        burningLock.unlock();
      }
  });
}

async function processBlock(api: ApiPromise, blockHeader: Header, events: Vec<FrameSystemEventRecord>) {
  const blockNumber = blockHeader.number.toNumber();

  try {
    await new Promise<void>(async (resolve, reject) => {
      // Set block processing timeout to avoid infinite lock
      const processingTimeout = setTimeout(
        () => reject('Block processing timeout'),
        BLOCK_PROCESSING_TIMEOUT
      );
      // Set lock to avoid processing multiple blocks at the same time
      processingLock.lock(async () => {
        console.log('\n');

        const { lastBlockProcessed = FIRST_BLOCK_TO_PROCESS - 1 } = (await db).valueOf();

        // Ignore blocks that are (or should be) already processed
        if (blockNumber <= lastBlockProcessed) {
          processingLock.unlock();
          clearTimeout(processingTimeout);
          return;
        }

        log(`Processing block #${ blockNumber }...`);

        const blockHash = blockHeader.hash;
        const blockTimestamp = await api.query.timestamp.now.at(blockHash);
        const issuanceInJOY = await joy.totalIssuanceInJOY(blockHash);
        // Refresh db state before processing each new block
        await refreshDb(blockNumber, new Date(blockTimestamp.toNumber()), issuanceInJOY);

        const events = await api.query.system.events.at(blockHash) as Vec<EventRecord>;
        const bestFinalized = (await api.derive.chain.bestNumberFinalized()).toNumber();
        const { sizeDollarPool: currentDollarPool = 0 } = (await db).valueOf();
        let sumDollarsInBlock = 0, sumTokensInBlock = 0;

        // Add warning if the block is not yet finalized
        if (blockNumber > bestFinalized) {
          await (await db)
            .defaults({ warnings: [] as BlockProcessingWarning[] })
            .get('warnings')
            .push({
              blockNumber,
              message: `Processing before finalized! Finalized: ${ bestFinalized }, Processing: ${ blockNumber }`,
              logTime: new Date()
            })
            .write();
        }

        // To calcultate the price we use parent hash (so all the transactions that happend in this block have no effect on it)
        const price = calcPrice(issuanceInJOY, currentDollarPool);
        
        // Handlers
        const handleExchange = async (senderAddress: string, amountJOY: number) => {
          const amountUSD = price * amountJOY;

          const exchange: Exchange = {
            sender: senderAddress,
            recipient: BURN_ADDRESS,
            amount: amountJOY,
            date: new Date(blockTimestamp.toNumber()),
            blockHeight: blockNumber,
            price: price,
            amountUSD: amountUSD,
            logTime: new Date(),
            status: 'PENDING'
          };

          await (await db)
            .defaults({ exchanges: [] as Exchange[] })
            .get('exchanges', [])
            .push(exchange)
            .write();

          sumDollarsInBlock += exchange.amountUSD;
          sumTokensInBlock  += exchange.amount;

          log('Exchange handled!', exchange);
        }

        const handleBurn = async (amountJOY: number) => {
          const burn: Burn = {
            amount: amountJOY,
            blockHeight: blockNumber,
            date: new Date(blockTimestamp.toNumber()),
            logTime: new Date()
          }
          await (await db)
          .defaults({ burns: [] as Burn[] })
          .get('burns')
          .push(burn)
          .write();

          log('Burn handled!', burn);
        }

        // Processing events in the finalized block
        for (const { event } of events) {
          if (api.events.balances.Transfer.is(event)) {
            const [from, to, amount] = event.data
            if (to.eq(BURN_ADDRESS) && !amount.isZero()) {
              await handleExchange(from.toString(), joy.toJOY(amount));
            }
          }

          if (api.events.joystreamUtility.TokensBurned.is(event)) {
            const [account, burnedAmount] = event.data
            if (account.eq(BURN_ADDRESS) && !burnedAmount.isZero()) {
              await handleBurn(joy.toJOY(burnedAmount))
            }
          }
        }

        const dollarPoolAfter = currentDollarPool - sumDollarsInBlock;
        // We update the dollar pool after processing all transactions in this block
        await (await db)
          .set('sizeDollarPool', dollarPoolAfter)
          .set('lastBlockProcessed', blockNumber)
          .write();

        if (sumDollarsInBlock) {
          // Handle pool change
          const poolChange: PoolChange = {
            blockHeight: blockNumber,
            blockTime: new Date(blockTimestamp.toNumber()),
            change: -sumDollarsInBlock,
            reason: `Exchange(s) totalling ${sumTokensInBlock} tokens`,
            issuance: issuanceInJOY,
            valueAfter: dollarPoolAfter,
            rateAfter: calcPrice(issuanceInJOY, dollarPoolAfter)
          };

          await (await db)
            .defaults({ poolChangeHistory: [] as PoolChange[] })
            .get('poolChangeHistory', [])
            .push(poolChange)
            .write();
        }

        log('Issuance at this block (in JOY):', issuanceInJOY);
        log('Token price at this block:', price);
        log('Exchanged tokens in this block:', sumTokensInBlock);
        log('Exchanged tokens value in this block:', `$${sumDollarsInBlock}`);
        log('Dollar pool after processing this block:', dollarPoolAfter);

        autoburn(api);

        processingLock.unlock();
        clearTimeout(processingTimeout);
        resolve();
      });
    });
  } catch (e) {
    await critialExit(blockNumber, JSON.stringify(e));
  }
}

async function processPastBlocks(api: ApiPromise, from: number, to: number) {
  for (let blockNumber = from; blockNumber <= to; ++blockNumber) {
    const hash = await api.rpc.chain.getBlockHash(blockNumber);
    const blockHeader = await api.rpc.chain.getHeader(hash);
    const events = await api.query.system.events.at(hash);
    try {
      await processBlock(api, blockHeader, events);
    } catch (e) {
      critialExit(blockHeader.number.toNumber(), JSON.stringify(e));
    }
  }
}

async function main() {
  // Create an await for the API
  const { api } = await joy.init;

  api.rpc.chain.subscribeNewHeads(async head => {
    const { lastBlockProcessed = FIRST_BLOCK_TO_PROCESS - 1 } = (await db).valueOf();
    const blockNumber = head.number.toNumber();
    const blockNumberToProcess = blockNumber - PROBABILISTIC_FINALITY_DEPTH;
    // Ignore already processed blocks and blocks before "FIRST_BLOCK_TO_PROCESS"
    if (blockNumberToProcess <= lastBlockProcessed || blockNumberToProcess < FIRST_BLOCK_TO_PROCESS) return;
    // Make sure all blocks between the last processed block and (including) current block to process are processed
    await processPastBlocks(api, lastBlockProcessed + 1, blockNumberToProcess);
  });
}

export default main;
