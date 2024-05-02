import { Subscription } from './subscription.model.js';

export interface CandleSubscription extends Subscription {
  type: 'candle';
  interval: string;
}
