"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KuCoinWs = void 0;
const emittery_1 = __importDefault(require("emittery"));
/** Root */
const client_1 = require("./client");
const util_1 = require("./util");
class KuCoinWs extends emittery_1.default {
    constructor() {
        super();
        this.clientList = [];
        this.maxSubscriptions = 298;
        this.subscriptionsEvent = 'subscriptions';
    }
    connect() {
        this.getLastClient();
        return Promise.resolve();
    }
    subscribeTicker(symbol) {
        const alreadySubscribed = this.clientList.some((client) => client.getSubscriptions().includes((0, util_1.getTickerSubscriptionKey)(symbol)));
        if (alreadySubscribed) {
            return;
        }
        this.getLastClient().subscribeTicker(symbol);
    }
    subscribeTickers(symbols) {
        symbols.forEach((symbol) => this.subscribeTicker(symbol));
    }
    unsubscribeTicker(symbol) {
        const alreadySubscribed = this.clientList.some((client) => client.getSubscriptions().includes((0, util_1.getTickerSubscriptionKey)(symbol)));
        if (!alreadySubscribed) {
            return;
        }
        const client = this.clientList.find((client) => client.getSubscriptions().includes((0, util_1.getTickerSubscriptionKey)(symbol)));
        client.unsubscribeTicker(symbol);
    }
    unsubscribeTickers(symbols) {
        symbols.forEach((symbol) => this.unsubscribeTicker(symbol));
    }
    subscribeCandle(symbol, interval) {
        const alreadySubscribed = this.clientList.some((client) => client.getSubscriptions().includes((0, util_1.getCandleSubscriptionKey)(symbol, interval)));
        if (alreadySubscribed) {
            return;
        }
        this.getLastClient().subscribeCandle(symbol, interval);
    }
    unsubscribeCandle(symbol, interval) {
        const alreadySubscribed = this.clientList.some((client) => client.getSubscriptions().includes((0, util_1.getCandleSubscriptionKey)(symbol, interval)));
        if (!alreadySubscribed) {
            return;
        }
        const client = this.clientList.find((client) => client.getSubscriptions().includes((0, util_1.getCandleSubscriptionKey)(symbol, interval)));
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
    getLastClient() {
        const lastClient = this.clientList[this.clientList.length - 1];
        if (!lastClient || lastClient.getSubscriptionNumber() >= this.maxSubscriptions) {
            const newClient = new client_1.Client(this, () => this.emitSubscriptions());
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
}
exports.KuCoinWs = KuCoinWs;
//# sourceMappingURL=index.js.map