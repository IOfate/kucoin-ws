import { RawTicker } from './raw-ticker.js';
export interface Ticker {
    symbol: string;
    info: RawTicker;
    timestamp: number;
    datetime: string;
    high: number;
    low: number;
    bid: number;
    ask: number;
    close: number;
    last: number;
}
