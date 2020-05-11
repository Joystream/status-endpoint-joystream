import { JoyApi } from "./joyApi";
import { config } from "dotenv";
config();

const provider = process.env.PROVIDER || "ws://127.0.0.1:9944";

const api = new JoyApi(provider);

async function main() {
  await api.init;

  //   console.log(`Total Issuance: ${(await api.totalIssuance()).toNumber()}`);
  //   console.log(
  //     `Issuance Minus Burned: ${(await api.IssuanceMinusBurned()).toNumber()}`
  //   );

  //   console.log(
  //     `Total size of the content directory: ${await api.contentDirectorySize()}`
  //   );

  return api.activeCurators();
}
main()
  .then((res: any) => {
    console.log(res);
  })
  .catch(console.error)
  .finally(process.exit);
