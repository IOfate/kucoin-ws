import { KuCoinWs } from '../src/index';

const main = async () => {
  const client = new KuCoinWs();

  await client.connect();
};

main();
