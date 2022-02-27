"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KuCoinWs = void 0;
const crypto_1 = require("crypto");
const emittery_1 = __importDefault(require("emittery"));
const ws_1 = __importDefault(require("ws"));
const got_1 = __importDefault(require("got"));
const queue_1 = __importDefault(require("queue"));
/** Root */
const util_1 = require("./util");
const const_1 = require("./const");
const event_handler_1 = require("./event-handler");
class KuCoinWs extends emittery_1.default {
    constructor() {
        super();
        this.queueProcessor = (0, queue_1.default)({ concurrency: 1, timeout: 250, autostart: true });
        this.rootApi = 'openapi-v2.kucoin.com';
        this.publicBulletEndPoint = 'https://openapi-v2.kucoin.com/api/v1/bullet-public';
        this.lengthConnectId = 24;
        this.retryTimeoutMs = 5000;
        this.subscriptions = [];
        this.socketOpen = false;
        this.askingClose = false;
        this.eventHandler = new event_handler_1.EventHandler(this);
    }
    async connect() {
        this.socketConnecting = true;
        const response = await got_1.default
            .post(this.publicBulletEndPoint, { headers: { host: this.rootApi } })
            .json();
        if (!response.data || !response.data.token) {
            this.socketConnecting = false;
            throw new Error('Invalid public token from KuCoin');
        }
        const { token, instanceServers } = response.data;
        const { endpoint, pingInterval } = instanceServers[0];
        this.askingClose = false;
        this.eventHandler.clearCandleCache();
        this.connectId = (0, crypto_1.randomBytes)(this.lengthConnectId).toString('hex');
        this.pingIntervalMs = pingInterval;
        this.wsPath = `${endpoint}?token=${token}&connectId=${this.connectId}`;
        await this.openWebsocketConnection();
        if (this.subscriptions.length) {
            this.restartPreviousSubscriptions();
        }
    }
    subscribeTicker(symbol) {
        this.requireSocketToBeOpen();
        const formatSymbol = symbol.replace('/', '-');
        const indexSubscription = `ticker-${symbol}`;
        if (this.subscriptions.includes(indexSubscription)) {
            return;
        }
        this.subscriptions.push(indexSubscription);
        this.emit('subscriptions', this.subscriptions);
        if (!this.ws.readyState) {
            this.emit('socket-not-ready', `socket not ready to subscribe ticker for: ${symbol}`);
            return;
        }
        this.queueProcessor.push(() => {
            this.send(JSON.stringify({
                id: Date.now(),
                type: 'subscribe',
                topic: `/market/ticker:${formatSymbol}`,
                privateChannel: false,
                response: true,
            }));
        });
    }
    unsubscribeTicker(symbol) {
        this.requireSocketToBeOpen();
        const formatSymbol = symbol.replace('/', '-');
        const indexSubscription = `ticker-${symbol}`;
        if (!this.subscriptions.includes(indexSubscription)) {
            return;
        }
        this.queueProcessor.push(() => {
            this.send(JSON.stringify({
                id: Date.now(),
                type: 'unsubscribe',
                topic: `/market/ticker:${formatSymbol}`,
                privateChannel: false,
                response: true,
            }));
        });
        this.subscriptions = this.subscriptions.filter((fSub) => fSub !== indexSubscription);
        this.emit('subscriptions', this.subscriptions);
    }
    subscribeCandle(symbol, interval) {
        this.requireSocketToBeOpen();
        const formatSymbol = symbol.replace('/', '-');
        const formatInterval = const_1.mapCandleInterval[interval];
        if (!formatInterval) {
            throw new TypeError(`Wrong format waiting for: ${Object.keys(const_1.mapCandleInterval).join(', ')}`);
        }
        const indexSubscription = `candle-${symbol}-${interval}`;
        if (this.subscriptions.includes(indexSubscription)) {
            return;
        }
        this.subscriptions.push(indexSubscription);
        this.emit('subscriptions', this.subscriptions);
        if (!this.ws.readyState) {
            this.emit('socket-not-ready', `socket not ready to subscribe candle for: ${symbol} ${interval}`);
            return;
        }
        this.queueProcessor.push(() => {
            this.send(JSON.stringify({
                id: Date.now(),
                type: 'subscribe',
                topic: `/market/candles:${formatSymbol}_${formatInterval}`,
                privateChannel: false,
                response: true,
            }));
        });
    }
    unsubscribeCandle(symbol, interval) {
        this.requireSocketToBeOpen();
        const formatSymbol = symbol.replace('/', '-');
        const formatInterval = const_1.mapCandleInterval[interval];
        if (!formatInterval) {
            throw new TypeError(`Wrong format waiting for: ${Object.keys(const_1.mapCandleInterval).join(', ')}`);
        }
        const indexSubscription = `candle-${symbol}-${interval}`;
        if (!this.subscriptions.includes(indexSubscription)) {
            return;
        }
        this.queueProcessor.push(() => {
            this.send(JSON.stringify({
                id: Date.now(),
                type: 'unsubscribe',
                topic: `/market/candles:${formatSymbol}_${formatInterval}`,
                privateChannel: false,
                response: true,
            }));
        });
        this.subscriptions = this.subscriptions.filter((fSub) => fSub !== indexSubscription);
        this.eventHandler.deleteCandleCache(indexSubscription);
        this.emit('subscriptions', this.subscriptions);
    }
    closeConnection() {
        if (this.subscriptions.length) {
            throw new Error(`You have activated subscriptions! (${this.subscriptions.length})`);
        }
        this.askingClose = true;
        this.ws.close();
    }
    isSocketOpen() {
        return this.socketOpen;
    }
    isSocketConnecting() {
        return this.socketConnecting;
    }
    getSubscriptionNumber() {
        return this.subscriptions.length;
    }
    send(data) {
        if (!this.ws) {
            return;
        }
        this.ws.send(data);
    }
    restartPreviousSubscriptions() {
        if (!this.socketOpen) {
            return;
        }
        if (!this.ws.readyState) {
            this.emit('socket-not-ready', 'retry later to restart previous subscriptions');
            setTimeout(() => this.restartPreviousSubscriptions(), this.retryTimeoutMs);
            return;
        }
        const previousSubs = [].concat(this.subscriptions);
        this.subscriptions.length = 0;
        for (const subscription of previousSubs) {
            const [type, symbol, timeFrame] = subscription.split('-');
            if (type === 'ticker') {
                this.subscribeTicker(symbol);
            }
            if (type === 'candle') {
                this.subscribeCandle(symbol, timeFrame);
            }
        }
    }
    requireSocketToBeOpen() {
        if (!this.socketOpen) {
            throw new Error('Please call connect before subscribing');
        }
    }
    sendPing() {
        this.requireSocketToBeOpen();
        this.send(JSON.stringify({
            id: Date.now(),
            type: 'ping',
        }));
    }
    startPing() {
        clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => this.sendPing(), this.pingIntervalMs);
    }
    stopPing() {
        clearInterval(this.pingTimer);
    }
    async reconnect() {
        await (0, util_1.delay)(this.retryTimeoutMs);
        this.emit('reconnect', `reconnect with ${this.subscriptions.length} sockets...`);
        this.connect();
    }
    async openWebsocketConnection() {
        if (this.socketOpen) {
            return;
        }
        this.ws = new ws_1.default(this.wsPath, {
            perMessageDeflate: false,
            handshakeTimeout: this.retryTimeoutMs,
        });
        this.ws.on('message', (data) => {
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
        this.ws.on('error', (ws, error) => {
            this.emit('error', error);
        });
        await this.waitOpenSocket();
        await this.eventHandler.waitForEvent('welcome', this.connectId);
        this.socketOpen = true;
        this.socketConnecting = false;
        this.startPing();
    }
    waitOpenSocket() {
        return new Promise((resolve) => {
            this.ws.on('open', () => {
                resolve();
            });
        });
    }
}
exports.KuCoinWs = KuCoinWs;
//# sourceMappingURL=index.js.map