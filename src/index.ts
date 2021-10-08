import { randomBytes } from 'crypto';
import Emittery from 'emittery';
import WebSocket from 'ws';
import got from 'got';
import queue from 'queue';

/** Models */
import { PublicToken } from './models/public-token.model';
import { MessageData } from './models/message-data.model';
import { RawTicker } from './models/raw-ticker';
import { Ticker } from './models/ticker';
import { Candle } from './models/candle';

/** Root */
import { delay } from './util';

export class KuCoinWs extends Emittery {
  private readonly queueProcessor = queue({ concurrency: 1, timeout: 250, autostart: true });
  private readonly rootApi = 'openapi-v2.kucoin.com';
  private readonly publicBulletEndPoint = 'https://openapi-v2.kucoin.com/api/v1/bullet-public';
  private readonly lengthConnectId = 24;
  private readonly retryTimeoutMs = 5000;
  private readonly mapCandleInterval = {
    '1m': '1min',
    '3m': '3min',
    '15m': '15min',
    '30m': '30min',
    '1h': '1hour',
    '2h': '2hour',
    '4h': '4hour',
    '6h': '6hour',
    '8h': '8hour',
    '12h': '12hour',
    '1d': '1day',
    '1w': '1week',
  };
  private ws: WebSocket;
  private socketOpen: boolean;
  private socketConnecting: boolean;
  private askingClose: boolean;
  private connectId: string;
  private pingIntervalMs: number;
  private pingTimer: NodeJS.Timer;
  private wsPath: string;
  private subscriptions: string[] = [];
  private currentCandles: { [candleKey: string]: Candle };

  constructor() {
    super();
    this.socketOpen = false;
    this.askingClose = false;
  }

  async connect(): Promise<void> {
    this.socketConnecting = true;
    const response = await got
      .post(this.publicBulletEndPoint, { headers: { host: this.rootApi } })
      .json<PublicToken>();

    if (!response.data || !response.data.token) {
      this.socketConnecting = false;
      throw new Error('Invalid public token from KuCoin');
    }

    const { token, instanceServers } = response.data;
    const { endpoint, pingInterval } = instanceServers[0];

    this.askingClose = false;
    this.currentCandles = {};
    this.connectId = randomBytes(this.lengthConnectId).toString('hex');
    this.pingIntervalMs = pingInterval;
    this.wsPath = `${endpoint}?token=${token}&connectId=${this.connectId}`;

    await this.openWebsocketConnection();

    if (this.subscriptions.length) {
      this.restartPreviousSubscriptions();
    }
  }

  subscribeTicker(symbol: string): void {
    this.requireSocketToBeOpen();
    const formatSymbol = symbol.replace('/', '-');
    const indexSubscription = `ticker-${symbol}`;

    if (this.subscriptions.includes(indexSubscription)) {
      return;
    }

    this.subscriptions.push(indexSubscription);
    this.emit('subscriptions', this.subscriptions);

    if (!this.ws.readyState) {
      this.emit('socket-not-ready', `socket not ready to subscribe ticker for: ${symbol}`);

      return;
    }

    this.queueProcessor.push(() => {
      this.send(
        JSON.stringify({
          id: Date.now(),
          type: 'subscribe',
          topic: `/market/ticker:${formatSymbol}`,
          privateChannel: false,
          response: true,
        }),
      );
    });
  }

  unsubscribeTicker(symbol: string): void {
    this.requireSocketToBeOpen();
    const formatSymbol = symbol.replace('/', '-');
    const indexSubscription = `ticker-${symbol}`;

    if (!this.subscriptions.includes(indexSubscription)) {
      return;
    }

    this.queueProcessor.push(() => {
      this.send(
        JSON.stringify({
          id: Date.now(),
          type: 'unsubscribe',
          topic: `/market/ticker:${formatSymbol}`,
          privateChannel: false,
          response: true,
        }),
      );
    });
    this.subscriptions = this.subscriptions.filter((fSub: string) => fSub !== indexSubscription);
    this.emit('subscriptions', this.subscriptions);
  }

  subscribeCandle(symbol: string, interval: string): void {
    this.requireSocketToBeOpen();
    const formatSymbol = symbol.replace('/', '-');
    const formatInterval = this.mapCandleInterval[interval];

    if (!formatInterval) {
      throw new TypeError(
        `Wrong format waiting for: ${Object.keys(this.mapCandleInterval).join(', ')}`,
      );
    }

    const indexSubscription = `candle-${symbol}-${interval}`;

    if (this.subscriptions.includes(indexSubscription)) {
      return;
    }

    this.subscriptions.push(indexSubscription);
    this.emit('subscriptions', this.subscriptions);

    if (!this.ws.readyState) {
      this.emit(
        'socket-not-ready',
        `socket not ready to subscribe candle for: ${symbol} ${interval}`,
      );

      return;
    }

    this.queueProcessor.push(() => {
      this.send(
        JSON.stringify({
          id: Date.now(),
          type: 'subscribe',
          topic: `/market/candles:${formatSymbol}_${formatInterval}`,
          privateChannel: false,
          response: true,
        }),
      );
    });
  }

  unsubscribeCandle(symbol: string, interval: string): void {
    this.requireSocketToBeOpen();
    const formatSymbol = symbol.replace('/', '-');
    const formatInterval = this.mapCandleInterval[interval];

    if (!formatInterval) {
      throw new TypeError(
        `Wrong format waiting for: ${Object.keys(this.mapCandleInterval).join(', ')}`,
      );
    }

    const indexSubscription = `candle-${symbol}-${interval}`;

    if (!this.subscriptions.includes(indexSubscription)) {
      return;
    }

    this.queueProcessor.push(() => {
      this.send(
        JSON.stringify({
          id: Date.now(),
          type: 'unsubscribe',
          topic: `/market/candles:${formatSymbol}_${formatInterval}`,
          privateChannel: false,
          response: true,
        }),
      );
    });

    this.subscriptions = this.subscriptions.filter((fSub: string) => fSub !== indexSubscription);
    delete this.currentCandles[indexSubscription];
    this.emit('subscriptions', this.subscriptions);
  }

  closeConnection(): void {
    if (this.subscriptions.length) {
      throw new Error(`You have activated subscriptions! (${this.subscriptions.length})`);
    }

    this.askingClose = true;
    this.ws.close();
  }

  isSocketOpen(): boolean {
    return this.socketOpen;
  }

  isSocketConnecting(): boolean {
    return this.socketConnecting;
  }

  getSubscriptionNumber(): number {
    return this.subscriptions.length;
  }

  private send(data: string) {
    if (!this.ws) {
      return;
    }

    this.ws.send(data);
  }

  private restartPreviousSubscriptions() {
    if (!this.socketOpen) {
      return;
    }

    if (!this.ws.readyState) {
      this.emit('socket-not-ready', 'retry later to restart previous subscriptions');
      setTimeout(() => this.restartPreviousSubscriptions(), this.retryTimeoutMs);

      return;
    }

    const previousSubs = [].concat(this.subscriptions);
    this.subscriptions.length = 0;

    for (const subscription of previousSubs) {
      const [type, symbol, timeFrame] = subscription.split('-');

      if (type === 'ticker') {
        this.subscribeTicker(symbol);
      }

      if (type === 'candle') {
        this.subscribeCandle(symbol, timeFrame);
      }
    }
  }

  private requireSocketToBeOpen(): void {
    if (!this.socketOpen) {
      throw new Error('Please call connect before subscribing');
    }
  }

  private sendPing() {
    this.requireSocketToBeOpen();
    this.send(
      JSON.stringify({
        id: Date.now(),
        type: 'ping',
      }),
    );
  }

  private startPing() {
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => this.sendPing(), this.pingIntervalMs);
  }

  private stopPing() {
    clearInterval(this.pingTimer);
  }

  private processRawTicker(symbol: string, rawTicker: RawTicker) {
    const ticker: Ticker = {
      symbol,
      info: rawTicker,
      timestamp: rawTicker.time,
      datetime: new Date(rawTicker.time).toUTCString(),
      high: Number(rawTicker.bestAsk),
      low: Number(rawTicker.bestBid),
      ask: Number(rawTicker.bestAsk),
      bid: Number(rawTicker.bestBid),
      last: Number(rawTicker.price),
      close: Number(rawTicker.price),
    };

    this.emit(`ticker-${symbol}`, ticker);
  }

  private reverseInterval(kuCoinInterval: string): string {
    const keyArray = Object.keys(this.mapCandleInterval);
    const valueArray = Object.values<string>(this.mapCandleInterval);
    const index = valueArray.indexOf(kuCoinInterval);

    if (index === -1) {
      throw new Error(`Unable to map KuCoin candle interval: ${kuCoinInterval}`);
    }

    return keyArray[index];
  }

  private getCandle(symbol: string, rawCandle: string[]): Candle {
    const [, rawOpenPrice, rawClosePrice, rawHighPrice, rawLowPrice, rawVolume] = rawCandle;

    const candle: Candle = {
      info: rawCandle,
      symbol,
      close: Number(rawClosePrice),
      high: Number(rawHighPrice),
      low: Number(rawLowPrice),
      open: Number(rawOpenPrice),
      volume: Number(rawVolume),
    };

    return candle;
  }

  private processCandleUpdate(symbol: string, interval: string, rawCandle: string[]) {
    const keyCandle = `candle-${symbol}-${interval}`;
    const candle = this.getCandle(symbol, rawCandle);

    this.currentCandles[keyCandle] = candle;
  }

  private processCandleAdd(symbol: string, interval: string, rawCandle: string[]) {
    const keyCandle = `candle-${symbol}-${interval}`;
    const candle = this.getCandle(symbol, rawCandle);

    if (this.currentCandles[keyCandle]) {
      this.emit(keyCandle, this.currentCandles[keyCandle]);
    }

    this.currentCandles[keyCandle] = candle;
  }

  private processMessage(message: string) {
    const received = JSON.parse(message) as MessageData;

    if (received.type === 'error') {
      const error = new Error(received.data);

      this.emit('error', error);
    }

    if (received.subject === 'trade.ticker') {
      const symbol = received.topic.split('/market/ticker:').pop().replace('-', '/');

      this.processRawTicker(symbol, received.data);
    }

    if (received.subject === 'trade.candles.update') {
      const symbol = received.data.symbol.replace('-', '/');
      const interval = this.reverseInterval(received.topic.split('_').pop());

      this.processCandleUpdate(symbol, interval, received.data.candles);
    }

    if (received.subject === 'trade.candles.add') {
      const symbol = received.data.symbol.replace('-', '/');
      const interval = this.reverseInterval(received.topic.split('_').pop());

      this.processCandleAdd(symbol, interval, received.data.candles);
    }
  }

  private async reconnect() {
    await delay(this.retryTimeoutMs);
    this.emit('reconnect', `reconnect with ${this.subscriptions.length} sockets...`);
    this.connect();
  }

  private openWebsocketConnection(): Promise<void> {
    if (this.socketOpen) {
      return;
    }

    this.ws = new WebSocket(this.wsPath, {
      perMessageDeflate: false,
      handshakeTimeout: this.retryTimeoutMs,
    });

    this.ws.on('message', (data: string) => {
      this.processMessage(data);
    });

    this.ws.on('close', () => {
      this.queueProcessor.end();
      this.socketOpen = false;
      this.stopPing();
      this.ws = undefined;

      if (!this.askingClose) {
        this.reconnect();
      }
    });

    this.ws.on('error', (ws: WebSocket, error: Error) => {
      this.emit('error', error);
    });

    return new Promise((resolve) => {
      this.ws.on('open', () => {
        this.socketOpen = true;
        this.socketConnecting = false;
        this.startPing();
        resolve();
      });
    });
  }
}
