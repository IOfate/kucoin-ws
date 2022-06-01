import Emittery from 'emittery';
export declare class KuCoinWs extends Emittery {
    private readonly clientList;
    private readonly maxSubscriptions;
    private readonly subscriptionsEvent;
    private readonly intervalCheckConnection;
    private timerDisconnectedClient;
    constructor();
    connect(): Promise<void>;
    subscribeTicker(symbol: string): void;
    subscribeTickers(symbols: string[]): void;
    unsubscribeTicker(symbol: string): void;
    unsubscribeTickers(symbols: string[]): void;
    subscribeCandle(symbol: string, interval: string): void;
    unsubscribeCandle(symbol: string, interval: string): void;
    closeConnection(): void;
    isSocketOpen(): boolean;
    isSocketConnecting(): boolean;
    getSubscriptionNumber(): number;
    getMapClientSubscriptionNumber(): {
        [clientIndex: string]: number;
    };
    private launchTimerDisconnected;
    private getLastClient;
    private emitSubscriptions;
    private checkDisconnectedClients;
}
