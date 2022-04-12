import { KuCoinWs } from '../src/index';
import { delay } from '../src/util';

const main = async () => {
  const client = new KuCoinWs();

  client.on('error', data => console.error(data));
  client.on('reconnect', log => console.log(log));
  client.on('subscriptions', subList => console.log(`subscriptions: ${subList.length}`));
  const unSubFn = client.on('ticker-BTC/USDT', tickerBtc => console.log(tickerBtc));
  client.on('candle-BTC/USDT-1m', candleBtc => console.log(candleBtc));

  await client.connect();
  client.subscribeTicker('BTC/USDT');
  client.subscribeTicker('ETH/USDT');
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
  client.subscribeTickers(['BTC/USDT', 'VET/USDT', 'XRP/USDT']);
  client.subscribeCandle('BTC/USDT', '1m');
  client.subscribeCandle('ETH/USDT', '1m');

  await delay(2000);

  client.unsubscribeTicker('BTC/USDT');
  client.unsubscribeTickers(['BTC/USDT', 'VET/USDT', 'XRP/USDT']);
  unSubFn();
};

main();
