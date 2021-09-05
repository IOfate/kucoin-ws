import { KuCoinWs } from '../src/index';

const main = async () => {
  const client = new KuCoinWs();

  client.on('error', data => console.error(data));
  client.on('ticker-BTC/USDT', tickerBtc => console.log(tickerBtc));

  await client.connect();
  client.subscribeTicker('BTC/USDT');
};

main();
