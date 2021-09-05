# KuCoin WS

Node.js websocket client for KuCoin.
Websocket API documentation: https://docs.kucoin.com/#websocket-feed

## IOfate

This package is made by the IOfate company and is open source, feel free to use it, share it and contribute!

## Features

- [x] Price ticks
  - [x] Subscription
  - [x] Unsubscribe
- [] Candlesticks
  - [] Subscription
  - [] Unsubscribe
- [x] Send ping
- [x] Emit errors by sockets
- [x] Auto-reconnect

## Install

```
$ npm install @iofate/kucoin-ws
```

## How to use it

```js
import { KuCoinWs } from '@iofate/kucoin-ws';

const main = async () => {
  const client = new KuCoinWs();
  const symbol = 'BTC/USDT';

  await client.connect();

  client.on(`ticker-${symbol}`, ticker => console.log(ticker));
  client.on('error', error => console.error(error));

  client.subscribeTicker(symbol);
};

main();
```

## API

This package export one class `KuCoinWs` which extend from [Emittery](https://www.npmjs.com/package/emittery), which allow us to dispatch and listen events.
More information about Emittery API here: https://github.com/sindresorhus/emittery#api


### kuCoinWs = new KuCoinWs()

Create a new instance of KuCoinWs.

### kuCoinWs.connect()

Open KuCoin websockets. **Must be called before any subscription!**

Returns a promise.

```js
import { KuCoinWs } from '@iofate/kucoin-ws';

const kuCoinWs = new KuCoinWs();

await kuCoinWs.connect();
```

### kuCoinWs.subscribeTicker(symbol)

Subscribe to the websocket ticker of the chosen symbol.
Once called you'll be able to listen to ticker events for this symbol.
**`connect` method must be called before calling this one.**

```js
import { KuCoinWs } from '@iofate/kucoin-ws';

const kuCoinWs = new KuCoinWs();

await kuCoinWs.connect();
kuCoinWs.subscribeTicker('BTC/USDT');
kuCoinWs.on('ticker-BTC/USDT', ticker => console.log(ticker));
```

### kuCoinWs.unsubscribeTicker(symbol)

Unsubscribe from the ticker websocket of the associated symbol.
Once called no more events will be dispatched.

```js
import { KuCoinWs } from '@iofate/kucoin-ws';

const kuCoinWs = new KuCoinWs();

await kuCoinWs.open();
kuCoinWs.subscribeTicker('BTC/USDT');
const stopListenFn = kuCoinWs.on('ticker-BTC/USDT', ticker => console.log(ticker));
kuCoinWs.unsubscribeTicker('BTC/USDT');
stopListenFn();
```
