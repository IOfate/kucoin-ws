export const delay = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// eslint-disable-next-line
export const noop = () => {};

export const getCandleSubscriptionKey = (symbol: string, interval: string): string =>
  `candle-${symbol}-${interval}`;
