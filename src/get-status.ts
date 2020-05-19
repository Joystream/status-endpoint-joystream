import { JoyApi } from "./joyApi";
import { PromiseAllObj } from "./utils";

const api = new JoyApi();

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
