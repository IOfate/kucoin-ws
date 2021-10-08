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
class KuCoinWs extends emittery_1.default {
    constructor() {
        super();
        this.queueProcessor = (0, queue_1.default)({ concurrency: 1, timeout: 250, autostart: true });
        this.rootApi = 'openapi-v2.kucoin.com';
        this.publicBulletEndPoint = 'https://openapi-v2.kucoin.com/api/v1/bullet-public';
        this.lengthConnectId = 24;
        this.retryTimeoutMs = 5000;
        this.mapCandleInterval = {
            '1m': '1min',
            '3m': '3min',
            '15m': '15min',
            '30m': '30min',
            '1h': '1hour',
            '2h': '2hour',
            '4h': '4hour',
            '6h': '6hour',
            '8h': '8hour',
            '12h': '12hour',
            '1d': '1day',
            '1w': '1week',
        };
        this.subscriptions = [];
        this.socketOpen = false;
        this.askingClose = false;
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
        this.currentCandles = {};
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
        const formatInterval = this.mapCandleInterval[interval];
        if (!formatInterval) {
            throw new TypeError(`Wrong format waiting for: ${Object.keys(this.mapCandleInterval).join(', ')}`);
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
        const formatInterval = this.mapCandleInterval[interval];
        if (!formatInterval) {
            throw new TypeError(`Wrong format waiting for: ${Object.keys(this.mapCandleInterval).join(', ')}`);
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
        delete this.currentCandles[indexSubscription];
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
    processRawTicker(symbol, rawTicker) {
        const ticker = {
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
    reverseInterval(kuCoinInterval) {
        const keyArray = Object.keys(this.mapCandleInterval);
        const valueArray = Object.values(this.mapCandleInterval);
        const index = valueArray.indexOf(kuCoinInterval);
        if (index === -1) {
            throw new Error(`Unable to map KuCoin candle interval: ${kuCoinInterval}`);
        }
        return keyArray[index];
    }
    getCandle(symbol, rawCandle) {
        const [, rawOpenPrice, rawClosePrice, rawHighPrice, rawLowPrice, rawVolume] = rawCandle;
        const candle = {
            info: rawCandle,
            symbol,
            close: Number(rawClosePrice),
            high: Number(rawHighPrice),
            low: Number(rawLowPrice),
            open: Number(rawOpenPrice),
            volume: Number(rawVolume),
        };
        return candle;
    }
    processCandleUpdate(symbol, interval, rawCandle) {
        const keyCandle = `candle-${symbol}-${interval}`;
        const candle = this.getCandle(symbol, rawCandle);
        this.currentCandles[keyCandle] = candle;
    }
    processCandleAdd(symbol, interval, rawCandle) {
        const keyCandle = `candle-${symbol}-${interval}`;
        const candle = this.getCandle(symbol, rawCandle);
        if (this.currentCandles[keyCandle]) {
            this.emit(keyCandle, this.currentCandles[keyCandle]);
        }
        this.currentCandles[keyCandle] = candle;
    }
    processMessage(message) {
        const received = JSON.parse(message);
        if (received.type === 'error') {
            const error = new Error(received.data);
            this.emit('error', error);
        }
        if (received.subject === 'trade.ticker') {
            const symbol = received.topic.split('/market/ticker:').pop().replace('-', '/');
            this.processRawTicker(symbol, received.data);
        }
        if (received.subject === 'trade.candles.update') {
            const symbol = received.data.symbol.replace('-', '/');
            const interval = this.reverseInterval(received.topic.split('_').pop());
            this.processCandleUpdate(symbol, interval, received.data.candles);
        }
        if (received.subject === 'trade.candles.add') {
            const symbol = received.data.symbol.replace('-', '/');
            const interval = this.reverseInterval(received.topic.split('_').pop());
            this.processCandleAdd(symbol, interval, received.data.candles);
        }
    }
    async reconnect() {
        await (0, util_1.delay)(this.retryTimeoutMs);
        this.emit('reconnect', `reconnect with ${this.subscriptions.length} sockets...`);
        this.connect();
    }
    openWebsocketConnection() {
        if (this.socketOpen) {
            return;
        }
        this.ws = new ws_1.default(this.wsPath, {
            perMessageDeflate: false,
            handshakeTimeout: this.retryTimeoutMs,
        });
        this.ws.on('message', (data) => {
            this.processMessage(data);
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
        return new Promise((resolve) => {
            this.ws.on('open', () => {
                this.socketOpen = true;
                this.socketConnecting = false;
                this.startPing();
                resolve();
            });
        });
    }
}
exports.KuCoinWs = KuCoinWs;
//# sourceMappingURL=index.js.map