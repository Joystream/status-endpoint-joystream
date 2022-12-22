import '@joystream/types'
import { WsProvider, ApiPromise } from "@polkadot/api";
import { Burn, db, Exchange, PoolChange, Schema } from "./db";
import { ChainProperties, Hash } from "@polkadot/types/interfaces";
import { Keyring } from "@polkadot/keyring";
import { config } from "dotenv";
import BN from "bn.js";
import { log } from './debug';
import fetch from "cross-fetch"
import { AnyJson } from "@polkadot/types/types";
import {
  PalletWorkingGroupGroupWorker as Worker,
  PalletReferendumReferendumStage as ReferendumStage,
  PalletCouncilCouncilStageUpdate as CouncilStageUpdate,
  PalletVestingVestingInfo
} from '@polkadot/types/lookup'
import { calcPrice } from './utils';
import { JOYSTREAM_ADDRESS_PREFIX } from '@joystream/types'
import { Vec } from '@polkadot/types';

// Init .env config
config();

// Burn key pair generation
const burnSeed = process.env.BURN_ADDRESS_SEED;
const keyring = new Keyring({ ss58Format: JOYSTREAM_ADDRESS_PREFIX });
if (burnSeed === undefined) {
  throw new Error("Missing BURN_ADDRESS_SEED in .env!");
}
keyring.addFromMnemonic(burnSeed);
export const BURN_PAIR = keyring.getPairs()[0];
export const BURN_ADDRESS = BURN_PAIR.address;

log("BURN ADDRESS:", BURN_ADDRESS);

// Query node
if(process.env.QUERY_NODE === undefined){
  throw new Error("Missing QUERY_NODE in .env!");
}
const QUERY_NODE = process.env.QUERY_NODE;

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

type DollarPoolData = {
  size: number
  replenishAmount: number
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
  dollarPool: DollarPoolData
  exchanges: Exchange[]
  burns: Burn[]
  burnAddressBalance: number
  extecutedBurnsAmount: number
  price: number
  dollarPoolChanges: PoolChange[]
  totalUSDPaid: number
  runtimeData: RuntimeData
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
      return hapi.div(new BN(Math.pow(10, this.tokenDecimals))).toNumber()
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

  async dataObjectsStats(): Promise<{ count: number, size: number }> {
    // Supports size up to 8192 TB (because JS MAX_SAFE_INTEGER is 9007199254740991)
    const stats = { count: 0, size: 0 };
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
    const [qnData, activeCurators, { count: dataObjectsCount, size: dataObjectsSize }] = await Promise.all([
      this.qnQuery<{
        channelsConnection: { totalCount: number },
      }>(`
        {
          channelsConnection {
            totalCount
          }
        }
      `),
      this.activeCurators(),
      this.dataObjectsStats()
    ]);

    const channels = qnData ? qnData.channelsConnection.totalCount : (await this.api.query.content.channelById.keys()).length

    return {
      media_files: dataObjectsCount,
      size: dataObjectsSize,
      activeCurators,
      channels
    };
  }

  async dollarPool(): Promise<DollarPoolData> {
    const { sizeDollarPool = 0, replenishAmount = 0 } = (await db).valueOf() as Schema;

    return {
      size: sizeDollarPool,
      replenishAmount,
    };
  }

  async price(blockHash?: Hash, dollarPoolSize?: number): Promise<number> {
    const issuanceInJOY = await this.totalIssuanceInJOY(blockHash);
    const pool = dollarPoolSize !== undefined
      ? dollarPoolSize
      : (await this.dollarPool()).size;

    return calcPrice(issuanceInJOY, pool);
  }

  async exchanges(): Promise<Exchange[]> {
    const { exchanges = [] } = (await db).valueOf() as Schema;
    return exchanges;
  }

  async burns(): Promise<Burn[]> {
    const { burns = [] } = (await db).valueOf() as Schema;
    return burns;
  }

  async burnAddressBalanceInHAPI(): Promise<BN> {
    const burnAddrInfo = await this.api.query.system.account(BURN_ADDRESS);

    // An account needs to constantly have a minimum of EXISTENTIAL_DEPOSIT to be deemed active
    // and we therefore don't want to try and burn the whole balance but rather try to keep the
    // account balance at the EXISTENTIAL_DEPOSIT amount.

    const freeBalance = burnAddrInfo.data.free;
    const EXISTENTIAL_DEPOSIT = this.api.consts.balances.existentialDeposit;

    return BN.max(new BN(0), freeBalance.sub(EXISTENTIAL_DEPOSIT))
  }

  async executedBurnsAmount(): Promise<number> {
    return (await this.burns()).reduce((sum, burn) => sum += burn.amount, 0);
  }

  async dollarPoolChanges(): Promise<PoolChange[]> {
    const { poolChangeHistory } = (await db).valueOf() as Schema;
    return poolChangeHistory || [];
  }

  async totalUSDPaid(): Promise<number> {
    const { totalUSDPaid } = (await db).valueOf() as Schema
    return totalUSDPaid || 0
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
        dollarPool,
      ], [
        vestingLockedJOY,
        exchanges,
        burns,
        burnAddressBalanceInHAPI,
        extecutedBurnsAmount,
        price,
        dollarPoolChanges,
        totalUSDPaid,
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
        this.dollarPool()
      ]),
      Promise.all([
        this.vestingLockedJOY(),
        this.exchanges(),
        this.burns(),
        this.burnAddressBalanceInHAPI(),
        this.executedBurnsAmount(),
        this.price(),
        this.dollarPoolChanges(),
        this.totalUSDPaid(),
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
      dollarPool,
      exchanges,
      burns,
      burnAddressBalance: this.toJOY(burnAddressBalanceInHAPI),
      extecutedBurnsAmount,
      price,
      dollarPoolChanges,
      totalUSDPaid,
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
