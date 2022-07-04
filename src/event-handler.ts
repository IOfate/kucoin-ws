import Emittery from 'emittery';

/** Root */
import { mapCandleInterval } from './const';
import { noop } from './util';

/** Models */
import { MessageData } from './models/message-data.model';
import { RawTicker } from './models/raw-ticker';
import { Ticker } from './models/ticker';
import { Candle } from './models/candle';

export class EventHandler {
  private readonly maxWaiting = 2000;
  private lastCandles: { [candleKey: string]: Candle };
  private lastTickers: { [pair: string]: Ticker };
  private mapResolveWaitEvent: { [eventKey: string]: () => void } = {};

  constructor(private readonly emitter: Emittery) {
    this.lastCandles = {};
    this.mapResolveWaitEvent = {};
    this.lastTickers = {};
  }

  waitForEvent(
    event: string,
    id: string,
    callback: (result: boolean) => void = noop,
  ): Promise<boolean> {
    const eventKey = `${event}-${id}`;

    return new Promise((resolve) => {
      const cb = (result: boolean) => {
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

  processMessage(message: string): void {
    const received = JSON.parse(message) as MessageData;
    const eventKey = `${received.type}-${received.id}`;

    if (this.mapResolveWaitEvent[eventKey]) {
      this.mapResolveWaitEvent[eventKey]();

      return;
    }

    if (received.type === 'error') {
      const error = new Error(received.data as string);

      this.emitter.emit('error', error);
    }

    if (received.subject === 'trade.ticker') {
      const symbol = received.topic.split('/market/ticker:').pop().replace('-', '/');

      this.processRawTicker(symbol, received.data as RawTicker);
    }

    if (received.subject === 'trade.candles.update') {
      const symbol = received.data.symbol.replace('-', '/') as string;
      const interval = this.reverseInterval(received.topic.split('_').pop());

      this.processCandleUpdate(symbol, interval, received.data.candles as string[]);
    }

    if (received.subject === 'trade.candles.add') {
      const symbol = received.data.symbol.replace('-', '/') as string;
      const interval = this.reverseInterval(received.topic.split('_').pop());

      this.processCandleAdd(symbol, interval, received.data.candles as string[]);
    }
  }

  deleteCandleCache(id: string): void {
    delete this.lastCandles[id];
  }

  deleteTickerCache(id: string): void {
    delete this.lastTickers[id];
  }

  clearCache(): void {
    this.lastCandles = {};
    this.lastTickers = {};
  }

  getLastTickers(): { [pair: string]: Ticker } {
    return this.lastTickers;
  }

  getLastCandles(): { [candleKey: string]: Candle } {
    return this.lastCandles;
  }

  private processRawTicker(symbol: string, rawTicker: RawTicker) {
    const ticker: Ticker = {
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

  private reverseInterval(kuCoinInterval: string): string {
    const keyArray = Object.keys(mapCandleInterval);
    const valueArray = Object.values<string>(mapCandleInterval);
    const index = valueArray.indexOf(kuCoinInterval);

    if (index === -1) {
      throw new Error(`Unable to map KuCoin candle interval: ${kuCoinInterval}`);
    }

    return keyArray[index];
  }

  private getCandle(symbol: string, rawCandle: string[]): Candle {
    const [, rawOpenPrice, rawClosePrice, rawHighPrice, rawLowPrice, rawVolume] = rawCandle;

    const candle: Candle = {
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

  private processCandleUpdate(symbol: string, interval: string, rawCandle: string[]) {
    const keyCandle = this.formatCandleKey(symbol, interval);
    const candle = this.getCandle(symbol, rawCandle);

    this.lastCandles[keyCandle] = candle;
  }

  private processCandleAdd(symbol: string, interval: string, rawCandle: string[]) {
    const keyCandle = this.formatCandleKey(symbol, interval);
    const candle = this.getCandle(symbol, rawCandle);

    if (this.lastCandles[keyCandle]) {
      this.emitter.emit(keyCandle, this.lastCandles[keyCandle]);
    }

    this.lastCandles[keyCandle] = candle;
  }

  private formatCandleKey(symbol: string, interval: string): string {
    return `candle-${symbol}-${interval}`;
  }
}
