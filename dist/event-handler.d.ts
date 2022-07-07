import Emittery from 'emittery';
import { Ticker } from './models/ticker';
import { Candle } from './models/candle';
export declare class EventHandler {
    private readonly emitter;
    private readonly maxWaiting;
    private lastCandles;
    private lastTickers;
    private mapResolveWaitEvent;
    constructor(emitter: Emittery);
    waitForEvent(event: string, id: string, callback?: (result: boolean) => void): Promise<boolean>;
    processMessage(message: string): void;
    deleteCandleCache(id: string): void;
    deleteTickerCache(id: string): void;
    clearCache(): void;
    getLastTickers(): {
        [pair: string]: Ticker;
    };
    getLastCandles(): {
        [candleKey: string]: Candle;
    };
    private processRawTicker;
    private reverseInterval;
    private getCandle;
    private processCandleUpdate;
    private processCandleAdd;
}
