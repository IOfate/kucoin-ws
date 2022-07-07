import Emittery from 'emittery';
import parseDuration from 'parse-duration';

/** Root */
import { Client } from './client';

/** Models */
import { Subscription } from './models/subscription.model';

export class KuCoinWs extends Emittery {
  private readonly clientList: Client[] = [];
  private readonly maxSubscriptions = 98;
  private readonly subscriptionsEvent = 'subscriptions';
  private readonly intervalCheckConnection = parseDuration('32s');
  private timerDisconnectedClient: NodeJS.Timer;

  constructor() {
    super();

    this.launchTimerDisconnected();
  }

  connect(): Promise<void> {
    this.getLastClient();

    return Promise.resolve();
  }

  subscribeTicker(symbol: string): void {
    const alreadySubscribed = this.clientList.some((client: Client) =>
      client.hasTickerSubscription(symbol),
    );

    if (alreadySubscribed) {
      return;
    }

    this.getLastClient().subscribeTicker(symbol);
  }

  subscribeTickers(symbols: string[]): void {
    symbols.forEach((symbol: string) => this.subscribeTicker(symbol));
  }

  unsubscribeTicker(symbol: string): void {
    const client = this.clientList.find((client: Client) => client.hasTickerSubscription(symbol));

    if (!client) {
      return;
    }

    client.unsubscribeTicker(symbol);
  }

  unsubscribeTickers(symbols: string[]): void {
    symbols.forEach((symbol: string) => this.unsubscribeTicker(symbol));
  }

  subscribeCandle(symbol: string, interval: string): void {
    const alreadySubscribed = this.clientList.some((client: Client) =>
      client.hasCandleSubscription(symbol, interval),
    );

    if (alreadySubscribed) {
      return;
    }

    this.getLastClient().subscribeCandle(symbol, interval);
  }

  unsubscribeCandle(symbol: string, interval: string): void {
    const client = this.clientList.find((client: Client) =>
      client.hasCandleSubscription(symbol, interval),
    );

    if (!client) {
      return;
    }

    client.unsubscribeCandle(symbol, interval);
  }

  closeConnection(): void {
    this.clientList.forEach((client: Client) => client.closeConnection());
  }

  isSocketOpen(): boolean {
    return this.clientList.every((client) => client.isSocketOpen());
  }

  isSocketConnecting(): boolean {
    return this.clientList.some((client) => client.isSocketConnecting());
  }

  getSubscriptionNumber(): number {
    return this.clientList.reduce(
      (acc: number, client: Client) => acc + client.getSubscriptionNumber(),
      0,
    );
  }

  getMapClientSubscriptionNumber(): { [clientIndex: string]: number } {
    return this.clientList.reduce((acc: { [clientIndex: string]: number }, client: Client) => {
      return {
        ...acc,
        [client.getPublicToken()]: client.getSubscriptionNumber(),
      };
    }, {});
  }

  private launchTimerDisconnected(): void {
    clearInterval(this.timerDisconnectedClient);
    this.timerDisconnectedClient = setInterval(
      () => this.checkDisconnectedClients(),
      this.intervalCheckConnection,
    );
    this.timerDisconnectedClient.unref();
  }

  private getLastClient(): Client {
    const lastClient = this.clientList[this.clientList.length - 1];

    if (!lastClient || lastClient.getSubscriptionNumber() >= this.maxSubscriptions) {
      const newClient = new Client(this, () => this.emitSubscriptions());

      this.launchTimerDisconnected();
      this.clientList.push(newClient);

      newClient.connect();

      return newClient;
    }

    return lastClient;
  }

  private emitSubscriptions(): void {
    const allSubscriptions = this.clientList.reduce(
      (acc: Subscription[], client: Client) => acc.concat(client.getSubscriptions()),
      [],
    );

    this.emit(this.subscriptionsEvent, allSubscriptions);
  }

  private checkDisconnectedClients(): void {
    for (const client of this.clientList) {
      if (!client.receivedPongRecently()) {
        client.forceCloseConnection();

        continue;
      }

      client.shouldReconnectDeadSockets();
    }
  }
}
