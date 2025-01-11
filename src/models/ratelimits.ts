export interface RateLimits {
  did: string;
  count: number;
  lastReset: number;
  overLimitAttempts: number;
  abusive: boolean;
}
