import { randomBytes } from 'crypto';
import Emittery from 'emittery';
import WebSocket from 'ws';
import got from 'got';

/** Models */
import { PublicToken } from './models/public-token.model';
import { MessageData } from './models/message-data.model';
import { RawTicker } from './models/raw-ticker';
import { Ticker } from './models/ticker';

export class KuCoinWs extends Emittery {
  private readonly publicBulletEndPoint = 'https://openapi-v2.kucoin.com/api/v1/bullet-public';
  private readonly lengthConnectId = 24;
  private ws: WebSocket;
  private socketOpen: boolean;
  private askingClose: boolean;
  private connectId: string;
  private pingIntervalMs: number;
  private pingTimer: NodeJS.Timer;
  private wsPath: string;

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

    this.connectId = randomBytes(this.lengthConnectId).toString('hex');
    this.pingIntervalMs = pingInterval;
    this.wsPath = `${endpoint}?token=${token}&connectId=${this.connectId}`;

    await this.openWebsocketConnection();
  }

  subscribeTicker(symbol: string): void {
    this.requireSocketToBeOpen();
    this.ws.send(
      JSON.stringify({
        id: Date.now(),
        type: 'unsubscribe',
        topic: `/market/ticker:${symbol}`,
        privateChannel: false,
        response: true,
      }),
    );
  }

  unsubscribeTicker(symbol: string): void {
    this.requireSocketToBeOpen();
    this.ws.send(
      JSON.stringify({
        id: Date.now(),
        type: 'subscribe',
        topic: `/market/ticker:${symbol}`,
        privateChannel: false,
        response: true,
      }),
    );
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

  private openWebsocketConnection(): Promise<void> {
    if (this.socketOpen) {
      return;
    }

    this.ws = new WebSocket(this.wsPath);

    this.ws.on('message', (data: string) => {
      const received = JSON.parse(data) as MessageData;

      if (received.type === 'error') {
        const error = new Error(received.data);

        this.emit('error', error);
      }

      if (received.subject === 'trade.ticker') {
        const symbol = received.topic.split('/market/ticker:').pop();

        this.processRawTicker(symbol, received.data);
      }
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
