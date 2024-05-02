/** Root */
import { mapCandleInterval } from './const.js';
import { getCandleSubscriptionKey, noop } from './util.js';
export class EventHandler {
    constructor(emitter) {
        this.emitter = emitter;
        this.maxWaiting = 2000;
        this.mapResolveWaitEvent = {};
        this.lastCandles = {};
        this.mapResolveWaitEvent = {};
        this.lastTickers = {};
    }
    waitForEvent(event, id, callback = noop) {
        const eventKey = `${event}-${id}`;
        return new Promise((resolve) => {
            const cb = (result) => {
                if (this.mapResolveWaitEvent[eventKey]) {
                    delete this.mapResolveWaitEvent[eventKey];
                    resolve(result);
                    callback(result);
                }
            };
            this.mapResolveWaitEvent[eventKey] = () => cb(true);
            setTimeout(() => cb(false), this.maxWaiting).unref();
        });
    }
    processMessage(message) {
        const received = JSON.parse(message);
        const eventKey = `${received.type}-${received.id}`;
        if (this.mapResolveWaitEvent[eventKey]) {
            this.mapResolveWaitEvent[eventKey]();
            return;
        }
        if (received.type === 'error') {
            const error = new Error(received.data);
            this.emitter.emit('error', error);
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
    deleteCandleCache(id) {
        delete this.lastCandles[id];
    }
    deleteTickerCache(id) {
        delete this.lastTickers[id];
    }
    clearCache() {
        this.lastCandles = {};
        this.lastTickers = {};
    }
    getLastTickers() {
        return this.lastTickers;
    }
    getLastCandles() {
        return this.lastCandles;
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
        this.lastTickers[symbol] = ticker;
        this.emitter.emit(`ticker-${symbol}`, ticker);
    }
    reverseInterval(kuCoinInterval) {
        const keyArray = Object.keys(mapCandleInterval);
        const valueArray = Object.values(mapCandleInterval);
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
            timestamp: Date.now(),
        };
        return candle;
    }
    processCandleUpdate(symbol, interval, rawCandle) {
        const keyCandle = getCandleSubscriptionKey(symbol, interval);
        const candle = this.getCandle(symbol, rawCandle);
        this.lastCandles[keyCandle] = candle;
    }
    processCandleAdd(symbol, interval, rawCandle) {
        const keyCandle = getCandleSubscriptionKey(symbol, interval);
        const candle = this.getCandle(symbol, rawCandle);
        if (this.lastCandles[keyCandle]) {
            this.emitter.emit(keyCandle, this.lastCandles[keyCandle]);
        }
        this.lastCandles[keyCandle] = candle;
    }
}
//# sourceMappingURL=event-handler.js.map