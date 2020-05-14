import { JoyApi } from "./joyApi";
import { PromiseAllObj } from "./utils";
import { config } from "dotenv";
config();

const provider = process.env.PROVIDER || "ws://127.0.0.1:9944";

const api = new JoyApi(provider);

export async function getStatus() {
  await api.init;

  const status = await PromiseAllObj({
    totalIssuance: (await api.totalIssuance()).toNumber(),
    actualIssuance: (await api.IssuanceMinusBurned()).toNumber(),
    burned: await api.burned(),
    system: await api.systemData(),
    block_height: await api.finalizedBlockHeight(),
    council: await api.councilData(),
    validators: await api.validatorsData(),
    memberships: await api.membershipData(),
    roles: await api.rolesData(),
    forum: await api.forumData(),
    media: await api.mediaData(),
    dollarPool: await api.dollarPool(),
    exchanges: await api.exchanges(),
    price: await api.price(),
  });

  return status;
}
