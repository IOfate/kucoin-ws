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
  private currentCandles: { [candleKey: string]: Candle };
  private mapResolveWaitEvent: { [eventKey: string]: () => void } = {};

  constructor(private readonly emitter: Emittery) {
    this.currentCandles = {};
    this.mapResolveWaitEvent = {};
  }

  waitForEvent(
    event: string,
    id: string,
    callback: (result: boolean) => void = noop,
  ): Promise<void> {
    const eventKey = `${event}-${id}`;

    return new Promise((resolve) => {
      const cb = (result: boolean) => {
        if (this.mapResolveWaitEvent[eventKey]) {
          delete this.mapResolveWaitEvent[eventKey];
          resolve();
          callback(result);
        }
      };

      this.mapResolveWaitEvent[eventKey] = () => cb(true);
      setTimeout(() => cb(false), this.maxWaiting);
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
    delete this.currentCandles[id];
  }

  clearCandleCache(): void {
    this.currentCandles = {};
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
    };

    return candle;
  }

  private processCandleUpdate(symbol: string, interval: string, rawCandle: string[]) {
    const keyCandle = `candle-${symbol}-${interval}`;
    const candle = this.getCandle(symbol, rawCandle);

    this.currentCandles[keyCandle] = candle;
  }

  private processCandleAdd(symbol: string, interval: string, rawCandle: string[]) {
    const keyCandle = `candle-${symbol}-${interval}`;
    const candle = this.getCandle(symbol, rawCandle);

    if (this.currentCandles[keyCandle]) {
      this.emitter.emit(keyCandle, this.currentCandles[keyCandle]);
    }

    this.currentCandles[keyCandle] = candle;
  }
}
