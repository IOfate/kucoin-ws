import { Subscription } from './subscription.model.js';
export interface TickerSubscription extends Subscription {
    type: 'ticker';
}
