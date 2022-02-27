"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noop = exports.delay = void 0;
const delay = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
exports.delay = delay;
// eslint-disable-next-line
const noop = () => { };
exports.noop = noop;
//# sourceMappingURL=util.js.map