import { JoyApi } from "./joyApi";

const api = new JoyApi();

export async function getStatus() {
  await api.init;

  const status = await api.getNetworkStatus()

  return status;
}
