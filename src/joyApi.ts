import { WsProvider, ApiPromise } from "@polkadot/api";
import { u128, Vec, u32 } from "@polkadot/types";
import { registerJoystreamTypes } from "@joystream/types";
//import { Codec } from "@polkadot/types/types";

export class JoyApi {
  endpoint: string;
  isReady: Promise<ApiPromise>;
  api!: ApiPromise;

  constructor(endpoint: string) {
    this.endpoint = endpoint;
    this.isReady = (async () => {
      registerJoystreamTypes();
      const api = await new ApiPromise({ provider: new WsProvider(endpoint) })
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

  async totalIssuance() {
    const issuance = (await this.api.query.balances.totalIssuance()) as u128;
    return issuance;
  }

  async IssuanceMinusBurned() {
    const issuance = await this.totalIssuance();
    const burned = (await this.api.query.balances.freeBalance(
      process.env.JSGENESIS_ADDRESS
    )) as u128;

    return issuance.sub(burned);
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
}
