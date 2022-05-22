"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Client = void 0;
const crypto_1 = require("crypto");
const ws_1 = __importDefault(require("ws"));
const got_1 = __importDefault(require("got"));
const queue_1 = __importDefault(require("queue"));
/** Root */
const util_1 = require("./util");
const const_1 = require("./const");
const event_handler_1 = require("./event-handler");
class Client {
    constructor(emitter, globalEmitSubscription) {
        this.emitter = emitter;
        this.globalEmitSubscription = globalEmitSubscription;
        this.queueProcessor = (0, queue_1.default)({ concurrency: 1, timeout: 250, autostart: true });
        this.rootApi = 'openapi-v2.kucoin.com';
        this.publicBulletEndPoint = 'https://openapi-v2.kucoin.com/api/v1/bullet-public';
        this.lengthConnectId = 24;
        this.retryTimeoutMs = 5000;
        this.retrySubscription = 2000;
        this.emitChannel = {
            ERROR: 'error',
            RECONNECT: 'reconnect',
            SOCKET_NOT_READY: 'socket-not-ready',
            SUBSCRIPTIONS: 'subscriptions',
        };
        this.subscriptions = [];
        this.socketOpen = false;
        this.askingClose = false;
        this.eventHandler = new event_handler_1.EventHandler(emitter);
    }
    async connect() {
        this.socketConnecting = true;
        const response = await got_1.default
            .post(this.publicBulletEndPoint, { headers: { host: this.rootApi } })
            .json();
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
        this.connectId = (0, crypto_1.randomBytes)(this.lengthConnectId).toString('hex');
        this.pingIntervalMs = pingInterval;
        this.wsPath = `${endpoint}?token=${token}&connectId=${this.connectId}`;
        await this.openWebsocketConnection();
        if (this.subscriptions.length) {
            this.restartPreviousSubscriptions();
        }
    }
    subscribeTicker(symbol) {
        const formatSymbol = symbol.replace('/', '-');
        const indexSubscription = (0, util_1.getTickerSubscriptionKey)(symbol);
        if (this.subscriptions.includes(indexSubscription)) {
            return;
        }
        this.addSubscription(indexSubscription);
        const subFn = () => {
            if (!this.ws.readyState) {
                this.emitter.emit(this.emitChannel.SOCKET_NOT_READY, `socket not ready to subscribe ticker for: ${symbol}, retrying in ${this.retryTimeoutMs}ms`);
                setTimeout(() => subFn(), this.retryTimeoutMs).unref();
                return;
            }
            this.queueProcessor.push(() => {
                const id = `sub-ticker-${Date.now()}`;
                this.eventHandler.waitForEvent('ack', id, (result) => {
                    if (result) {
                        return;
                    }
                    this.removeSubscription(indexSubscription);
                    setTimeout(() => this.subscribeTicker(symbol), this.retrySubscription).unref();
                });
                this.send(JSON.stringify({
                    id,
                    type: 'subscribe',
                    topic: `/market/ticker:${formatSymbol}`,
                    privateChannel: false,
                    response: true,
                }), (error) => {
                    if (error) {
                        this.emitter.emit(this.emitChannel.ERROR, error);
                        setTimeout(() => this.subscribeTicker(symbol), this.retrySubscription).unref();
                        return this.removeSubscription(indexSubscription);
                    }
                });
            });
        };
        if (!this.isSocketOpen()) {
            setTimeout(() => subFn(), this.retrySubscription).unref();
            return;
        }
        subFn();
    }
    unsubscribeTicker(symbol) {
        this.requireSocketToBeOpen();
        const formatSymbol = symbol.replace('/', '-');
        const indexSubscription = (0, util_1.getTickerSubscriptionKey)(symbol);
        if (!this.subscriptions.includes(indexSubscription)) {
            return;
        }
        this.queueProcessor.push(() => {
            const id = `unsub-ticker-${Date.now()}`;
            this.eventHandler.waitForEvent('ack', id, (result) => {
                if (result) {
                    return;
                }
                this.addSubscription(indexSubscription);
            });
            this.send(JSON.stringify({
                id,
                type: 'unsubscribe',
                topic: `/market/ticker:${formatSymbol}`,
                privateChannel: false,
                response: true,
            }), (error) => {
                if (error) {
                    this.emitter.emit(this.emitChannel.ERROR, error);
                    return this.addSubscription(indexSubscription);
                }
            });
        });
        this.removeSubscription(indexSubscription);
    }
    subscribeCandle(symbol, interval) {
        const formatSymbol = symbol.replace('/', '-');
        const formatInterval = const_1.mapCandleInterval[interval];
        if (!formatInterval) {
            throw new TypeError(`Wrong format waiting for: ${Object.keys(const_1.mapCandleInterval).join(', ')}`);
        }
        const indexSubscription = (0, util_1.getCandleSubscriptionKey)(symbol, interval);
        if (this.subscriptions.includes(indexSubscription)) {
            return;
        }
        this.addSubscription(indexSubscription);
        const subFn = () => {
            if (!this.ws.readyState) {
                this.emitter.emit(this.emitChannel.SOCKET_NOT_READY, `socket not ready to subscribe candle for: ${symbol} ${interval}, retrying in ${this.retryTimeoutMs}ms`);
                setTimeout(() => subFn(), this.retryTimeoutMs).unref();
                return;
            }
            this.queueProcessor.push(() => {
                const id = `sub-candle-${Date.now()}`;
                this.eventHandler.waitForEvent('ack', id, (result) => {
                    if (result) {
                        return;
                    }
                    this.removeSubscription(indexSubscription);
                    setTimeout(() => this.subscribeCandle(symbol, interval), this.retrySubscription).unref();
                });
                this.send(JSON.stringify({
                    id,
                    type: 'subscribe',
                    topic: `/market/candles:${formatSymbol}_${formatInterval}`,
                    privateChannel: false,
                    response: true,
                }), (error) => {
                    if (error) {
                        this.emitter.emit(this.emitChannel.ERROR, error);
                        setTimeout(() => this.subscribeCandle(symbol, interval), this.retrySubscription).unref();
                        return this.removeSubscription(indexSubscription);
                    }
                });
            });
        };
        if (!this.isSocketOpen()) {
            setTimeout(() => subFn(), this.retrySubscription).unref();
            return;
        }
        subFn();
    }
    unsubscribeCandle(symbol, interval) {
        this.requireSocketToBeOpen();
        const formatSymbol = symbol.replace('/', '-');
        const formatInterval = const_1.mapCandleInterval[interval];
        if (!formatInterval) {
            throw new TypeError(`Wrong format waiting for: ${Object.keys(const_1.mapCandleInterval).join(', ')}`);
        }
        const indexSubscription = (0, util_1.getCandleSubscriptionKey)(symbol, interval);
        if (!this.subscriptions.includes(indexSubscription)) {
            return;
        }
        this.queueProcessor.push(() => {
            const id = `unsub-candle-${Date.now()}`;
            this.eventHandler.waitForEvent('ack', id, (result) => {
                if (result) {
                    this.eventHandler.deleteCandleCache(indexSubscription);
                    return;
                }
                this.addSubscription(indexSubscription);
            });
            this.send(JSON.stringify({
                id,
                type: 'unsubscribe',
                topic: `/market/candles:${formatSymbol}_${formatInterval}`,
                privateChannel: false,
                response: true,
            }), (error) => {
                if (error) {
                    this.emitter.emit(this.emitChannel.ERROR, error);
                    return this.addSubscription(indexSubscription);
                }
            });
        });
        this.removeSubscription(indexSubscription);
    }
    closeConnection() {
        if (this.subscriptions.length) {
            throw new Error(`You have activated subscriptions! (${this.subscriptions.length})`);
        }
        this.askingClose = true;
        this.ws.close();
    }
    isSocketOpen() {
        return !!this.ws && this.socketOpen;
    }
    isSocketConnecting() {
        return this.socketConnecting;
    }
    getSubscriptionNumber() {
        return this.subscriptions.length;
    }
    getSubscriptions() {
        return this.subscriptions;
    }
    removeSubscription(index) {
        if (!this.subscriptions.includes(index)) {
            return;
        }
        this.subscriptions = this.subscriptions.filter((fSub) => fSub !== index);
        this.globalEmitSubscription();
    }
    addSubscription(index) {
        if (this.subscriptions.includes(index)) {
            return;
        }
        this.subscriptions.push(index);
        this.globalEmitSubscription();
    }
    send(data, sendCb = util_1.noop) {
        if (!this.ws) {
            return;
        }
        this.ws.send(data, sendCb);
    }
    restartPreviousSubscriptions() {
        if (!this.socketOpen) {
            return;
        }
        if (!this.ws.readyState) {
            this.emitter.emit(this.emitChannel.SOCKET_NOT_READY, 'retry later to restart previous subscriptions');
            setTimeout(() => this.restartPreviousSubscriptions(), this.retryTimeoutMs).unref();
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
        this.emitter.emit(this.emitChannel.RECONNECT, `reconnect with ${this.subscriptions.length} sockets...`);
        this.connect();
    }
    async openWebsocketConnection() {
        if (this.socketOpen) {
            return;
        }
        this.queueProcessor.start();
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
            this.emitter.emit(this.emitChannel.ERROR, error);
        });
        await this.waitOpenSocket();
        const welcomeResult = await this.eventHandler.waitForEvent('welcome', this.connectId);
        if (!welcomeResult) {
            const welcomeError = new Error('No welcome message from KuCoin received!');
            this.emitter.emit(this.emitChannel.ERROR, welcomeError);
            throw welcomeError;
        }
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
exports.Client = Client;
//# sourceMappingURL=client.js.map