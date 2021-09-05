import { randomBytes } from 'crypto';
import Emittery from 'emittery';
import WebSocket from 'ws';
import got from 'got';

/** Models */
import { PublicToken } from './models/public-token.model';

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

  private openWebsocketConnection(): Promise<void> {
    if (this.socketOpen) {
      return;
    }

    this.ws = new WebSocket(this.wsPath);

    this.ws.on('message', (data: string) => {
      const received = JSON.parse(data);
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
