"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCandleSubscriptionKey = exports.getTickerSubscriptionKey = exports.noop = exports.delay = void 0;
const const_1 = require("./const");
const delay = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
exports.delay = delay;
// eslint-disable-next-line
const noop = () => { };
exports.noop = noop;
const getTickerSubscriptionKey = (symbol) => `${const_1.subTickerStartKey}${symbol}`.toLowerCase();
exports.getTickerSubscriptionKey = getTickerSubscriptionKey;
const getCandleSubscriptionKey = (symbol, interval) => `candle-${symbol}-${interval}`.toLowerCase();
exports.getCandleSubscriptionKey = getCandleSubscriptionKey;
//# sourceMappingURL=util.js.map