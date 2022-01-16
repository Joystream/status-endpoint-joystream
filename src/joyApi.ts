import { WsProvider, ApiPromise } from "@polkadot/api";
import { types } from "@joystream/types";
import { Burn, db, Exchange, PoolChange, Schema } from "./db";
import { Hash } from "@polkadot/types/interfaces";
import { Keyring } from "@polkadot/keyring";
import { config } from "dotenv";
import BN from "bn.js";
import { log } from './debug';
import fetch from "cross-fetch"
import { AnyJson } from "@polkadot/types/types";
import { Worker } from "@joystream/types/working-group";

// Init .env config
config();

// Burn key pair generation
const burnSeed = process.env.BURN_ADDRESS_SEED;
const keyring = new Keyring();
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
  total_stake: number
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
  totalIssuance: number
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
  isReady: Promise<ApiPromise>;
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
      const api = await new ApiPromise({ provider: new WsProvider(wsEndpoint), types })
        .isReadyOrError;
      return api;
    })();
  }

  get init(): Promise<JoyApi> {
    return this.isReady.then((instance) => {
      this.api = instance;
      return this;
    });
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

  async totalIssuance(blockHash?: Hash): Promise<number> {
    const issuance =
      blockHash === undefined
        ? await this.api.query.balances.totalIssuance()
        : await this.api.query.balances.totalIssuance.at(blockHash);

    return issuance.toNumber();
  }

  async curators(): Promise<Worker[]> {
    return (await this.api.query.contentWorkingGroup.workerById.entries())
      .map(([, worker]) => worker);
  }

  async activeCurators(): Promise<number> {
    return (await this.curators()).length;
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

  async councilData(): Promise<CouncilData> {
    const [councilMembers, electionStage] = await Promise.all([
      this.api.query.council.activeCouncil(),
      this.api.query.councilElection.stage(),
    ]);

    return {
      members_count: councilMembers.length,
      election_stage: electionStage.isSome
        ? electionStage.unwrap().type
        : "Not Running",
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
      total_stake: totalStake.toNumber(),
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
    // query channel length directly from the query node
    let channels = null;
    let numberOfMediaFiles = null;
    let mediaFilesSize = null;
    let activeCurators = await this.activeCurators();

      const qnData = await this.qnQuery<{
        channelsConnection: { totalCount: number },
        storageDataObjectsConnection: { totalCount: number },
        storageBuckets: { dataObjectsSize: string }[],
      }>(`
        {
          channelsConnection {
            totalCount
          }
          storageDataObjectsConnection {
            totalCount
          }
          storageBuckets {
            dataObjectsSize
          }
        }
      `)


    if (qnData) {
        channels = qnData.channelsConnection.totalCount;
        numberOfMediaFiles = qnData.storageDataObjectsConnection.totalCount;
        mediaFilesSize = qnData.storageBuckets.reduce(
          (sum, bucket) => sum += parseInt(bucket.dataObjectsSize),
          0
        );
    }

    return {
      media_files: numberOfMediaFiles,
      size: mediaFilesSize,
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
    const supply = await this.totalIssuance(blockHash);
    const pool = dollarPoolSize !== undefined
      ? dollarPoolSize
      : (await this.dollarPool()).size;

    return this.calcPrice(supply, pool);
  }

  calcPrice(totalIssuance: number, dollarPoolSize: number): number {
    return dollarPoolSize / totalIssuance;
  }

  async exchanges(): Promise<Exchange[]> {
    const { exchanges = [] } = (await db).valueOf() as Schema;
    return exchanges;
  }

  async burns(): Promise<Burn[]> {
    const { burns = [] } = (await db).valueOf() as Schema;
    return burns;
  }

  async burnAddressBalance(): Promise<number> {
    const burnAddrInfo = await this.api.query.system.account(BURN_ADDRESS);
    return burnAddrInfo.data.free.toNumber(); // Free balance
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
        totalIssuance,
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
        exchanges,
        burns,
        burnAddressBalance,
        extecutedBurnsAmount,
        price,
        dollarPoolChanges,
        totalUSDPaid,
        runtimeData
      ]
    ] = await Promise.all([
      // Split into chunks of 10, because the tsc compiler will use a tuple of size 10 as Promise.all generic 
      Promise.all([
        this.totalIssuance(),
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
        this.exchanges(),
        this.burns(),
        this.burnAddressBalance(),
        this.executedBurnsAmount(),
        this.price(),
        this.dollarPoolChanges(),
        this.totalUSDPaid(),
        this.runtimeData()
      ])
    ])
    return {
      totalIssuance,
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
      burnAddressBalance,
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
