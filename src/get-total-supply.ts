import { JoyApi } from "./joyApi";

const api = new JoyApi();

const getTotalSupply = async () => {
  await api.init;

  const totalSupply = await api.totalIssuanceInJOY();

  return { totalSupply };
};

export default getTotalSupply;
