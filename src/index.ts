import { randomBytes } from 'crypto';
import Emittery from 'emittery';
import WebSocket from 'ws';
import got from 'got';
import queue from 'queue';

/** Models */
import { PublicToken } from './models/public-token.model';

/** Root */
import { delay, noop } from './util';
import { mapCandleInterval } from './const';
import { EventHandler } from './event-handler';

export class KuCoinWs extends Emittery {
  private readonly queueProcessor = queue({ concurrency: 1, timeout: 250, autostart: true });
  private readonly rootApi = 'openapi-v2.kucoin.com';
  private readonly publicBulletEndPoint = 'https://openapi-v2.kucoin.com/api/v1/bullet-public';
  private readonly lengthConnectId = 24;
  private readonly retryTimeoutMs = 5000;
  private ws: WebSocket;
  private socketOpen: boolean;
  private socketConnecting: boolean;
  private askingClose: boolean;
  private connectId: string;
  private pingIntervalMs: number;
  private pingTimer: NodeJS.Timer;
  private wsPath: string;
  private subscriptions: string[] = [];
  private eventHandler: EventHandler;

  constructor() {
    super();
    this.socketOpen = false;
    this.askingClose = false;
    this.eventHandler = new EventHandler(this);
  }

  async connect(): Promise<void> {
    this.socketConnecting = true;
    const response = await got
      .post(this.publicBulletEndPoint, { headers: { host: this.rootApi } })
      .json<PublicToken>();

    if (!response.data || !response.data.token) {
      const invalidTokenError = new Error('Invalid public token from KuCoin');

      this.socketConnecting = false;
      this.emit('error', invalidTokenError);
      throw invalidTokenError;
    }

    const { token, instanceServers } = response.data;
    const { endpoint, pingInterval } = instanceServers[0];

    this.askingClose = false;
    this.eventHandler.clearCandleCache();
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

    if (!this.ws.readyState) {
      this.emit(
        'socket-not-ready',
        `socket not ready to subscribe ticker for: ${symbol}, retrying in ${this.retryTimeoutMs}ms`,
      );
      const timer = setTimeout(() => this.subscribeTicker(symbol), this.retryTimeoutMs);

      timer.unref();

      return;
    }

    this.addSubscription(indexSubscription);

    this.queueProcessor.push(() => {
      const id = `sub-ticker-${Date.now()}`;

      this.eventHandler.waitForEvent('ack', id, (result: boolean) => {
        if (result) {
          return;
        }

        this.removeSubscription(indexSubscription);
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
            this.emit('error', error);

            return this.removeSubscription(indexSubscription);
          }
        },
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
            this.emit('error', error);

            return this.addSubscription(indexSubscription);
          }
        },
      );
    });
    this.removeSubscription(indexSubscription);
  }

  subscribeCandle(symbol: string, interval: string): void {
    this.requireSocketToBeOpen();
    const formatSymbol = symbol.replace('/', '-');
    const formatInterval = mapCandleInterval[interval];

    if (!formatInterval) {
      throw new TypeError(`Wrong format waiting for: ${Object.keys(mapCandleInterval).join(', ')}`);
    }

    const indexSubscription = `candle-${symbol}-${interval}`;

    if (this.subscriptions.includes(indexSubscription)) {
      return;
    }

    if (!this.ws.readyState) {
      this.emit(
        'socket-not-ready',
        `socket not ready to subscribe candle for: ${symbol} ${interval}, retrying in ${this.retryTimeoutMs}ms`,
      );
      const timer = setTimeout(() => this.subscribeCandle(symbol, interval), this.retryTimeoutMs);

      timer.unref();

      return;
    }

    this.addSubscription(indexSubscription);

    this.queueProcessor.push(() => {
      const id = `sub-candle-${Date.now()}`;

      this.eventHandler.waitForEvent('ack', id, (result: boolean) => {
        if (result) {
          return;
        }

        this.removeSubscription(indexSubscription);
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
            this.emit('error', error);

            return this.removeSubscription(indexSubscription);
          }
        },
      );
    });
  }

  unsubscribeCandle(symbol: string, interval: string): void {
    this.requireSocketToBeOpen();
    const formatSymbol = symbol.replace('/', '-');
    const formatInterval = mapCandleInterval[interval];

    if (!formatInterval) {
      throw new TypeError(`Wrong format waiting for: ${Object.keys(mapCandleInterval).join(', ')}`);
    }

    const indexSubscription = `candle-${symbol}-${interval}`;

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
            this.emit('error', error);

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
    return this.socketOpen;
  }

  isSocketConnecting(): boolean {
    return this.socketConnecting;
  }

  getSubscriptionNumber(): number {
    return this.subscriptions.length;
  }

  private removeSubscription(index: string): void {
    if (!this.subscriptions.includes(index)) {
      return;
    }

    this.subscriptions = this.subscriptions.filter((fSub: string) => fSub !== index);
    this.emit('subscriptions', this.subscriptions);
  }

  private addSubscription(index: string): void {
    if (this.subscriptions.includes(index)) {
      return;
    }

    this.subscriptions.push(index);
    this.emit('subscriptions', this.subscriptions);
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
      this.emit('socket-not-ready', 'retry later to restart previous subscriptions');
      const timer = setTimeout(() => this.restartPreviousSubscriptions(), this.retryTimeoutMs);
      timer.unref();

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
    this.emit('reconnect', `reconnect with ${this.subscriptions.length} sockets...`);
    this.connect();
  }

  private async openWebsocketConnection(): Promise<void> {
    if (this.socketOpen) {
      return;
    }

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
      this.emit('error', error);
    });

    await this.waitOpenSocket();
    const welcomeResult = await this.eventHandler.waitForEvent('welcome', this.connectId);

    if (!welcomeResult) {
      const welcomeError = new Error('No welcome message from KuCoin received!');

      this.emit('error', welcomeError);
      throw welcomeError;
    }

    this.socketOpen = true;
    this.socketConnecting = false;
    this.startPing();
  }

  private waitOpenSocket(): Promise<void> {
    return new Promise((resolve) => {
      this.ws.on('open', () => {
        resolve();
      });
    });
  }
}
