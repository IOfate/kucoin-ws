import Emittery from 'emittery';
export declare class EventHandler {
    private readonly emitter;
    private readonly maxWaiting;
    private currentCandles;
    private mapResolveWaitEvent;
    constructor(emitter: Emittery);
    waitForEvent(event: string, id: string, callback?: (result: boolean) => void): Promise<boolean>;
    processMessage(message: string): void;
    deleteCandleCache(id: string): void;
    clearCandleCache(): void;
    private processRawTicker;
    private reverseInterval;
    private getCandle;
    private processCandleUpdate;
    private processCandleAdd;
}
