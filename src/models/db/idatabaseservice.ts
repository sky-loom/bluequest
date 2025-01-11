import { GameState } from "../gamestate.js";
import { Player } from "../player.js";
import { PlayerProfileData } from "../playerprofiledata.js";
import { ProfileFlags } from "../profileflags.js";
import { RateLimits } from "../ratelimits.js";
import { SkeetData, SkeetDataSummary } from "../skeetdata.js";

export interface IDatabaseService {
  initialize(): Promise<void>;
  //basic DB operations - we're making it simple. The DB is just an unstructured record store
  deleteRecord(did: string): Promise<void>;

  //game basic operations
  saveGameState(gameState: GameState): Promise<void>;
  getGameState(): Promise<GameState | undefined>;
  getRateLimit(did: string): Promise<RateLimits | undefined>;
  insertRatelimit(record: RateLimits): Promise<void>;
  getPlayersWithStatusPlay(): Promise<Set<string>>;

  //profile flags
  getProfileFlagsByIds(ids: string[]): Promise<ProfileFlags[]>;
  insertProfileFlags(id: string, profileFlags: ProfileFlags): Promise<void>;
  getProfileFlagsById(id: string): Promise<ProfileFlags | undefined>;
  deleteProfileFlagsById(id: string): Promise<void>;

  //player bluesky profile data
  insertPlayerProfile(id: string, profile: PlayerProfileData): Promise<void>;
  getPlayerProfileById(id: string): Promise<PlayerProfileData | undefined>;
  deletePlayerProfileById(id: string): Promise<void>;

  //player data
  insertPlayer(id: string, player: Player): Promise<void>;
  getPlayerById(id: string): Promise<Player | undefined>;
  deletePlayerById(id: string): Promise<void>;

  //skeet related data
  insertSkeetData(record: SkeetData): Promise<void>;
  summarizeData(): Promise<void>;
  aggregateDailySummaryAndCleanup(): Promise<void>;
  insertSkeetDataBatch(records: SkeetData[]): Promise<void>;
  deleteSkeetData(did: string, time: number): Promise<void>;
  getSkeetData(did: string, time: number): Promise<SkeetData | undefined>;
  deleteSkeetDataSummary(did: string, runTime: number): Promise<void>;
  getSkeetDataSummary(did: string, runTime: number): Promise<SkeetDataSummary | undefined>;

  //handle
  getIdByHandle(handle: string): Promise<string | undefined>;
  insertHandleId(handle: string, id: string): Promise<void>;

  //follows
  getFollowsById(id: string): Promise<string[] | undefined>;
  insertFollows(id: string, follows: string[]): Promise<void>;
  //followers
  getFollowersById(id: string): Promise<string[] | undefined>;
  insertFollowers(id: string, player: string[]): Promise<void>;
  //events
  insertEventSchedule(id: string, events: string): Promise<void>;
  getEventSchedule(id: string): Promise<string | undefined>;
}
