import Emittery from 'emittery';
import parseDuration from 'parse-duration';
/** Root */
import { Client } from './client.js';
export class KuCoinWs extends Emittery {
    constructor() {
        super();
        this.clientList = [];
        this.maxSubscriptions = 98;
        this.subscriptionsEvent = 'subscriptions';
        this.intervalCheckConnection = parseDuration('32s');
        this.launchTimerDisconnected();
    }
    connect() {
        this.getLastClient();
        return Promise.resolve();
    }
    subscribeTicker(symbol) {
        const alreadySubscribed = this.clientList.some((client) => client.hasTickerSubscription(symbol));
        if (alreadySubscribed) {
            return;
        }
        this.getLastClient().subscribeTicker(symbol);
    }
    subscribeTickers(symbols) {
        symbols.forEach((symbol) => this.subscribeTicker(symbol));
    }
    unsubscribeTicker(symbol) {
        const client = this.clientList.find((client) => client.hasTickerSubscription(symbol));
        if (!client) {
            return;
        }
        client.unsubscribeTicker(symbol);
    }
    unsubscribeTickers(symbols) {
        symbols.forEach((symbol) => this.unsubscribeTicker(symbol));
    }
    subscribeCandle(symbol, interval) {
        const alreadySubscribed = this.clientList.some((client) => client.hasCandleSubscription(symbol, interval));
        if (alreadySubscribed) {
            return;
        }
        this.getLastClient().subscribeCandle(symbol, interval);
    }
    unsubscribeCandle(symbol, interval) {
        const client = this.clientList.find((client) => client.hasCandleSubscription(symbol, interval));
        if (!client) {
            return;
        }
        client.unsubscribeCandle(symbol, interval);
    }
    closeConnection() {
        this.clientList.forEach((client) => client.closeConnection());
    }
    isSocketOpen() {
        return this.clientList.every((client) => client.isSocketOpen());
    }
    isSocketConnecting() {
        return this.clientList.some((client) => client.isSocketConnecting());
    }
    getSubscriptionNumber() {
        return this.clientList.reduce((acc, client) => acc + client.getSubscriptionNumber(), 0);
    }
    getMapClientSubscriptionNumber() {
        return this.clientList.reduce((acc, client) => {
            return {
                ...acc,
                [client.getPublicToken()]: client.getSubscriptionNumber(),
            };
        }, {});
    }
    launchTimerDisconnected() {
        clearInterval(this.timerDisconnectedClient);
        this.timerDisconnectedClient = setInterval(() => this.checkDisconnectedClients(), this.intervalCheckConnection);
        this.timerDisconnectedClient.unref();
    }
    getLastClient() {
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
    emitSubscriptions() {
        const allSubscriptions = this.clientList.reduce((acc, client) => acc.concat(client.getSubscriptions()), []);
        this.emit(this.subscriptionsEvent, allSubscriptions);
    }
    checkDisconnectedClients() {
        for (const client of this.clientList) {
            if (!client.receivedPongRecently()) {
                client.forceCloseConnection();
                continue;
            }
            client.shouldReconnectDeadSockets();
        }
    }
}
//# sourceMappingURL=index.js.map