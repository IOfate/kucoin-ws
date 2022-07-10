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
const parse_duration_1 = __importDefault(require("parse-duration"));
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
        this.retryTimeoutMs = (0, parse_duration_1.default)('5s');
        this.retrySubscription = (0, parse_duration_1.default)('2s');
        this.triggerTickerDisconnected = (0, parse_duration_1.default)('6m');
        this.triggerNbCandle = 2;
        this.emitChannel = {
            ERROR: 'error',
            RECONNECT: 'reconnect',
            SOCKET_NOT_READY: 'socket-not-ready',
            SUBSCRIPTIONS: 'subscriptions',
            RETRY_SUBSCRIPTION: 'retry-subscription',
        };
        this.subscriptions = [];
        this.socketOpen = false;
        this.askingClose = false;
        this.eventHandler = new event_handler_1.EventHandler(emitter);
    }
    async connect() {
        this.lastPongReceived = Date.now();
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
        this.eventHandler.clearCache();
        this.connectId = (0, crypto_1.randomBytes)(this.lengthConnectId).toString('hex');
        this.pingIntervalMs = pingInterval;
        this.disconnectedTrigger = pingInterval * 2;
        this.publicToken = token;
        this.wsPath = `${endpoint}?token=${token}&connectId=${this.connectId}`;
        await this.openWebsocketConnection();
        this.lastPongReceived = Date.now();
        if (this.subscriptions.length) {
            this.restartPreviousSubscriptions();
        }
    }
    getPublicToken() {
        return this.publicToken;
    }
    subscribeTicker(symbol) {
        const formatSymbol = symbol.replace('/', '-');
        if (this.hasTickerSubscription(symbol)) {
            return;
        }
        this.addTickerSubscription(symbol);
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
                    this.removeTickerSubscription(symbol);
                    setTimeout(() => {
                        this.emitter.emit(this.emitChannel.RETRY_SUBSCRIPTION, `retry to subscribe ticker for: ${symbol}, retrying in ${this.retrySubscription}ms`);
                        this.subscribeTicker(symbol);
                    }, this.retrySubscription).unref();
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
                        setTimeout(() => {
                            this.emitter.emit(this.emitChannel.RETRY_SUBSCRIPTION, `retry to subscribe ticker for: ${symbol}, retrying in ${this.retrySubscription}ms`);
                            this.subscribeTicker(symbol);
                        }, this.retrySubscription).unref();
                        return this.removeTickerSubscription(symbol);
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
        if (!this.hasTickerSubscription(symbol)) {
            return;
        }
        this.queueProcessor.push(() => {
            const id = `unsub-ticker-${Date.now()}`;
            this.eventHandler.waitForEvent('ack', id, (result) => {
                if (result) {
                    this.eventHandler.deleteTickerCache(symbol);
                    return;
                }
                this.addTickerSubscription(symbol);
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
                    return this.addTickerSubscription(symbol);
                }
            });
        });
        this.removeTickerSubscription(symbol);
    }
    subscribeCandle(symbol, interval) {
        const formatSymbol = symbol.replace('/', '-');
        const formatInterval = const_1.mapCandleInterval[interval];
        if (!formatInterval) {
            throw new TypeError(`Wrong format waiting for: ${Object.keys(const_1.mapCandleInterval).join(', ')}`);
        }
        if (this.hasCandleSubscription(symbol, interval)) {
            return;
        }
        this.addCandleSubscription(symbol, interval);
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
                    this.removeCandleSubscription(symbol, interval);
                    setTimeout(() => {
                        this.emitter.emit(this.emitChannel.RETRY_SUBSCRIPTION, `retry to subscribe candle for: ${symbol} ${interval}, retrying in ${this.retrySubscription}ms`);
                        this.subscribeCandle(symbol, interval);
                    }, this.retrySubscription).unref();
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
                        setTimeout(() => {
                            this.emitter.emit(this.emitChannel.RETRY_SUBSCRIPTION, `retry to subscribe candle for: ${symbol} ${interval}, retrying in ${this.retrySubscription}ms`);
                            this.subscribeCandle(symbol, interval);
                        }, this.retrySubscription).unref();
                        return this.removeCandleSubscription(symbol, interval);
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
        if (!this.hasCandleSubscription(symbol, interval)) {
            return;
        }
        this.removeCandleSubscription(symbol, interval);
        this.queueProcessor.push(() => {
            const id = `unsub-candle-${Date.now()}`;
            this.eventHandler.waitForEvent('ack', id, (result) => {
                if (result) {
                    this.eventHandler.deleteCandleCache((0, util_1.getCandleSubscriptionKey)(symbol, interval));
                    return;
                }
                this.addCandleSubscription(symbol, interval);
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
                    return this.addCandleSubscription(symbol, interval);
                }
            });
        });
    }
    closeConnection() {
        if (this.subscriptions.length) {
            throw new Error(`You have activated subscriptions! (${this.subscriptions.length})`);
        }
        this.askingClose = true;
        this.ws.close();
    }
    forceCloseConnection() {
        if (!this.isSocketOpen()) {
            return;
        }
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
    receivedPongRecently() {
        if (!this.lastPongReceived) {
            return false;
        }
        if (this.socketConnecting) {
            return true;
        }
        const now = Date.now();
        const timeDiff = now - this.lastPongReceived;
        return timeDiff < this.disconnectedTrigger;
    }
    shouldReconnectDeadSockets() {
        if (!this.isSocketOpen()) {
            return;
        }
        const now = Date.now();
        this.shouldReconnectTickers(now);
        this.shouldReconnectCandles(now);
    }
    hasTickerSubscription(symbol) {
        return this.subscriptions
            .filter((fSub) => fSub.type === 'ticker')
            .some((sSub) => sSub.symbol === symbol);
    }
    hasCandleSubscription(symbol, interval) {
        return this.subscriptions
            .filter((fSub) => fSub.type === 'candle')
            .some((sSub) => sSub.symbol === symbol && sSub.interval === interval);
    }
    shouldReconnectTickers(now) {
        const lastEmittedTickers = this.eventHandler.getLastTickers();
        const allTickers = this.subscriptions
            .filter((fSub) => fSub.type === 'ticker')
            .map((mSub) => mSub.symbol);
        allTickers
            .filter((pair) => {
            if (!lastEmittedTickers[pair]) {
                return true;
            }
            const timeDiff = now - lastEmittedTickers[pair].timestamp;
            return timeDiff >= this.triggerTickerDisconnected;
        })
            .forEach((pair) => {
            this.unsubscribeTicker(pair);
            this.subscribeTicker(pair);
        });
    }
    shouldReconnectCandles(now) {
        const lastCandles = this.eventHandler.getLastCandles();
        const allCandles = this.subscriptions.filter((fSub) => fSub.type === 'candle');
        allCandles
            .filter((candleSub) => {
            const triggerMs = (0, parse_duration_1.default)(candleSub.interval) * this.triggerNbCandle;
            const candleKeySubscription = (0, util_1.getCandleSubscriptionKey)(candleSub.symbol, candleSub.interval);
            let timeDiff = now - candleSub.timestamp;
            if (!lastCandles[candleKeySubscription]) {
                return timeDiff >= triggerMs;
            }
            timeDiff = now - lastCandles[candleKeySubscription].timestamp;
            return timeDiff >= triggerMs;
        })
            .forEach((candleSub) => {
            this.unsubscribeCandle(candleSub.symbol, candleSub.interval);
            this.subscribeCandle(candleSub.symbol, candleSub.interval);
        });
    }
    addTickerSubscription(symbol) {
        const subscription = {
            symbol,
            type: 'ticker',
            timestamp: Date.now(),
        };
        this.subscriptions.push(subscription);
        this.globalEmitSubscription();
    }
    removeTickerSubscription(symbol) {
        if (!this.hasTickerSubscription(symbol)) {
            return;
        }
        const indexSub = this.subscriptions.findIndex((fSub) => fSub.type === 'ticker' && fSub.symbol === symbol);
        this.subscriptions.splice(indexSub, 1);
        this.globalEmitSubscription();
    }
    addCandleSubscription(symbol, interval) {
        const subscription = {
            symbol,
            interval,
            type: 'candle',
            timestamp: Date.now(),
        };
        this.subscriptions.push(subscription);
        this.globalEmitSubscription();
    }
    removeCandleSubscription(symbol, interval) {
        if (!this.hasCandleSubscription(symbol, interval)) {
            return;
        }
        const indexSub = this.subscriptions.findIndex((fSub) => fSub.type === 'candle' && fSub.symbol === symbol && fSub.interval === interval);
        this.subscriptions.splice(indexSub, 1);
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
            if (subscription.type === 'ticker') {
                this.subscribeTicker(subscription.symbol);
            }
            if (subscription.type === 'candle') {
                this.subscribeCandle(subscription.symbol, subscription.interval);
            }
        }
    }
    requireSocketToBeOpen() {
        if (!this.isSocketOpen()) {
            throw new Error('Please call connect before subscribing');
        }
    }
    sendPing() {
        this.requireSocketToBeOpen();
        const pingId = `ping-${Date.now()}`;
        this.eventHandler.waitForEvent('pong', pingId, (result) => {
            if (result) {
                this.lastPongReceived = Date.now();
                return;
            }
        });
        this.send(JSON.stringify({
            id: pingId,
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