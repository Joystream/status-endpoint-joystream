import { JoyApi } from "./joyApi";

const api = new JoyApi();

const getAddresses = async () => {
  await api.init;

  const addresses = await api.getAddresses();

  return { addresses };
};

export default getAddresses;
