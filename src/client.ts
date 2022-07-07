import { randomBytes } from 'crypto';
import Emittery from 'emittery';
import WebSocket from 'ws';
import got from 'got';
import queue from 'queue';
import parseDuration from 'parse-duration';

/** Models */
import { PublicToken } from './models/public-token.model';
import { Subscription } from './models/subscription.model';
import { TickerSubscription } from './models/ticker-subscription.model';
import { CandleSubscription } from './models/candle-subscription.model';

/** Root */
import { delay, getCandleSubscriptionKey, noop } from './util';
import { mapCandleInterval } from './const';
import { EventHandler } from './event-handler';

export class Client {
  private readonly queueProcessor = queue({ concurrency: 1, timeout: 250, autostart: true });
  private readonly rootApi = 'openapi-v2.kucoin.com';
  private readonly publicBulletEndPoint = 'https://openapi-v2.kucoin.com/api/v1/bullet-public';
  private readonly lengthConnectId = 24;
  private readonly retryTimeoutMs = parseDuration('5s');
  private readonly retrySubscription = parseDuration('2s');
  private readonly triggerTickerDisconnected = parseDuration('6m');
  private readonly triggerNbCandle = 2;
  private readonly emitChannel = {
    ERROR: 'error',
    RECONNECT: 'reconnect',
    SOCKET_NOT_READY: 'socket-not-ready',
    SUBSCRIPTIONS: 'subscriptions',
    RETRY_SUBSCRIPTION: 'retry-subscription',
  };
  private ws: WebSocket;
  private socketOpen: boolean;
  private socketConnecting: boolean;
  private askingClose: boolean;
  private connectId: string;
  private pingIntervalMs: number;
  private pingTimer: NodeJS.Timer;
  private wsPath: string;
  private publicToken: string;
  private subscriptions: Subscription[] = [];
  private eventHandler: EventHandler;
  private disconnectedTrigger: number;
  private lastPongReceived: number | undefined;

  constructor(
    private readonly emitter: Emittery,
    private readonly globalEmitSubscription: () => void,
  ) {
    this.socketOpen = false;
    this.askingClose = false;
    this.eventHandler = new EventHandler(emitter);
  }

  async connect(): Promise<void> {
    this.lastPongReceived = Date.now();
    this.socketConnecting = true;
    const response = await got
      .post(this.publicBulletEndPoint, { headers: { host: this.rootApi } })
      .json<PublicToken>();

    if (!response.data || !response.data.token) {
      const invalidTokenError = new Error('Invalid public token from KuCoin');

      this.socketConnecting = false;
      this.emitter.emit(this.emitChannel.ERROR, invalidTokenError);
      throw invalidTokenError;
    }

    const { token, instanceServers } = response.data;
    const { endpoint, pingInterval } = instanceServers[0];

    this.askingClose = false;
    this.eventHandler.clearCache();
    this.connectId = randomBytes(this.lengthConnectId).toString('hex');
    this.pingIntervalMs = pingInterval;
    this.disconnectedTrigger = pingInterval * 2;
    this.publicToken = token;
    this.wsPath = `${endpoint}?token=${token}&connectId=${this.connectId}`;

    await this.openWebsocketConnection();

    this.lastPongReceived = Date.now();

    if (this.subscriptions.length) {
      this.restartPreviousSubscriptions();
    }
  }

  getPublicToken(): string {
    return this.publicToken;
  }

  subscribeTicker(symbol: string): void {
    const formatSymbol = symbol.replace('/', '-');

    if (this.hasTickerSubscription(symbol)) {
      return;
    }

    this.addTickerSubscription(symbol);
    const subFn = () => {
      if (!this.ws.readyState) {
        this.emitter.emit(
          this.emitChannel.SOCKET_NOT_READY,
          `socket not ready to subscribe ticker for: ${symbol}, retrying in ${this.retryTimeoutMs}ms`,
        );
        setTimeout(() => subFn(), this.retryTimeoutMs).unref();

        return;
      }

      this.queueProcessor.push(() => {
        const id = `sub-ticker-${Date.now()}`;

        this.eventHandler.waitForEvent('ack', id, (result: boolean) => {
          if (result) {
            return;
          }

          this.removeTickerSubscription(symbol);
          setTimeout(() => {
            this.emitter.emit(
              this.emitChannel.RETRY_SUBSCRIPTION,
              `retry to subscribe ticker for: ${symbol}, retrying in ${this.retrySubscription}ms`,
            );
            this.subscribeTicker(symbol);
          }, this.retrySubscription).unref();
        });

        this.send(
          JSON.stringify({
            id,
            type: 'subscribe',
            topic: `/market/ticker:${formatSymbol}`,
            privateChannel: false,
            response: true,
          }),
          (error?: Error) => {
            if (error) {
              this.emitter.emit(this.emitChannel.ERROR, error);
              setTimeout(() => {
                this.emitter.emit(
                  this.emitChannel.RETRY_SUBSCRIPTION,
                  `retry to subscribe ticker for: ${symbol}, retrying in ${this.retrySubscription}ms`,
                );
                this.subscribeTicker(symbol);
              }, this.retrySubscription).unref();

              return this.removeTickerSubscription(symbol);
            }
          },
        );
      });
    };

    if (!this.isSocketOpen()) {
      setTimeout(() => subFn(), this.retrySubscription).unref();

      return;
    }

    subFn();
  }

  unsubscribeTicker(symbol: string): void {
    this.requireSocketToBeOpen();
    const formatSymbol = symbol.replace('/', '-');

    if (!this.hasTickerSubscription(symbol)) {
      return;
    }

    this.queueProcessor.push(() => {
      const id = `unsub-ticker-${Date.now()}`;

      this.eventHandler.waitForEvent('ack', id, (result: boolean) => {
        if (result) {
          this.eventHandler.deleteTickerCache(symbol);

          return;
        }

        this.addTickerSubscription(symbol);
      });

      this.send(
        JSON.stringify({
          id,
          type: 'unsubscribe',
          topic: `/market/ticker:${formatSymbol}`,
          privateChannel: false,
          response: true,
        }),
        (error?: Error) => {
          if (error) {
            this.emitter.emit(this.emitChannel.ERROR, error);

            return this.addTickerSubscription(symbol);
          }
        },
      );
    });
    this.removeTickerSubscription(symbol);
  }

  subscribeCandle(symbol: string, interval: string): void {
    const formatSymbol = symbol.replace('/', '-');
    const formatInterval = mapCandleInterval[interval];

    if (!formatInterval) {
      throw new TypeError(`Wrong format waiting for: ${Object.keys(mapCandleInterval).join(', ')}`);
    }

    if (this.hasCandleSubscription(symbol, interval)) {
      return;
    }

    this.addCandleSubscription(symbol, interval);
    const subFn = () => {
      if (!this.ws.readyState) {
        this.emitter.emit(
          this.emitChannel.SOCKET_NOT_READY,
          `socket not ready to subscribe candle for: ${symbol} ${interval}, retrying in ${this.retryTimeoutMs}ms`,
        );
        setTimeout(() => subFn(), this.retryTimeoutMs).unref();

        return;
      }

      this.queueProcessor.push(() => {
        const id = `sub-candle-${Date.now()}`;

        this.eventHandler.waitForEvent('ack', id, (result: boolean) => {
          if (result) {
            return;
          }

          this.removeCandleSubscription(symbol, interval);
          setTimeout(() => {
            this.emitter.emit(
              this.emitChannel.RETRY_SUBSCRIPTION,
              `retry to subscribe candle for: ${symbol} ${interval}, retrying in ${this.retrySubscription}ms`,
            );
            this.subscribeCandle(symbol, interval);
          }, this.retrySubscription).unref();
        });

        this.send(
          JSON.stringify({
            id,
            type: 'subscribe',
            topic: `/market/candles:${formatSymbol}_${formatInterval}`,
            privateChannel: false,
            response: true,
          }),
          (error?: Error) => {
            if (error) {
              this.emitter.emit(this.emitChannel.ERROR, error);
              setTimeout(() => {
                this.emitter.emit(
                  this.emitChannel.RETRY_SUBSCRIPTION,
                  `retry to subscribe candle for: ${symbol} ${interval}, retrying in ${this.retrySubscription}ms`,
                );
                this.subscribeCandle(symbol, interval);
              }, this.retrySubscription).unref();
              return this.removeCandleSubscription(symbol, interval);
            }
          },
        );
      });
    };

    if (!this.isSocketOpen()) {
      setTimeout(() => subFn(), this.retrySubscription).unref();

      return;
    }

    subFn();
  }

  unsubscribeCandle(symbol: string, interval: string): void {
    this.requireSocketToBeOpen();
    const formatSymbol = symbol.replace('/', '-');
    const formatInterval = mapCandleInterval[interval];

    if (!formatInterval) {
      throw new TypeError(`Wrong format waiting for: ${Object.keys(mapCandleInterval).join(', ')}`);
    }

    if (!this.hasCandleSubscription(symbol, interval)) {
      return;
    }

    this.removeCandleSubscription(symbol, interval);
    this.queueProcessor.push(() => {
      const id = `unsub-candle-${Date.now()}`;

      this.eventHandler.waitForEvent('ack', id, (result: boolean) => {
        if (result) {
          this.eventHandler.deleteCandleCache(getCandleSubscriptionKey(symbol, interval));

          return;
        }

        this.addCandleSubscription(symbol, interval);
      });

      this.send(
        JSON.stringify({
          id,
          type: 'unsubscribe',
          topic: `/market/candles:${formatSymbol}_${formatInterval}`,
          privateChannel: false,
          response: true,
        }),
        (error?: Error) => {
          if (error) {
            this.emitter.emit(this.emitChannel.ERROR, error);

            return this.addCandleSubscription(symbol, interval);
          }
        },
      );
    });
  }

  closeConnection(): void {
    if (this.subscriptions.length) {
      throw new Error(`You have activated subscriptions! (${this.subscriptions.length})`);
    }

    this.askingClose = true;
    this.ws.close();
  }

  forceCloseConnection(): void {
    if (!this.isSocketOpen()) {
      return;
    }

    this.ws.close();
  }

  isSocketOpen(): boolean {
    return !!this.ws && this.socketOpen;
  }

  isSocketConnecting(): boolean {
    return this.socketConnecting;
  }

  getSubscriptionNumber(): number {
    return this.subscriptions.length;
  }

  getSubscriptions(): Subscription[] {
    return this.subscriptions;
  }

  receivedPongRecently(): boolean {
    if (!this.lastPongReceived) {
      return false;
    }

    if (this.socketConnecting) {
      return true;
    }

    const now = Date.now();
    const timeDiff = now - this.lastPongReceived;

    return timeDiff < this.disconnectedTrigger;
  }

  shouldReconnectDeadSockets() {
    const now = Date.now();

    this.shouldReconnectTickers(now);
    this.shouldReconnectCandles(now);
  }

  hasTickerSubscription(symbol: string): boolean {
    return this.subscriptions
      .filter((fSub: Subscription) => fSub.type === 'ticker')
      .some((sSub: TickerSubscription) => sSub.symbol === symbol);
  }

  hasCandleSubscription(symbol: string, interval: string): boolean {
    return this.subscriptions
      .filter((fSub: Subscription) => fSub.type === 'candle')
      .some((sSub: CandleSubscription) => sSub.symbol === symbol && sSub.interval === interval);
  }

  private shouldReconnectTickers(now: number) {
    const lastEmittedTickers = this.eventHandler.getLastTickers();
    const allTickers = this.subscriptions
      .filter((fSub: Subscription) => fSub.type === 'ticker')
      .map((mSub: TickerSubscription) => mSub.symbol);

    allTickers
      .filter((pair: string) => {
        if (!lastEmittedTickers[pair]) {
          return true;
        }

        const timeDiff = now - lastEmittedTickers[pair].timestamp;

        return timeDiff >= this.triggerTickerDisconnected;
      })
      .forEach((pair: string) => {
        this.unsubscribeTicker(pair);
        this.subscribeTicker(pair);
      });
  }

  private shouldReconnectCandles(now: number) {
    const lastCandles = this.eventHandler.getLastCandles();
    const allCandles = this.subscriptions.filter((fSub: Subscription) => fSub.type === 'candle');

    allCandles
      .filter((candleSub: CandleSubscription) => {
        const triggerMs = parseDuration(candleSub.interval) * this.triggerNbCandle;
        const candleKeySubscription = getCandleSubscriptionKey(
          candleSub.symbol,
          candleSub.interval,
        );

        let timeDiff = now - candleSub.timestamp;

        if (!lastCandles[candleKeySubscription]) {
          return timeDiff >= triggerMs;
        }

        timeDiff = now - lastCandles[candleKeySubscription].timestamp;

        return timeDiff >= triggerMs;
      })
      .forEach((candleSub: CandleSubscription) => {
        this.unsubscribeCandle(candleSub.symbol, candleSub.interval);
        this.subscribeCandle(candleSub.symbol, candleSub.interval);
      });
  }

  private addTickerSubscription(symbol: string): void {
    const subscription: TickerSubscription = {
      symbol,
      type: 'ticker',
      timestamp: Date.now(),
    };

    this.subscriptions.push(subscription);
    this.globalEmitSubscription();
  }

  private removeTickerSubscription(symbol: string): void {
    if (!this.hasTickerSubscription(symbol)) {
      return;
    }

    const indexSub = this.subscriptions.findIndex(
      (fSub: Subscription) => fSub.type === 'ticker' && fSub.symbol === symbol,
    );

    this.subscriptions.splice(indexSub, 1);
    this.globalEmitSubscription();
  }

  private addCandleSubscription(symbol: string, interval: string): void {
    const subscription: CandleSubscription = {
      symbol,
      interval,
      type: 'candle',
      timestamp: Date.now(),
    };

    this.subscriptions.push(subscription);
    this.globalEmitSubscription();
  }

  private removeCandleSubscription(symbol: string, interval: string): void {
    if (!this.hasCandleSubscription(symbol, interval)) {
      return;
    }

    const indexSub = this.subscriptions.findIndex(
      (fSub: CandleSubscription) =>
        fSub.type === 'candle' && fSub.symbol === symbol && fSub.interval === interval,
    );

    this.subscriptions.splice(indexSub, 1);
    this.globalEmitSubscription();
  }

  private send(data: string, sendCb = noop) {
    if (!this.ws) {
      return;
    }

    this.ws.send(data, sendCb);
  }

  private restartPreviousSubscriptions() {
    if (!this.socketOpen) {
      return;
    }

    if (!this.ws.readyState) {
      this.emitter.emit(
        this.emitChannel.SOCKET_NOT_READY,
        'retry later to restart previous subscriptions',
      );
      setTimeout(() => this.restartPreviousSubscriptions(), this.retryTimeoutMs).unref();

      return;
    }

    const previousSubs: Subscription[] = [].concat(this.subscriptions);
    this.subscriptions.length = 0;

    for (const subscription of previousSubs) {
      if (subscription.type === 'ticker') {
        this.subscribeTicker(subscription.symbol);
      }

      if (subscription.type === 'candle') {
        this.subscribeCandle(subscription.symbol, (subscription as CandleSubscription).interval);
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

    const pingId = `ping-${Date.now()}`;

    this.eventHandler.waitForEvent('pong', pingId, (result: boolean) => {
      if (result) {
        this.lastPongReceived = Date.now();

        return;
      }
    });

    this.send(
      JSON.stringify({
        id: pingId,
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

  private async reconnect() {
    await delay(this.retryTimeoutMs);
    this.emitter.emit(
      this.emitChannel.RECONNECT,
      `reconnect with ${this.subscriptions.length} sockets...`,
    );
    this.connect();
  }

  private async openWebsocketConnection(): Promise<void> {
    if (this.socketOpen) {
      return;
    }

    this.queueProcessor.start();
    this.ws = new WebSocket(this.wsPath, {
      perMessageDeflate: false,
      handshakeTimeout: this.retryTimeoutMs,
    });

    this.ws.on('message', (data: string) => {
      this.eventHandler.processMessage(data);
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
      this.emitter.emit(this.emitChannel.ERROR, error);
    });

    await this.waitOpenSocket();
    this.startPing();
    const welcomeResult = await this.eventHandler.waitForEvent('welcome', this.connectId);

    if (!welcomeResult) {
      const welcomeError = new Error('No welcome message from KuCoin received!');

      this.emitter.emit(this.emitChannel.ERROR, welcomeError);
      throw welcomeError;
    }

    this.socketOpen = true;
    this.socketConnecting = false;
  }

  private waitOpenSocket(): Promise<void> {
    return new Promise((resolve) => {
      this.ws.on('open', () => {
        resolve();
      });
    });
  }
}
