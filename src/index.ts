import { randomBytes } from 'crypto';
import Emittery from 'emittery';
import WebSocket from 'ws';
import got from 'got';
import parseDuration from 'parse-duration';

/** Models */
import { PublicToken } from './models/public-token.model';
import { MessageData } from './models/message-data.model';
import { RawTicker } from './models/raw-ticker';
import { Ticker } from './models/ticker';
import { Candle } from './models/candle';

export class KuCoinWs extends Emittery {
  private readonly publicBulletEndPoint = 'https://openapi-v2.kucoin.com/api/v1/bullet-public';
  private readonly lengthConnectId = 24;
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
  private askingClose: boolean;
  private connectId: string;
  private pingIntervalMs: number;
  private pingTimer: NodeJS.Timer;
  private wsPath: string;
  private subscriptions: string[];
  private mapCandleTimestamp: { [candleKey: string]: number };

  constructor() {
    super();
    this.socketOpen = false;
    this.askingClose = false;
  }

  async connect(): Promise<void> {
    const response = await got.post(this.publicBulletEndPoint).json<PublicToken>();

    if (!response.data || !response.data.token) {
      throw new Error('Invalid public token from KuCoin');
    }

    const { token, instanceServers } = response.data;
    const { endpoint, pingInterval } = instanceServers[0];

    this.subscriptions = [];
    this.askingClose = false;
    this.mapCandleTimestamp = {};
    this.connectId = randomBytes(this.lengthConnectId).toString('hex');
    this.pingIntervalMs = pingInterval;
    this.wsPath = `${endpoint}?token=${token}&connectId=${this.connectId}`;

    await this.openWebsocketConnection();
  }

  subscribeTicker(symbol: string): void {
    this.requireSocketToBeOpen();
    const formatSymbol = symbol.replace('/', '-');
    const indexSubscription = `ticker-${formatSymbol}`;

    if (this.subscriptions.includes(indexSubscription)) {
      return;
    }

    this.ws.send(
      JSON.stringify({
        id: Date.now(),
        type: 'subscribe',
        topic: `/market/ticker:${formatSymbol}`,
        privateChannel: false,
        response: true,
      }),
    );
    this.subscriptions.push(indexSubscription);
  }

  unsubscribeTicker(symbol: string): void {
    this.requireSocketToBeOpen();
    const formatSymbol = symbol.replace('/', '-');
    const indexSubscription = `ticker-${formatSymbol}`;

    if (!this.subscriptions.includes(indexSubscription)) {
      return;
    }

    this.ws.send(
      JSON.stringify({
        id: Date.now(),
        type: 'unsubscribe',
        topic: `/market/ticker:${formatSymbol}`,
        privateChannel: false,
        response: true,
      }),
    );
    this.subscriptions = this.subscriptions.filter((fSub: string) => fSub !== indexSubscription);
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

    const indexSubscription = `candle-${formatSymbol}-${formatInterval}`;

    if (this.subscriptions.includes(indexSubscription)) {
      return;
    }

    this.ws.send(
      JSON.stringify({
        id: Date.now(),
        type: 'subscribe',
        topic: `/market/candles:${formatSymbol}_${formatInterval}`,
        privateChannel: false,
        response: true,
      }),
    );
    this.subscriptions.push(indexSubscription);
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

    const indexSubscription = `candle-${formatSymbol}-${formatInterval}`;

    if (!this.subscriptions.includes(indexSubscription)) {
      return;
    }

    delete this.mapCandleTimestamp[indexSubscription];
    this.ws.send(
      JSON.stringify({
        id: Date.now(),
        type: 'unsubscribe',
        topic: `/market/candles:${formatSymbol}_${formatInterval}`,
        privateChannel: false,
        response: true,
      }),
    );
    this.subscriptions = this.subscriptions.filter((fSub: string) => fSub !== indexSubscription);
  }

  closeConnection(): void {
    if (this.subscriptions.length) {
      throw new Error(`You have activated subscriptions! (${this.subscriptions.length})`);
    }

    this.askingClose = true;
    this.ws.close();
  }

  private requireSocketToBeOpen(): void {
    if (!this.socketOpen) {
      throw new Error('Please call connect before subscribing');
    }
  }

  private sendPing() {
    this.requireSocketToBeOpen();
    this.ws.send(
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

  private processRawCandle(symbol: string, interval: string, rawCandle: string[]) {
    const now = Date.now();
    const keyCandle = `candle-${symbol}-${interval}`;
    const intervalDuration = parseDuration(interval);
    const [rawStartCandle, rawOpenPrice, rawClosePrice, rawHighPrice, rawLowPrice, rawVolume] =
      rawCandle;
    const startTimeCandle = Number(rawStartCandle) * 1000;
    const endCandle = startTimeCandle + intervalDuration;
    const candle: Candle = {
      info: rawCandle,
      symbol,
      close: Number(rawClosePrice),
      high: Number(rawHighPrice),
      low: Number(rawLowPrice),
      open: Number(rawOpenPrice),
      volume: Number(rawVolume),
    };

    if (now >= endCandle && this.mapCandleTimestamp[keyCandle] !== startTimeCandle) {
      this.mapCandleTimestamp[keyCandle] = startTimeCandle;
      this.emit(keyCandle, candle);
    }
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

      this.processRawCandle(symbol, interval, received.data.candles);
    }
  }

  private openWebsocketConnection(): Promise<void> {
    if (this.socketOpen) {
      return;
    }

    this.ws = new WebSocket(this.wsPath);

    this.ws.on('message', (data: string) => {
      this.processMessage(data);
    });

    this.ws.on('close', () => {
      this.socketOpen = false;
      this.stopPing();

      if (!this.askingClose) {
        this.connect();
      }
    });

    this.ws.on('error', (ws: WebSocket, error: Error) => {
      this.emit('error', error);
    });

    return new Promise((resolve) => {
      this.ws.on('open', () => {
        this.socketOpen = true;
        this.startPing();
        resolve();
      });
    });
  }
}
