export const delay = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
// eslint-disable-next-line
export const noop = () => { };
export const getCandleSubscriptionKey = (symbol, interval) => `candle-${symbol}-${interval}`;
//# sourceMappingURL=util.js.map