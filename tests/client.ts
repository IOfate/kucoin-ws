import { KuCoinWs } from '../src/index';

const delay = async (time: number): Promise<void> => new Promise(resolve => setTimeout(resolve, time));
const main = async () => {
  const client = new KuCoinWs();

  client.on('error', data => console.error(data));
  const unSubFn = client.on('ticker-BTC/USDT', tickerBtc => console.log(tickerBtc));
  client.on('candle-BTC/USDT-1m', candleBtc => console.log(candleBtc));

  await client.connect();
  client.subscribeTicker('BTC/USDT');
  client.subscribeCandle('BTC/USDT', '1m');

  await delay(2000);
  client.unsubscribeTicker('BTC/USDT');
  unSubFn();
};

main();
