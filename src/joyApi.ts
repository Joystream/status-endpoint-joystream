import '@joystream/types'
import { WsProvider, ApiPromise } from "@polkadot/api";
import { Balance, ChainProperties, Hash } from "@polkadot/types/interfaces";
import { config } from "dotenv";
import BN from "bn.js";
import fetch from "cross-fetch"
import { AnyJson } from "@polkadot/types/types";
import {
  PalletWorkingGroupGroupWorker as Worker,
  PalletReferendumReferendumStage as ReferendumStage,
  PalletCouncilCouncilStageUpdate as CouncilStageUpdate,
  PalletVestingVestingInfo,
  PalletStakingExposure,
} from '@polkadot/types/lookup'
import { Vec } from '@polkadot/types';
import { HexString } from '@polkadot/util/types';

// Init .env config
config();

// Query node
if(process.env.QUERY_NODE === undefined){
  throw new Error("Missing QUERY_NODE in .env!");
}
const QUERY_NODE = process.env.QUERY_NODE;
const VESTING_STRING_HEX = "0x76657374696e6720";
const ERAS_PER_DAY = 4;
const ERAS_PER_YEAR = ERAS_PER_DAY * 365

type SystemData = {
  chain: string
  nodeName: string
  nodeVersion: string
  peerCount: number
}

type CouncilData = {
  members_count: number
  election_stage: string
}

type ValidatorsData = {
  count: number
  validators: AnyJson
  total_stake: number // in JOY
}

type MembershipData = {
  platform_members: number
}

type RolesData = {
  storage_providers: number
}

type ForumData = {
  posts: number
  threads: number
}

type MediaData = {
  media_files: number | null
  size: number | null
  activeCurators: number
  channels: number | null
}

type RuntimeData = {
  spec_name: string
  impl_name: string
  spec_version: number
  impl_version: number
}

type NetworkStatus = {
  totalIssuance: number // In JOY
  vestingLockedIssuance: number // In JOY
  system: SystemData
  finalizedBlockHeight: number
  council: CouncilData,
  validators: ValidatorsData
  memberships: MembershipData
  roles: RolesData
  forum: ForumData
  media: MediaData
  runtimeData: RuntimeData
}

type Address = {
  recorded_at_block: number;
  recorded_at_time: string;
  total_balance: number
  transferrable_balance: number
  locked_balance: number
  vesting_lock: number
}

export class JoyApi {
  endpoint: string;
  tokenDecimals!: number;
  isReady: Promise<[ApiPromise, ChainProperties]>;
  api!: ApiPromise;

  protected cachedNetworkStatus: {
    cachedAtBlock: number
    value: NetworkStatus
  } | undefined

  constructor(endpoint?: string) {
    const wsEndpoint =
      endpoint || process.env.PROVIDER || "ws://127.0.0.1:9944";
    this.endpoint = wsEndpoint;
    this.isReady = (async () => {
      const api = await new ApiPromise({ provider: new WsProvider(wsEndpoint) })
        .isReadyOrError;
      const chainProperties = await api.rpc.system.properties()
      const result: [ApiPromise, ChainProperties] = [api, chainProperties]
      return result;
    })();
  }

  get init(): Promise<JoyApi> {
    return this.isReady.then(([api, chainProperties]) => {
      this.api = api;
      this.tokenDecimals = chainProperties.tokenDecimals.unwrap()[0].toNumber()
      return this;
    });
  }

  toJOY(hapi: BN): number {
    try {
      // <= 900719 JOY - we keep the decimals
      return hapi.toNumber() / Math.pow(10, this.tokenDecimals)
    } catch {
      // > 900719 JOY - we discard the decimals
      const joyValue = hapi.div(new BN(Math.pow(10, this.tokenDecimals)))

      // TODO: Temporary "fix". Root of problem needs to be found!
      // (context: function vestingLockedJOY() produces a *very* large value)
      if(joyValue.gte(new BN(Number.MAX_SAFE_INTEGER)))
        return Number.MAX_SAFE_INTEGER

      return joyValue.toNumber()
    }
  }

  toHAPI(joy: number): BN {
    if (joy * Math.pow(10, this.tokenDecimals) > Number.MAX_SAFE_INTEGER) {
      // > 900719 JOY - we discard the decimals
      return new BN(joy).mul(new BN(Math.pow(10, this.tokenDecimals)))
    } else {
      // <= 900719 JOY, we keep the decimals
      return new BN(Math.round(joy * Math.pow(10, this.tokenDecimals)))
    }
  }

  async qnQuery<T>(query: string): Promise<T | null> {
    // TODO: Typesafe QueryNodeApi
    try {
      const res = await fetch(QUERY_NODE, {
        method: 'POST',
        headers: { 'Content-type' : 'application/json' },
        body: JSON.stringify({ query })
      });

      if(res.ok){
        let responseData = (await res.json()).data;
        return responseData
      } else {
        console.error('Invalid query node response status', res.status)
      }
    } catch(e) {
      console.error('Query node fetch error:', e)
    }

    return null
  }

  async totalIssuanceInJOY(blockHash?: Hash): Promise<number> {
    const issuanceInHAPI =
      blockHash === undefined
        ? await this.api.query.balances.totalIssuance()
        : await this.api.query.balances.totalIssuance.at(blockHash);

    return this.toJOY(issuanceInHAPI)
  }

  async vestingLockedJOY(): Promise<number> {
    const finalizedHash = await this.finalizedHash()
    const { number: finalizedBlockHeight } = await this.api.rpc.chain.getHeader(finalizedHash)
    const vestingEntries = await this.api.query.vesting.vesting.entriesAt(finalizedHash)
    const getUnclaimableSum = (schedules: Vec<PalletVestingVestingInfo>) => (
      schedules.reduce(
        (sum, vesting) => {
          const claimableBlocks = finalizedBlockHeight.toNumber() - vesting.startingBlock.toNumber()
          if (claimableBlocks > 0) {
            const claimableAmount = vesting.perBlock.mul(new BN(claimableBlocks))
            return sum.add(vesting.locked.sub(claimableAmount))
          }
          return sum
        },
        new BN(0)
      )
    )
    const totalLockedHAPI = vestingEntries.reduce((sum, entry) =>
      sum.add(getUnclaimableSum(entry[1].unwrap())),
      new BN(0)
    )

    return this.toJOY(totalLockedHAPI)
  }

  async curators(): Promise<Worker[]> {
    return (await this.api.query.contentWorkingGroup.workerById.entries())
      .map(([, worker]) => worker.unwrap());
  }

  async activeCurators(): Promise<number> {
    return (await this.curators()).length;
  }

  async dataObjectsStats(
    storageDataObjects?: Array<{ size: string }>
  ): Promise<{ count: number; size: number }> {
    const stats = { count: 0, size: 0 }

    if (storageDataObjects) {
      stats.count = storageDataObjects.length
      stats.size = storageDataObjects.reduce((prev, { size }) => prev + Number(size), 0)

      return stats
    }

    // Supports size up to 8192 TB (because JS MAX_SAFE_INTEGER is 9007199254740991)
    (await this.api.query.storage.bags.entries())
      .forEach(([, bag]) => {
        stats.count += bag.objectsNumber.toNumber()
        stats.size += bag.objectsTotalSize.toNumber()
      });

    return stats
  }

  async systemData(): Promise<SystemData> {
    let peers = 0
    try {
      peers = (await this.api.rpc.system.peers()).length
    } catch(e) {
      console.warn(`api.rpc.system.peers not available on ${this.endpoint}`)
    }
    const [chain, nodeName, nodeVersion] = await Promise.all([
      this.api.rpc.system.chain(),
      this.api.rpc.system.name(),
      this.api.rpc.system.version(),
    ]);

    return {
      chain: chain.toString(),
      nodeName: nodeName.toString(),
      nodeVersion: nodeVersion.toString(),
      peerCount: peers,
    };
  }

  async finalizedHash() {
    return this.api.rpc.chain.getFinalizedHead();
  }

  async finalizedBlockHeight(): Promise<number> {
    const finalizedHash = await this.finalizedHash();
    const { number } = await this.api.rpc.chain.getHeader(`${finalizedHash}`);
    return number.toNumber();
  }

  async runtimeData(): Promise<RuntimeData> {
    const runtimeVersion = await this.api.rpc.state.getRuntimeVersion(
      `${await this.finalizedHash()}`
    );
    return {
      spec_name: runtimeVersion.specName.toString(),
      impl_name: runtimeVersion.implName.toString(),
      spec_version: runtimeVersion.specVersion.toNumber(),
      impl_version: runtimeVersion.implVersion.toNumber()
    };
  }

  parseElectionStage(electionStage: ReferendumStage, councilStage: CouncilStageUpdate): string {
    if (councilStage.stage.isIdle) {
      return "Not running";
    }

    if (councilStage.stage.isAnnouncing) {
      return "Announcing"
    }

    if (electionStage.isVoting) {
      return "Voting"
    }

    return "Revealing"
  }

  async councilData(): Promise<CouncilData> {
    const [councilMembers, electionStage, councilStage] = await Promise.all([
      this.api.query.council.councilMembers(),
      this.api.query.referendum.stage(),
      this.api.query.council.stage()
    ]);

    return {
      members_count: councilMembers.length,
      election_stage: this.parseElectionStage(electionStage, councilStage)
    };
  }

  async validatorsData(): Promise<ValidatorsData> {
    const validators = await this.api.query.session.validators();
    const era = await this.api.query.staking.currentEra();
    const totalStake = era.isSome ?
      await this.api.query.staking.erasTotalStake(era.unwrap())
      : new BN(0);

    return {
      count: validators.length,
      validators: validators.toJSON(),
      total_stake: this.toJOY(totalStake),
    };
  }

  async membershipData(): Promise<MembershipData> {
    // Member ids start from 0, so nextMemberId === number of members created
    const membersCreated = await this.api.query.members.nextMemberId();
    return {
      platform_members: membersCreated.toNumber(),
    };
  }

  async rolesData(): Promise<RolesData> {
    const storageWorkersCount = (await this.api.query.storageWorkingGroup.workerById.keys()).length

    return {
      // This includes the storage lead!
      storage_providers: storageWorkersCount
    };
  }

  async forumData(): Promise<ForumData> {
    const [nextPostId, nextThreadId] = (await Promise.all([
      this.api.query.forum.nextPostId(),
      this.api.query.forum.nextThreadId(),
    ]));

    return {
      posts: nextPostId.toNumber() - 1,
      threads: nextThreadId.toNumber() - 1,
    };
  }

  async mediaData(): Promise<MediaData> {
    const [qnData, activeCurators] = await Promise.all([
      this.qnQuery<{
        channelsConnection: { totalCount: number };
        storageDataObjects: Array<{ size: string }>;
      }>(`
        {
          channelsConnection {
            totalCount
          }
          storageDataObjects(limit: 99999999, where: { deletedAt_all: false }) {
            size
          }
        }
      `),
      this.activeCurators()
    ]);

    const channels = qnData ? qnData.channelsConnection.totalCount : (await this.api.query.content.channelById.keys()).length
    const { count: dataObjectsCount, size: dataObjectsSize } = await this.dataObjectsStats(qnData?.storageDataObjects)

    return {
      media_files: dataObjectsCount,
      size: dataObjectsSize,
      activeCurators,
      channels
    };
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
    const accountVestingLockData: AccountVestingLock[] = []

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
      const vestingLock = palletBalances.find(({ id }) => id.toString() === VESTING_STRING_HEX)

      // If there is a vesting lock, we store it into the accountVestingLockData array for later use.
      if(vestingLock) {
        accountVestingLockData.push({
          address: storageKey.args[0].toString(),
          amount: vestingLock.amount.toBn(),
        });
      }
    }

    // Fetch all of the system.account data for all of the accounts that have a vesting lock
    // (i.e., all accounts found in accountVestingLockData)
    const systemAccounts = await this.api.query.system.account.multi(accountVestingLockData.map(({ address }) => address));

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

  async getAddresses() {
    const finalizedHeadHash = await this.finalizedHash();
    const { number: blockNumber } = await this.api.rpc.chain.getHeader(`${finalizedHeadHash}`);
    const timestamp = await this.api.query.timestamp.now.at(finalizedHeadHash);
    const finalizedApi = await this.api.at(finalizedHeadHash);
    const currentBlock = blockNumber.toBn();
    const currentTime = (new Date(timestamp.toNumber())).toISOString();

    const lockData = await finalizedApi.query.balances.locks.entries();
    const systemAccounts = await finalizedApi.query.system.account.entries();
    const resultData = systemAccounts.reduce((acc, [key, account]) => {
      const address = key.args[0].toString();

      acc[address] = {
        tempAmount: new BN(0),
        tempAmount2: new BN(0),
        recorded_at_block: currentBlock.toNumber(),
        recorded_at_time: currentTime,
        total_balance: 0,
        transferrable_balance: 0,
        locked_balance: 0,
        vesting_lock: 0,
      };

      return acc;
    }, {} as {
      [key: string]: {
        tempAmount: BN;
        tempAmount2: BN;
      } & Address;
    });

    for (let [storageKey, palletBalances] of lockData) {
      let biggestLock = new BN(0);
      let biggestVestingLock = new BN(0);
      const address = storageKey.args[0].toString();

      for (let palletBalance of palletBalances) {
        if(palletBalance.amount.toBn().gt(biggestLock)) {
          biggestLock = palletBalance.amount.toBn();
        }

        if (
          palletBalance.id.toString() === VESTING_STRING_HEX &&
          palletBalance.amount.toBn().gt(biggestVestingLock)
        ) {
          biggestVestingLock = palletBalance.amount.toBn();
        }
      }

      if(biggestLock.gt(new BN(0))) {
        resultData[address].tempAmount = biggestLock;
      }

      if (biggestVestingLock.gt(new BN(0))) {
        resultData[address].vesting_lock = this.toJOY(biggestVestingLock);
        resultData[address].tempAmount2 = biggestVestingLock;
      }
    }

    systemAccounts.forEach(([key, account]) => {
      const address = key.args[0].toString();

      const totalBalance = this.toJOY(account.data.free);
      const lockedBalance = this.toJOY(
        BN.min(resultData[address].tempAmount, BN.min(account.data.free, account.data.miscFrozen))
      );
      resultData[address].total_balance = totalBalance;
      resultData[address].transferrable_balance = totalBalance - lockedBalance;
      resultData[address].locked_balance = lockedBalance;
      resultData[address].vesting_lock = this.toJOY(
        BN.min(resultData[address].tempAmount2, BN.min(account.data.free, account.data.miscFrozen))
      );
    });

    Object.keys(resultData).forEach((address) => { delete (resultData[address] as any).tempAmount; });
    Object.keys(resultData).forEach((address) => { delete (resultData[address] as any).tempAmount2; });

    return resultData as { [key: string]: Address };
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
    const startBlockHash = await this.api.rpc.chain.getBlockHash(currentBlock.subn((365 * 24 * 60 * 60) / 6));
    const endBlockHash = await this.api.rpc.chain.getBlockHash(currentBlock);

    return await this.getValidatorReward(startBlockHash.toHex(), endBlockHash.toHex());
  }

  // TODO: When calculating this, we need to consider a value that encompasses APR for each validator.
  // For this we could do just a simple average or a weighted average based on the amount of stake.
  async APR() {
    const validators = await this.api.query.staking.validators.entries();
    const validatorStashAddresses = await this.api.query.staking.bonded.multi(validators.map(([key]) => key.args[0].toString()));
    const validatorsInfo = validatorStashAddresses.map((address, index) => ({
      controllerAddress: validators[index][0].args[0].toString(),
      stashAddress: address.toString(),
      commission: validators[index][1].commission.toNumber() / 10_000_000,
    }));

    const activeEra = await this.api.query.staking.activeEra();
    const activeEraData = {
      index: activeEra.unwrap().index.toNumber(),
      start: activeEra.unwrap().start.unwrap().toNumber(),
    };

    const stakers = await Promise.all(
      validators.map(async (account) => {
        const staker = await this.api.query.staking.erasStakers(activeEraData.index, account[0].args[0]);

        return [account.toString(), staker] as [string, PalletStakingExposure];
      })
    );

    const staking = stakers.map(([account, staker]) => {
      const total = staker.total.toBn();
      const nominators = staker.others.map(nominator => ({
        address: nominator.who.toString(),
        stake: nominator.value.toBn(),
      }));

      return { staking: { total, own: staker.own.toBn(), nominators} };
    });

    const erasRewards = await this.api.derive.staking.erasRewards();
    const eraRewardPoints = await this.api.derive.staking.erasPoints();

    const validatorsRewards = eraRewardPoints.map((points, index) => {
      const era = points.era.toNumber();
      const reward = erasRewards[index];

      if(era !== reward?.era.toNumber()) {
        // TODO: Is this a good way to handle this?
        throw new Error(`era mismatch: ${era} !== ${reward?.era.toNumber()}`);
      }

      return {
        era,
        totalPoints: points.eraPoints.toNumber(),
        totalReward: reward.eraReward,
        individual:
          (Object.entries(points.validators)
            .map(([address, points]) => [address, points.toNumber()]) as [string, number][])
            .reduce((acc, [address, points]) => {
              acc[address] = points;

              return acc
          }, {} as { [key: string]: number })
      }
    })

    const data = validatorsInfo.map(({ controllerAddress, stashAddress, commission }, index) => {
      const rewardHistory = validatorsRewards.reduce((acc, {era, totalPoints, totalReward, individual}) => {
        if(!individual[stashAddress]) {
          return acc
        };

        const eraPoints = Number(individual[stashAddress]);

        return [
          ...acc,
          {
            era,
            eraPoints,
            eraReward: totalReward.muln(eraPoints / totalPoints),
          }
        ]
      }, [] as { era: number, eraReward: BN, eraPoints: number}[]);

      const apr = staking.map(({ staking }) => {
        if(staking.total.isZero())
          return 0;

        const averageReward = rewardHistory.reduce((acc, { eraReward}) => acc.add(eraReward), new BN(0)).divn(rewardHistory.length);
        const apr = Number(averageReward.muln(ERAS_PER_YEAR).muln(commission).div(staking.total));

        return apr;
      });

      return apr;
    });
  }

  protected async fetchNetworkStatus(): Promise<NetworkStatus> {
    const [
      [
        totalIssuanceInJOY,
        system,
        finalizedBlockHeight,
        council,
        validators,
        memberships,
        roles,
        forum,
        media,
        vestingLockedJOY,
      ], [
        runtimeData
      ]
    ] = await Promise.all([
      // Split into chunks of 10, because the tsc compiler will use a tuple of size 10 as Promise.all generic 
      Promise.all([
        this.totalIssuanceInJOY(),
        this.systemData(),
        this.finalizedBlockHeight(),
        this.councilData(),
        this.validatorsData(),
        this.membershipData(),
        this.rolesData(),
        this.forumData(),
        this.mediaData(),
        this.vestingLockedJOY(),
      ]),
      Promise.all([
        this.runtimeData()
      ])
    ])
    return {
      totalIssuance: totalIssuanceInJOY,
      vestingLockedIssuance: vestingLockedJOY,
      system,
      finalizedBlockHeight,
      council,
      validators,
      memberships,
      roles,
      forum,
      media,
      runtimeData
    }
  }

  async getNetworkStatus(): Promise<NetworkStatus> {
    const currentBlock = (await this.api.derive.chain.bestNumber()).toNumber()
    if (currentBlock !== this.cachedNetworkStatus?.cachedAtBlock) {
      const status = await this.fetchNetworkStatus()
      this.cachedNetworkStatus = { cachedAtBlock: currentBlock, value: status }
    }
    return this.cachedNetworkStatus.value
  }
}
