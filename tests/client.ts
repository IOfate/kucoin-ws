import { KuCoinWs } from '../src/index';

const main = async () => {
  const client = new KuCoinWs();

  client.on('error', data => console.error(data));
  client.on('ticker-BTC/USDT', tickerBtc => console.log(tickerBtc));
  client.on('candle-BTC/USDT-1m', candleBtc => console.log(candleBtc));

  await client.connect();
  client.subscribeTicker('BTC/USDT');
  client.subscribeCandle('BTC/USDT', '1m');
};

main();
