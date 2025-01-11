import { Logger } from "../models/logger.js";
import { RateLimits } from "../models/ratelimits.js";
import { Repo } from "./repo.js";

//rate limits commands by players and will ban them if abused too many times
export class RateLimiter {
  private maxCommands: number;
  private timeWindow: number;
  private abuseThreshold: number; // Number of over-limit attempts before marking for abuse
  private repo: Repo;
  private logger: Logger;

  constructor(repo: Repo, maxCommands: number, timeWindow: number, abuseThreshold: number, logger: Logger) {
    this.maxCommands = maxCommands;
    this.timeWindow = timeWindow;
    this.abuseThreshold = abuseThreshold;
    this.repo = repo;
    this.logger = logger;
  }

  async canExecuteCommand(did: string): Promise<boolean> {
    let ratelimit = await this.repo.getRateLimitById(did);
    if (ratelimit) {
      await this.canExecuteCommandPlayer(ratelimit);
    }
    return false;
  }
  async canExecuteCommandPlayer(ratelimit: RateLimits): Promise<boolean> {
    const now = Date.now();
    if (ratelimit.lastReset == 0) {
      // First command for this user, initialize data
      ratelimit = {
        did: ratelimit.did,
        count: 1,
        lastReset: now,
        overLimitAttempts: 0,
        abusive: false,
      }; // retain over-limit count
      await this.repo.insertRateLimit(ratelimit);
      return true;
    }
    if (ratelimit.abusive == true) {
      //GIVE NO QUARTER
      return false;
    }

    const { count, lastReset, overLimitAttempts } = ratelimit;

    if (now - lastReset > this.timeWindow) {
      // Reset the count if the time window has elapsed
      ratelimit.count = 1;
      ratelimit.lastReset = now;
      ratelimit.overLimitAttempts = 0;
      await this.repo.insertRateLimit(ratelimit);
      return true;
    }

    if (count < this.maxCommands) {
      // Increment the count if within the limit
      ratelimit.count += 1;
      await this.repo.insertRateLimit(ratelimit);
      return true;
    }

    // Rate limit exceeded, track over-limit attempts
    ratelimit.overLimitAttempts += 1;

    // If over-limit attempts exceed the abuse threshold, mark for abuse
    if (ratelimit.overLimitAttempts >= this.abuseThreshold) {
      ratelimit.abusive = true;
      await this.repo.insertRateLimit(ratelimit);
      this.logger.warn(`RateLimiter: User ${ratelimit.did} marked for abuse due to excessive rate limit violations.`);
    }
    return false;
  }
}
