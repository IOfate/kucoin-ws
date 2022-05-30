import { randomBytes } from 'crypto';
import Emittery from 'emittery';
import WebSocket from 'ws';
import got from 'got';
import queue from 'queue';

/** Models */
import { PublicToken } from './models/public-token.model';

/** Root */
import { delay, getCandleSubscriptionKey, getTickerSubscriptionKey, noop } from './util';
import { mapCandleInterval } from './const';
import { EventHandler } from './event-handler';

export class Client {
  private readonly queueProcessor = queue({ concurrency: 1, timeout: 250, autostart: true });
  private readonly rootApi = 'openapi-v2.kucoin.com';
  private readonly publicBulletEndPoint = 'https://openapi-v2.kucoin.com/api/v1/bullet-public';
  private readonly lengthConnectId = 24;
  private readonly retryTimeoutMs = 5000;
  private readonly retrySubscription = 2000;
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
  private subscriptions: string[] = [];
  private eventHandler: EventHandler;

  constructor(
    private readonly emitter: Emittery,
    private readonly globalEmitSubscription: () => void,
  ) {
    this.socketOpen = false;
    this.askingClose = false;
    this.eventHandler = new EventHandler(emitter);
  }

  async connect(): Promise<void> {
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
    this.eventHandler.clearCandleCache();
    this.connectId = randomBytes(this.lengthConnectId).toString('hex');
    this.pingIntervalMs = pingInterval;
    this.publicToken = token;
    this.wsPath = `${endpoint}?token=${token}&connectId=${this.connectId}`;

    await this.openWebsocketConnection();

    if (this.subscriptions.length) {
      this.restartPreviousSubscriptions();
    }
  }

  getPublicToken(): string {
    return this.publicToken;
  }

  subscribeTicker(symbol: string): void {
    const formatSymbol = symbol.replace('/', '-');
    const indexSubscription = getTickerSubscriptionKey(symbol);

    if (this.subscriptions.includes(indexSubscription)) {
      return;
    }

    this.addSubscription(indexSubscription);
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

          this.removeSubscription(indexSubscription);
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
              return this.removeSubscription(indexSubscription);
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
    const indexSubscription = getTickerSubscriptionKey(symbol);

    if (!this.subscriptions.includes(indexSubscription)) {
      return;
    }

    this.queueProcessor.push(() => {
      const id = `unsub-ticker-${Date.now()}`;

      this.eventHandler.waitForEvent('ack', id, (result: boolean) => {
        if (result) {
          return;
        }

        this.addSubscription(indexSubscription);
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

            return this.addSubscription(indexSubscription);
          }
        },
      );
    });
    this.removeSubscription(indexSubscription);
  }

  subscribeCandle(symbol: string, interval: string): void {
    const formatSymbol = symbol.replace('/', '-');
    const formatInterval = mapCandleInterval[interval];

    if (!formatInterval) {
      throw new TypeError(`Wrong format waiting for: ${Object.keys(mapCandleInterval).join(', ')}`);
    }

    const indexSubscription = getCandleSubscriptionKey(symbol, interval);

    if (this.subscriptions.includes(indexSubscription)) {
      return;
    }

    this.addSubscription(indexSubscription);
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

          this.removeSubscription(indexSubscription);
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
              return this.removeSubscription(indexSubscription);
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

    const indexSubscription = getCandleSubscriptionKey(symbol, interval);

    if (!this.subscriptions.includes(indexSubscription)) {
      return;
    }

    this.queueProcessor.push(() => {
      const id = `unsub-candle-${Date.now()}`;

      this.eventHandler.waitForEvent('ack', id, (result: boolean) => {
        if (result) {
          this.eventHandler.deleteCandleCache(indexSubscription);

          return;
        }

        this.addSubscription(indexSubscription);
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

            return this.addSubscription(indexSubscription);
          }
        },
      );
    });

    this.removeSubscription(indexSubscription);
  }

  closeConnection(): void {
    if (this.subscriptions.length) {
      throw new Error(`You have activated subscriptions! (${this.subscriptions.length})`);
    }

    this.askingClose = true;
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

  getSubscriptions(): string[] {
    return this.subscriptions;
  }

  private removeSubscription(index: string): void {
    if (!this.subscriptions.includes(index)) {
      return;
    }

    this.subscriptions = this.subscriptions.filter((fSub: string) => fSub !== index);
    this.globalEmitSubscription();
  }

  private addSubscription(index: string): void {
    if (this.subscriptions.includes(index)) {
      return;
    }

    this.subscriptions.push(index);
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

    const previousSubs = [].concat(this.subscriptions);
    this.subscriptions.length = 0;

    for (const subscription of previousSubs) {
      const [type, symbol, timeFrame] = subscription.split('-') as string[];

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
