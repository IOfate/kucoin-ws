export interface Subscription {
    type: 'ticker' | 'candle';
    timestamp: number;
    symbol: string;
}
