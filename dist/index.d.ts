import Emittery from 'emittery';
export declare class KuCoinWs extends Emittery {
    private readonly clientList;
    private readonly maxSubscriptions;
    private readonly subscriptionsEvent;
    constructor();
    connect(): Promise<void>;
    subscribeTicker(symbol: string): void;
    unsubscribeTicker(symbol: string): void;
    subscribeCandle(symbol: string, interval: string): void;
    unsubscribeCandle(symbol: string, interval: string): void;
    closeConnection(): void;
    isSocketOpen(): boolean;
    isSocketConnecting(): boolean;
    getSubscriptionNumber(): number;
    private getLastClient;
    private emitSubscriptions;
}
