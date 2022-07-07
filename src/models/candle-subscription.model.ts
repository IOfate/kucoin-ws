import { Subscription } from './subscription.model';

export interface CandleSubscription extends Subscription {
  type: 'candle';
  interval: string;
}
