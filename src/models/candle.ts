import { RawCandle } from './raw-candle';

export interface Candle {
  info: RawCandle;
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
