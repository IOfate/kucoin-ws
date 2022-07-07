import { Subscription } from './subscription.model';
export interface TickerSubscription extends Subscription {
    type: 'ticker';
}
