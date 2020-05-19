import { WsProvider, ApiPromise } from "@polkadot/api";
import { u128, Vec, u32 } from "@polkadot/types";
import { registerJoystreamTypes } from "@joystream/types";
import { db } from "./db";
import BigNumber from "bignumber.js";
import { Hash } from "@polkadot/types/interfaces";
import { Keyring } from "@polkadot/keyring";
import { config } from "dotenv";

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

console.log("BURN ADDRESS:", BURN_ADDRESS);

export class JoyApi {
  endpoint: string;
  isReady: Promise<ApiPromise>;
  api!: ApiPromise;

  constructor(endpoint?: string) {
    const wsEndpoint =
      endpoint || process.env.PROVIDER || "ws://127.0.0.1:9944";
    this.endpoint = wsEndpoint;
    this.isReady = (async () => {
      registerJoystreamTypes();
      const api = await new ApiPromise({ provider: new WsProvider(wsEndpoint) })
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

    return issuance as u128;
  }

  async IssuanceMinusBurned(blockHash?: Hash) {
    const issuance = await this.totalIssuance(blockHash);
    const burnAddr = BURN_ADDRESS;
    const burned =
      blockHash === undefined
        ? await this.api.query.balances.freeBalance(burnAddr)
        : await this.api.query.balances.freeBalance.at(blockHash, burnAddr);

    return issuance.sub(burned as u128);
  }

  async contentDirectorySize() {
    let contentIds = (await this.api.query.dataDirectory.knownContentIds()) as Vec<
      u32
    >;
    return (
      await Promise.all(
        contentIds.map((id) =>
          this.api.query.dataDirectory.dataObjectByContentId(id)
        )
      )
    )
      .map((content: any) => content.toJSON())
      .reduce((sum, { size }) => Number(sum) + size, 0);
  }
  // TODO: This looks bad. Can it be improved with API methods?
  async curators(): Promise<any[]> {
    return [
      ...((await this.api.query.contentWorkingGroup.curatorById()) as any).entries(),
    ][1][1];
  }

  async activeCurators() {
    const curators = (await this.curators()).values();
    let activeCount = 0;
    for (let curator of curators) {
      let [stage] = Object.keys(curator.get("stage").toJSON());
      if (stage === "Active") {
        activeCount++;
      }
    }
    return activeCount;
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
    const [councilMembers, electionStage]: [any, any] = await Promise.all([
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
    const validators = (await this.api.query.session.validators()) as Vec<any>;

    let balances = (await Promise.all(
      validators.map((validator) =>
        this.api.query.balances.freeBalance(validator)
      )
    )) as u128[];
    let total_stake = balances.reduce(
      (sum: any, x: any) => sum.add(x),
      new u128(0)
    );

    return {
      count: validators.length,
      validators: validators.toJSON(),
      total_stake: total_stake.toNumber(),
    };
  }

  async membershipData() {
    const membersCreated = await this.api.query.members.membersCreated();
    return {
      platform_members: membersCreated.toJSON(),
    };
  }

  async rolesData() {
    const [storageProviders] = (await Promise.all([
      this.api.query.actors.actorAccountIds(),
    ])) as any;

    return {
      storage_providers: storageProviders.length,
    };
  }

  async forumData() {
    const [posts, threads] = (await Promise.all([
      this.api.query.forum.nextPostId(),
      this.api.query.forum.nextThreadId(),
    ])) as [any, any];

    return {
      posts: posts - 1,
      threads: threads - 1,
    };
  }

  async mediaData() {
    // Retrieve media data (will add size of content later)
    const [contentDirectory] = (await Promise.all([
      this.api.query.dataDirectory.knownContentIds(),
    ])) as any;

    const size = await this.contentDirectorySize();
    const activeCurators = await this.activeCurators();

    return {
      media_files: contentDirectory.length,
      size,
      activeCurators,
    };
  }

  async burned() {
    let { tokensBurned } = (await db).valueOf();
    return tokensBurned;
  }

  async dollarPool() {
    let { sizeDollarPool, replenishAmount } = (await db).valueOf() as any;

    return {
      size: sizeDollarPool,
      replenishAmount,
    };
  }

  async price(blockHash?: Hash, dollarPoolSize?: number) {
    let supply = new BigNumber(
      (await this.IssuanceMinusBurned(blockHash)).toNumber()
    );
    let size = new BigNumber(
      dollarPoolSize !== undefined
        ? dollarPoolSize
        : (await this.dollarPool()).size
    );

    return size.div(supply).toFixed();
  }

  async exchanges() {
    let { exchanges } = (await db).valueOf() as any;
    return exchanges;
  }
}
