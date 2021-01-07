import { WsProvider, ApiPromise } from "@polkadot/api";
import { types } from "@joystream/types";
import { db, Schema } from "./db";
import { Hash } from "@polkadot/types/interfaces";
import { Keyring } from "@polkadot/keyring";
import { config } from "dotenv";
import BN from "bn.js";
import { log } from './debug';

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

export class JoyApi {
  endpoint: string;
  isReady: Promise<ApiPromise>;
  api!: ApiPromise;

  constructor(endpoint?: string) {
    const wsEndpoint =
      endpoint || process.env.PROVIDER || "ws://127.0.0.1:9944";
    this.endpoint = wsEndpoint;
    this.isReady = (async () => {
      const api = await new ApiPromise({ provider: new WsProvider(wsEndpoint), types })
        .isReady;
      return api;
    })();
  }
  get init(): Promise<JoyApi> {
    return this.isReady.then((instance) => {
      this.api = instance;
      return this;
    });
  }

  async totalIssuance(blockHash?: Hash) {
    const issuance =
      blockHash === undefined
        ? await this.api.query.balances.totalIssuance()
        : await this.api.query.balances.totalIssuance.at(blockHash);

    return issuance.toNumber();
  }

  async contentDirectorySize() {
    const contentIds = await this.api.query.dataDirectory.knownContentIds();
    return (
      await Promise.all(
        contentIds.map((id) =>
          this.api.query.dataDirectory.dataObjectByContentId(id)
        )
      )
    )
    // Explicitly use getField('size') here instead of content.size (it interferes with Map.size since Struct extends Map)
      .map(dataObjOpt => dataObjOpt.unwrapOr(undefined)?.getField('size').toNumber() || 0)
      .reduce((sum, dataObjSize) => Number(sum) + dataObjSize, 0);
  }

  async curators() {
    return (await this.api.query.contentDirectoryWorkingGroup.workerById.entries())
      .map(([storageKey, worker]) => worker);
  }

  async activeCurators() {
    return (await this.curators()).length;
  }

  async systemData() {
    const [chain, nodeName, nodeVersion, peers] = await Promise.all([
      this.api.rpc.system.chain(),
      this.api.rpc.system.name(),
      this.api.rpc.system.version(),
      this.api.rpc.system.peers(),
    ]);

    return {
      chain: chain.toString(),
      nodeName: nodeName.toString(),
      nodeVersion: nodeVersion.toString(),
      peerCount: peers.length,
    };
  }

  async finalizedHash() {
    return this.api.rpc.chain.getFinalizedHead();
  }

  async finalizedBlockHeight() {
    const finalizedHash = await this.finalizedHash();
    const { number } = await this.api.rpc.chain.getHeader(`${finalizedHash}`);
    return number.toNumber();
  }

  async runtimeData() {
    const runtimeVersion = await this.api.rpc.state.getRuntimeVersion(
      `${await this.finalizedHash()}`
    );
    return {
      spec_name: runtimeVersion.specName,
      impl_name: runtimeVersion.implName,
      spec_version: runtimeVersion.specVersion,
    };
  }

  async councilData() {
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

  async validatorsData() {
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

  async membershipData() {
    // Member ids start from 0, so nextMemberId === number of members created
    const membersCreated = await this.api.query.members.nextMemberId();
    return {
      platform_members: membersCreated.toNumber(),
    };
  }

  async rolesData() {
    const storageWorkersCount = (await this.api.query.storageWorkingGroup.workerById.keys()).length

    return {
      // This includes the storage lead!
      storage_providers: storageWorkersCount
    };
  }

  async forumData() {
    const [nextPostId, nextThreadId] = (await Promise.all([
      this.api.query.forum.nextPostId(),
      this.api.query.forum.nextThreadId(),
    ]));

    return {
      posts: nextPostId.toNumber() - 1,
      threads: nextThreadId.toNumber() - 1,
    };
  }

  async mediaData() {
    // Retrieve media data
    const contentDirectory = await this.api.query.dataDirectory.knownContentIds();

    // query channel length directly from the query node
    let channels = null;

    const res = await fetch('https://hydra.joystream.org/graphql', {
      method: 'POST',
      headers: { 'Content-type' : 'application/json' },
      body: JSON.stringify({ query: `
        query { 
            channels  
            { 
              id 
            } 
          }
      `
      })
    });

    if(res.ok){
      channels = (await res.json()).data.channels.length;
    }

    const size = await this.contentDirectorySize();
    const activeCurators = await this.activeCurators();

    return {
      media_files: contentDirectory.length,
      size,
      activeCurators,
      channels
    };
  }

  async dollarPool() {
    const { sizeDollarPool = 0, replenishAmount = 0 } = (await db).valueOf() as Schema;

    return {
      size: sizeDollarPool,
      replenishAmount,
    };
  }

  async price(blockHash?: Hash, dollarPoolSize?: number) {
    const supply = await this.totalIssuance(blockHash);
    const pool = dollarPoolSize !== undefined
      ? dollarPoolSize
      : (await this.dollarPool()).size;

    return this.calcPrice(supply, pool);
  }

  calcPrice(totalIssuance: number, dollarPoolSize: number) {
    return dollarPoolSize / totalIssuance;
  }

  async exchanges() {
    const { exchanges = [] } = (await db).valueOf() as Schema;
    return exchanges;
  }

  async burns() {
    const { burns = [] } = (await db).valueOf() as Schema;
    return burns;
  }

  async burnAddressBalance() {
    const burnAddrInfo = await this.api.query.system.account(BURN_ADDRESS);
    return burnAddrInfo.data.free.toNumber(); // Free balance
  }

  async executedBurnsAmount() {
    return (await this.burns()).reduce((sum, burn) => sum += burn.amount, 0);
  }

  async dollarPoolChanges() {
    const { poolChangeHistory } = (await db).valueOf() as Schema;
    return poolChangeHistory;
  }
}
