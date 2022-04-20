# KuCoin WS

[![Node.js CI](https://github.com/IOfate/kucoin-ws/actions/workflows/node.js.yml/badge.svg?branch=main)](https://github.com/IOfate/kucoin-ws/actions/workflows/node.js.yml)
[![npm version](https://img.shields.io/npm/v/@iofate/kucoin-ws)](https://www.npmjs.com/package/@iofate/kucoin-ws)

Node.js websocket client for KuCoin.
Websocket API documentation: https://docs.kucoin.com/#websocket-feed

## IOfate

This package is made by the IOfate company and is open source, feel free to use it, share it and contribute!

## Table of contents

- [Features](#features)
- [Install](#install)
- [How to use it](#how-to-use-it)
- [API](#api)
- [Contributing](#contributing)

## Features

- [x] Price ticks
  - [x] Subscription
  - [x] Unsubscribe
- [x] Candlesticks
  - [x] Subscription
  - [x] Unsubscribe
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

This package export one class `KuCoinWs` and extend from [Emittery](https://www.npmjs.com/package/emittery), which allow us to dispatch and listen events.
More information about Emittery API here: https://github.com/sindresorhus/emittery#api

### General events

There are several events which are emitted in different contexts.

- `subscriptions`: emitted when a new subscription is made or closed
- `socket-not-ready`: emitted when the socket is not ready to subscribe (will try to subscribe later)
- `reconnect`: emitted when a reconnection occurred
- `error`: emitted when an error occurred

```js
import { KuCoinWs } from '@iofate/kucoin-ws';

const kuCoinWs = new KuCoinWs();

client.on('subscriptions', subscriptions => console.log('update on subscriptions', subscriptions));
client.on('reconnect', () => console.log('a reconnection occurred'));
client.on('socket-not-ready', msg => console.warn('socket not ready', msg));
client.on('error', error => console.error(error));
```

### kuCoinWs = new KuCoinWs()

Create a new instance of KuCoinWs.

### kuCoinWs.connect()

Open KuCoin websockets. **Must be called before any subscription!**

Returns a promise. **Can throw errors**

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

### kuCoinWs.subscribeTickers(symbols)

Subscribe to the websocket ticker of a symbol list.
Once called you'll be able to listen to ticker events for all of those symbols.
**`connect` method must be called before calling this one.**

```js
import { KuCoinWs } from '@iofate/kucoin-ws';

const kuCoinWs = new KuCoinWs();

await kuCoinWs.connect();
kuCoinWs.subscribeTickers(['BTC/USDT', 'ETH/USDT']);
kuCoinWs.on('ticker-BTC/USDT', ticker => console.log(ticker));
kuCoinWs.on('ticker-ETH/USDT', ticker => console.log(ticker));
```

### kuCoinWs.unsubscribeTicker(symbol)

Unsubscribe from the ticker websocket of the associated symbol.
Once called no more events will be dispatched.

```js
import { KuCoinWs } from '@iofate/kucoin-ws';

const kuCoinWs = new KuCoinWs();

await kuCoinWs.connect();
kuCoinWs.subscribeTicker('BTC/USDT');
const stopListenFn = kuCoinWs.on('ticker-BTC/USDT', ticker => console.log(ticker));
kuCoinWs.unsubscribeTicker('BTC/USDT');
stopListenFn();
```

### kuCoinWs.unsubscribeTickers(symbols)

Unsubscribe from the ticker websocket for the list of symbols.
Once called no more events will be dispatched.

```js
import { KuCoinWs } from '@iofate/kucoin-ws';

const kuCoinWs = new KuCoinWs();

await kuCoinWs.connect();
kuCoinWs.subscribeTickers(['BTC/USDT', 'ETH/USDT']);
kuCoinWs.unsubscribeTickers(['BTC/USDT', 'ETH/USDT']);
```

### kuCoinWs.subscribeCandles(symbol, timeFrame)

Subscribe to the websocket candle of the chosen symbol and time frame.
Once called you'll be able to listen to candle events for this symbol.
**`connect` method must be called before calling this one.**

Valid time frame: `'1m', '3m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '1w', '1M'`

```js
import { KuCoinWs } from '@iofate/kucoin-ws';

const kuCoinWs = new KuCoinWs();

await kuCoinWs.connect();
kuCoinWs.subscribeCandles('BTC/USDT', '1d');
kuCoinWs.on('candle-BTC/USDT-1d', candle => console.log(candle));
```

### kuCoinWs.unsubscribeCandles(symbol, timeFrame)

Unsubscribe from the candle websocket of the associated symbol.
Once called no more events will be dispatched.

```js
import { KuCoinWs } from '@iofate/kucoin-ws';

const kuCoinWs = new KuCoinWs();

await kuCoinWs.connect();
kuCoinWs.subscribeCandles('BTC/USDT', '1d');
const stopListenFn = kuCoinWs.on('candle-BTC/USDT-1d', candle => console.log(candle));
kuCoinWs.unsubscribeCandles('BTC/USDT', '1d');
stopListenFn();
```

### kuCoinWs.closeConnection()

Close the connection between you and KuCoin.
**You must unsubscribe from everything before calling this method!**

### kuCoinWs.isSocketOpen()

Return a boolean which indicate if the socket is open or not.

### kuCoinWs.isSocketConnecting()

Return a boolean which indicate if the socket is connecting or not.

### kuCoinWs.getSubscriptionNumber()

Return the number of subscriptions.

## Contributing

Any merge request must follow [conventional commits](https://conventionalcommits.org/) format.
