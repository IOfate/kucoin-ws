export interface RawCandle {
  channel_name: string;
  close: string;
  granularity: {
    unit: string;
    period: number;
  };
  high: string;
  instrument_code: string;
  last_sequence: number;
  low: string;
  open: string;
  time: string;
  type: string;
  volume: string;
}
