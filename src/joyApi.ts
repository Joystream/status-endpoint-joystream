import "@joystream/types";
import { WsProvider, ApiPromise } from "@polkadot/api";
import { ChainProperties, Hash } from "@polkadot/types/interfaces";
import { config } from "dotenv";
import BN from "bn.js";
import fetch from "cross-fetch";
import { HexString } from "@polkadot/util/types";
import { perbillToPercent, percentToPerbill } from "./utils";

// Init .env config
config();

// Query node
if (process.env.QUERY_NODE === undefined) {
  throw new Error("Missing QUERY_NODE in .env!");
}
const QUERY_NODE = process.env.QUERY_NODE;
const VESTING_STRING_HEX = "0x76657374696e6720";
const ERAS_PER_DAY = 4;
const ERAS_PER_YEAR = ERAS_PER_DAY * 365;

export class JoyApi {
  endpoint: string;
  tokenDecimals!: number;
  isReady: Promise<[ApiPromise, ChainProperties]>;
  api!: ApiPromise;

  constructor(endpoint?: string) {
    const wsEndpoint = endpoint || process.env.PROVIDER || "ws://127.0.0.1:9944";
    this.endpoint = wsEndpoint;
    this.isReady = (async () => {
      const api = await new ApiPromise({ provider: new WsProvider(wsEndpoint) }).isReadyOrError;
      const chainProperties = await api.rpc.system.properties();
      const result: [ApiPromise, ChainProperties] = [api, chainProperties];
      return result;
    })();
  }

  get init(): Promise<JoyApi> {
    return this.isReady.then(([api, chainProperties]) => {
      this.api = api;
      this.tokenDecimals = chainProperties.tokenDecimals.unwrap()[0].toNumber();
      return this;
    });
  }

  toJOY(hapi: BN): number {
    try {
      // <= 900719 JOY - we keep the decimals
      return hapi.toNumber() / Math.pow(10, this.tokenDecimals);
    } catch {
      // > 900719 JOY - we discard the decimals
      const joyValue = hapi.div(new BN(Math.pow(10, this.tokenDecimals)));

      // TODO: Temporary "fix". Root of problem needs to be found!
      if (joyValue.gte(new BN(Number.MAX_SAFE_INTEGER))) return Number.MAX_SAFE_INTEGER;

      return joyValue.toNumber();
    }
  }

  async qnQuery<T>(query: string): Promise<T | null> {
    // TODO: Typesafe QueryNodeApi
    try {
      const res = await fetch(QUERY_NODE, {
        method: "POST",
        headers: { "Content-type": "application/json" },
        body: JSON.stringify({ query }),
      });

      if (res.ok) {
        let responseData = (await res.json()).data;
        return responseData;
      } else {
        console.error("Invalid query node response status", res.status);
      }
    } catch (e) {
      console.error("Query node fetch error:", e);
    }

    return null;
  }

  async totalIssuanceInJOY(blockHash?: Hash): Promise<number> {
    const issuanceInHAPI =
      blockHash === undefined
        ? await this.api.query.balances.totalIssuance()
        : await this.api.query.balances.totalIssuance.at(blockHash);

    return this.toJOY(issuanceInHAPI);
  }

  async finalizedHash() {
    return this.api.rpc.chain.getFinalizedHead();
  }

  async finalizedBlockHeight(): Promise<number> {
    const finalizedHash = await this.finalizedHash();
    const { number } = await this.api.rpc.chain.getHeader(`${finalizedHash}`);
    return number.toNumber();
  }

  /**
   * Calculates the amount of JOY tokens that are currently in circulation.
   *
   * It is done by going through all accounts which have locks associated
   * with them and summing the amounts of all the vesting locks. That computed
   * value is then subtracted from the total supply of tokens to get the final result.
   *
   * Overview of the algorithm:
   * 1. Fetch relevant lock data of all accounts
   * 2. Per account, loop through all of the locks and find the vesting lock value
   * 3. Fetch all of the system.account data for all of the accounts that have a vesting lock
   * 4. Calculate the total locked amount by summing the smallest of the following:
   *      - the vesting lock value
   *      - the free balance
   * 5. Fetch the current total supply of tokens
   * 6. Subtract the total locked amount from the total supply to get
   *    the amount of tokens that are currently in circulation.
   */

  async calculateCirculatingSupply() {
    // Initialization of array with following information:
    // - address: an address with a vesting lock
    // - amount: the vesting value corresponding to the address
    type AccountVestingLock = { address: string; amount: BN };
    const accountVestingLockData: AccountVestingLock[] = [];

    // Fetch lock data for all of the accounts that have any kind of lock
    const lockData = await this.api.query.balances.locks.entries();

    // Loop through the previously fetched lockData:
    // - storageKey holds the address of the account
    // - palletBalances holds the data for the array of locks associated with the account
    //   - example of palletBalances: [
    //     { id: 'vesting', amount: 10000000 },
    //     { id: 'staking', amount: 10000000 }
    //   ]
    //
    for (let [storageKey, palletBalances] of lockData) {
      // Find potential vesting lock by looping through all of the locks associated with the account
      // and comparing the id of the lock to the id of a qualifying vesting lock. As there is only
      // one vesting lock per acccount, we simply return as soon as we have found one.
      // - example of an entry in palletBalances: { id: 'vesting', amount: 10000000 }
      const vestingLock = palletBalances.find(({ id }) => id.toString() === VESTING_STRING_HEX);

      // If there is a vesting lock, we store it into the accountVestingLockData array for later use.
      if (vestingLock) {
        accountVestingLockData.push({
          address: storageKey.args[0].toString(),
          amount: vestingLock.amount.toBn(),
        });
      }
    }

    // Fetch all of the system.account data for all of the accounts that have a vesting lock
    // (i.e., all accounts found in accountVestingLockData)
    const systemAccounts = await this.api.query.system.account.multi(
      accountVestingLockData.map(({ address }) => address)
    );

    // Loop through systemAccount data and calculate the total locked
    // amount by summing the smallest of the following:
    // - the vesting lock value
    // - the free balance
    const totalLockedAmount = systemAccounts.reduce((accumulator, systemAccount, index) => {
      // The reasoning behind the following line is:
      // - the total amount of tokens in an account is the sum of the free and reserved balance
      //   -> but, the locks only apply to the free portion of that sum
      // - however, there is a bug which can cause vesting lock amounts to be
      //   much greater than the actual (free) account balance
      // - so, the total amount of vesting-locked tokens that exist in an account is
      //   the minimum value between the vesting lock value and the free balance
      //   (i.e., accountVestingLockData[index].amount and systemAccount.data.free in this case)
      return accumulator.add(BN.min(accountVestingLockData[index].amount, systemAccount.data.free));
    }, new BN(0));

    // Fetch the current total supply of tokens
    const totalSupply = await this.totalIssuanceInJOY();

    // Subtract the total supply from the total locked amount to get
    // the amount of tokens that are currently in circulation.
    return totalSupply - this.toJOY(totalLockedAmount);
  }

  async getValidatorReward(startBlockHash: HexString, endBlockHash: HexString) {
    let totalReward = 0;
    const startEra = Number(
      (await (await this.api.at(startBlockHash)).query.staking.activeEra()).unwrap().index
    );
    const endEra = Number(
      (await (await this.api.at(endBlockHash)).query.staking.activeEra()).unwrap().index
    );
    for (let i = startEra; i <= endEra; i++) {
      const reward = await (await this.api.at(endBlockHash)).query.staking.erasValidatorReward(i);

      if (!reward.isNone) {
        totalReward += this.toJOY(reward.unwrap());
      }
    }
    return totalReward;
  }

  async getYearOfValidatorRewards() {
    const finalizedHeadHash = await this.finalizedHash();
    const { number: blockNumber } = await this.api.rpc.chain.getHeader(`${finalizedHeadHash}`);
    const currentBlock = blockNumber.toBn();

    // Calculate block for exactly 1 year ago
    const startBlockHash = await this.api.rpc.chain.getBlockHash(
      currentBlock.subn((365 * 24 * 60 * 60) / 6)
    );
    const endBlockHash = await this.api.rpc.chain.getBlockHash(currentBlock);

    return await this.getValidatorReward(startBlockHash.toHex(), endBlockHash.toHex());
  }

  async APR() {
    const activeValidatorAddresses = await this.api.query.session.validators();
    const validators = await this.api.query.staking.validators.entries();
    const activeValidators = validators.filter(([key, _]) =>
      activeValidatorAddresses.includes(key.args[0].toString())
    );

    const activeEra = await this.api.query.staking.activeEra();
    const erasRewards = await this.api.derive.staking.erasRewards();

    // Average reward in an era for one validator.
    const averageRewardInAnEra = erasRewards
      .reduce((acc, { eraReward }) => acc.add(eraReward), new BN(0))
      .divn(erasRewards.length)
      .divn(activeValidators.length);

    // Average total stake for one validator
    const averageTotalStakeInCurrentEra = (
      await this.api.query.staking.erasTotalStake(activeEra.unwrap().index.toNumber())
    )
      .toBn()
      .divn(activeValidators.length);

    // Average commission for one validator.
    const averageCommission = activeValidators
      .reduce((acc, validator) => acc.add(validator[1].commission.toBn()), new BN(0))
      .divn(activeValidators.length);

    const apr = perbillToPercent(
      averageRewardInAnEra
        .muln(ERAS_PER_YEAR)
        .mul(percentToPerbill(100).sub(averageCommission))
        .div(averageTotalStakeInCurrentEra)
    );

    return apr;
  }

  async getInflationPercentValue() {
    const finalizedHeadHash = await this.finalizedHash();
    const { number: blockNumber } = await this.api.rpc.chain.getHeader(`${finalizedHeadHash}`);
    const currentBlock = blockNumber.toBn();

    // Calculate block for exactly 1 year ago
    const blockHashAYearAgo = await this.api.rpc.chain.getBlockHash(
      currentBlock.subn((365 * 24 * 60 * 60) / 6)
    );

    const totalSupplyAYearAgo = await this.totalIssuanceInJOY(blockHashAYearAgo);
    const totalSupply = await this.totalIssuanceInJOY();

    return ((totalSupply - totalSupplyAYearAgo) / totalSupplyAYearAgo) * 100;
  }
}
