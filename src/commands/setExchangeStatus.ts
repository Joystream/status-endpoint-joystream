import { setExchangeStatus } from '../setExchangeStatus';

async function main() {
  const index = parseInt(process.argv[2]);
  const status = process.argv[3];

  const error = await setExchangeStatus(index, status, true);

  if(error) {
    console.warn(error);
  }
}

main();
