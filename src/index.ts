import Emittery from 'emittery';

/** Root */
import { Client } from './client';
import { getCandleSubscriptionKey, getTickerSubscriptionKey } from './util';

export class KuCoinWs extends Emittery {
  private readonly clientList: Client[] = [];
  private readonly maxSubscriptions = 300;
  private readonly subscriptionsEvent = 'subscriptions';

  constructor() {
    super();
  }

  async connect(): Promise<void> {
    if (!this.clientList.length) {
      const newClient = new Client(this, () => this.emitSubscriptions());

      await newClient.connect();
      this.clientList.push(newClient);
    }
  }

  subscribeTicker(symbol: string): void {
    const alreadySubscribed = this.clientList.some((client: Client) =>
      client.getSubscriptions().includes(getTickerSubscriptionKey(symbol)),
    );

    if (alreadySubscribed) {
      return;
    }

    this.getLastClient().then((client: Client) => client.subscribeTicker(symbol));
  }

  unsubscribeTicker(symbol: string): void {
    const alreadySubscribed = this.clientList.some((client: Client) =>
      client.getSubscriptions().includes(getTickerSubscriptionKey(symbol)),
    );

    if (!alreadySubscribed) {
      return;
    }

    const client = this.clientList.find((client: Client) =>
      client.getSubscriptions().includes(getTickerSubscriptionKey(symbol)),
    );

    client.unsubscribeTicker(symbol);
  }

  subscribeCandle(symbol: string, interval: string): void {
    const alreadySubscribed = this.clientList.some((client: Client) =>
      client.getSubscriptions().includes(getCandleSubscriptionKey(symbol, interval)),
    );

    if (alreadySubscribed) {
      return;
    }

    this.getLastClient().then((client: Client) => client.subscribeCandle(symbol, interval));
  }

  unsubscribeCandle(symbol: string, interval: string): void {
    const alreadySubscribed = this.clientList.some((client: Client) =>
      client.getSubscriptions().includes(getCandleSubscriptionKey(symbol, interval)),
    );

    if (!alreadySubscribed) {
      return;
    }

    const client = this.clientList.find((client: Client) =>
      client.getSubscriptions().includes(getCandleSubscriptionKey(symbol, interval)),
    );

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

  private async getLastClient(): Promise<Client> {
    const lastClient = this.clientList[this.clientList.length - 1];

    if (!lastClient || lastClient.getSubscriptionNumber() >= this.maxSubscriptions) {
      const newClient = new Client(this, () => this.emitSubscriptions());

      await newClient.connect();
      this.clientList.push(newClient);

      return newClient;
    }

    return lastClient;
  }

  private emitSubscriptions(): void {
    const allSubscriptions = this.clientList.reduce(
      (acc: string[], client: Client) => acc.concat(client.getSubscriptions()),
      [],
    );

    this.emit(this.subscriptionsEvent, allSubscriptions);
  }
}
