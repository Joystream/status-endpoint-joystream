import { JoyApi } from "./joyApi";
import { PromiseAllObj } from "./utils";

const api = new JoyApi();

export async function getStatus() {
  await api.init;

  const status = await PromiseAllObj({
    totalIssuance: await api.totalIssuance(),
    system: await api.systemData(),
    finalizedBlockHeight: await api.finalizedBlockHeight(),
    council: await api.councilData(),
    validators: await api.validatorsData(),
    memberships: await api.membershipData(),
    roles: await api.rolesData(),
    forum: await api.forumData(),
    media: await api.mediaData(),
    dollarPool: await api.dollarPool(),
    exchanges: await api.exchanges(),
    burns: await api.burns(),
    burnAddressBalance: await api.burnAddressBalance(),
    extecutedBurnsAmount: await api.executedBurnsAmount(),
    price: await api.price(),
    dollarPoolChanges: await api.dollarPoolChanges(),
    totalUSDPaid: await api.totalUSDPaid()
  });

  return status;
}
