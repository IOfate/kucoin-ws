/* eslint-disable no-console */
import parseDuration from 'parse-duration';

import { KuCoinWs } from '../src/index.js';
import { delay } from '../src/util.js';

const main = async () => {
  const client = new KuCoinWs();

  client.on('error', (data) => console.error(data));
  client.on('reconnect', (log) => console.log(log));
  client.on('subscriptions', (subList) => console.log(`subscriptions: ${subList.length}`));
  const unSubFn = client.on('ticker-BTC/USDT', (tickerBtc) => console.log(tickerBtc));
  client.on('candle-BTC/USDT-1m', (candleBtc) => console.log(candleBtc));

  await client.connect();
  client.subscribeTickers(['BTC/USDT', 'ETH/USDT']);
  client.subscribeTicker('LTC/USDT');
  client.subscribeTicker('FIL/USDT');
  client.subscribeTicker('VET/USDT');
  client.subscribeTicker('XRP/USDT');
  client.subscribeTicker('CRO/USDT');
  client.subscribeTicker('SOL/USDT');
  client.subscribeTicker('TRX/USDT');
  client.subscribeTicker('XTZ/USDT');
  client.subscribeTicker('ZIL/USDT');
  client.subscribeTicker('KSM/USDT');
  client.subscribeTicker('LINK/USDT');
  client.subscribeCandle('BTC/USDT', '1m');
  client.subscribeCandle('ETH/USDT', '1m');

  await delay(parseDuration('2s'));

  client.unsubscribeTicker('BTC/USDT');

  setTimeout(() => {
    client.unsubscribeCandle('BTC/USDT', '1m');
  }, parseDuration('2m'));

  unSubFn();
  console.log(client.getMapClientSubscriptionNumber());
};

main();
