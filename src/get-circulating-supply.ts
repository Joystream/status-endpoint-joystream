// Thoughts on what I need to do:
// So, idea is to find out the transferrable balance for every on-chain account and add it up.

import { JoyApi } from "./joyApi";

const api = new JoyApi();

const getCirculatingSupply = async () => {
  await api.init;

  const circulatingSupply = await api.calculateCirculatingSupply();

  return { circulatingSupply };
};

export default getCirculatingSupply;
