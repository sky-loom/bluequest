import { IDatabaseService } from "../models/db/idatabaseservice.js";
import { type Player } from "../models/player.js";

import { type GameState } from "../models/gamestate.js";
import { BskyClient } from "./bskyclient.js";

import { RateLimits } from "../models/ratelimits.js";
import { SkeetData, SkeetDataSummary } from "../models/skeetdata.js";
import { PlayerProfileData } from "../models/playerprofiledata.js";
import { Record } from "@atproto/api/dist/client/types/app/bsky/actor/profile.js";
import { ProfileFlags } from "../models/profileflags.js";

import { fileURLToPath } from "url";
import { dirname } from "path";

// Define __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class Repo {
  private databaseService: IDatabaseService;
  private playerCache: Map<string, Player>;
  private handleCache: Map<string, string>;
  private followCache: Map<string, string[]>;
  private followerCache: Map<string, string[]>;
  private rateLimitCache = new Map<string, RateLimits>();
  private skeetDataSummaryCache = new Map<string, SkeetDataSummary>();
  private skeetDataCache = new Map<string, SkeetData>();
  private bskyclient: BskyClient;
  private skeetDataBuffer: SkeetData[] = [];
  private playerProfileCache: Map<string, PlayerProfileData>;
  private activePlayers: Set<string>;

  constructor(databaseService: IDatabaseService, bskyclient: BskyClient) {
    this.bskyclient = bskyclient;
    this.databaseService = databaseService;
    this.playerCache = new Map();
    this.handleCache = new Map();
    this.followCache = new Map();
    this.followerCache = new Map();
    this.rateLimitCache = new Map();
    this.playerProfileCache = new Map();
    this.activePlayers = new Set<string>();
  }
  async init(): Promise<void> {
    this.activePlayers = await this.databaseService.getPlayersWithStatusPlay();
  }
  overridePlayerStatus(did: string, status: string) {
    if (status == "play") {
      this.activePlayers.add(did);
    } else {
      this.activePlayers.delete(did);
    }
  }
  isPlayerPlaying(did: string) {
    return this.activePlayers.has(did);
  }
  // Get the global game state from the database
  async getGameState(): Promise<GameState> {
    let gs = await this.databaseService.getGameState();
    if (!gs) {
      gs = { state: "running", santaInterval: 600000 }; //10 minutes
      this.databaseService.saveGameState(gs);
    }
    return gs;
  }
  async insertProfileFlags(id: string, profileFlags: ProfileFlags): Promise<void> {
    await this.databaseService.insertProfileFlags(id, profileFlags);
  }

  async getProfileFlagsById(id: string): Promise<ProfileFlags | undefined> {
    const profileFlags = await this.databaseService.getProfileFlagsById(id);
    return profileFlags;
  }
  async getAllActivePlayerProfileFlags(ids: string[]): Promise<ProfileFlags[]> {
    return await this.databaseService.getProfileFlagsByIds(ids);
  }
  async deleteProfileFlagsById(id: string): Promise<void> {
    await this.databaseService.deleteProfileFlagsById(id);
  }

  async getEventSchedule(): Promise<string | undefined> {
    return await this.databaseService.getEventSchedule("events");
  }
  async insertEventSchedule(events: string): Promise<void> {
    await this.databaseService.insertEventSchedule("events", events);
  }
  async insertSkeetData(record: SkeetData): Promise<void> {
    //await this.databaseService.insertSkeetData(record);
    //this.skeetDataCache.set(`${record.did}:${record.time}`, record);

    this.skeetDataBuffer.push(record); // Add the record to the buffer
    this.skeetDataCache.set(`${record.did}:${record.time}`, record); // Update the cache

    // If the buffer reaches 2000, perform a batch insert
    if (this.skeetDataBuffer.length >= 2000) {
      await this.flushSkeetDataBuffer();
    }
  }

  public async flushSkeetDataBuffer(): Promise<void> {
    if (this.skeetDataBuffer.length === 0) {
      return;
    }

    // Perform batch insert
    await this.databaseService.insertSkeetDataBatch(this.skeetDataBuffer);

    // Clear the buffer after insertion
    this.skeetDataBuffer = [];
  }
  public async insertPlayerProfile(profile: PlayerProfileData): Promise<void> {
    await this.databaseService.insertPlayerProfile(profile.did, profile);
    this.playerProfileCache.set(profile.did, profile);
  }

  public async getPlayerProfileById(did: string): Promise<PlayerProfileData | undefined> {
    // Check cache first
    if (!this.playerProfileCache.has(did)) {
      const profile = await this.databaseService.getPlayerProfileById(did);
      if (profile) {
        //update this addition to profile
        if (!profile.followsCount) {
          let cnt = await this.getFollows(did);
          if (cnt) {
            profile.followsCount = cnt.length;
            await this.insertPlayerProfile(profile);
          }
        }
        this.playerProfileCache.set(did, profile);
      }
    }
    return this.playerProfileCache.get(did);
  }

  public async deletePlayerProfileById(did: string): Promise<void> {
    await this.databaseService.deletePlayerProfileById(did);
    this.playerProfileCache.delete(did);
  }
  async getSkeetData(did: string, time: number): Promise<SkeetData | undefined> {
    const key = `${did}:${time}`;
    if (!this.skeetDataCache.has(key)) {
      const record = await this.databaseService.getSkeetData(did, time);
      if (record) {
        this.skeetDataCache.set(key, record);
      }
    }
    return this.skeetDataCache.get(key);
  }

  async summarizeData() {
    await this.databaseService.summarizeData();
  }
  async deleteSkeetData(did: string, time: number): Promise<void> {
    await this.databaseService.deleteSkeetData(did, time);
    this.skeetDataCache.delete(`${did}:${time}`);
  }

  async getSkeetDataSummary(did: string, runTime: number): Promise<SkeetDataSummary | undefined> {
    const key = `${did}:${runTime}`;
    if (!this.skeetDataSummaryCache.has(key)) {
      const record = await this.databaseService.getSkeetDataSummary(did, runTime);
      if (record) {
        this.skeetDataSummaryCache.set(key, record);
      }
    }
    return this.skeetDataSummaryCache.get(key);
  }

  async deleteSkeetDataSummary(did: string, runTime: number): Promise<void> {
    await this.databaseService.deleteSkeetDataSummary(did, runTime);
    this.skeetDataSummaryCache.delete(`${did}:${runTime}`);
  }

  async insertRateLimit(rateLimit: RateLimits): Promise<void> {
    await this.databaseService.insertRatelimit(rateLimit);
    this.rateLimitCache.set(rateLimit.did, rateLimit);
  }

  async getRateLimitById(did: string): Promise<RateLimits | undefined> {
    if (!this.rateLimitCache.has(did)) {
      const rateLimit = await this.databaseService.getRateLimit(did);
      if (rateLimit) {
        this.rateLimitCache.set(did, rateLimit);
      }
    }
    return this.rateLimitCache.get(did);
  }
  // Save or update the global game state
  saveGameState(gameState: GameState): void {
    this.databaseService.saveGameState(gameState);
  }
  deserializeNestedMap(json: string): Map<string, Map<string, string>> {
    // Parse the JSON string into an array of entries
    if (json == "{}" || json == "[]") return new Map<string, Map<string, string>>();
    const entries = JSON.parse(json) as [string, [string, string][]][];
    // Convert each entry back into a Map
    return new Map(
      entries.map(([outerKey, innerEntries]) => [
        outerKey,
        new Map(innerEntries), // Convert inner entries to a Map
      ])
    );
  }
  // Request a player by ID and store it in the player cache
  async getPlayer(id: string): Promise<Player | undefined> {
    if (!this.playerCache.has(id)) {
      const player = await this.databaseService.getPlayerById(id);

      if (player) {
        if (player.uri_meta_data_str == undefined) {
          player.uri_meta_data_str = "{}";
        }
        player.uri_meta_data = this.deserializeNestedMap(player.uri_meta_data_str);
        await this.insertPlayer(player.did, player);
        this.playerCache.set(id, player);
        //add their handle to the cache so we dont have to look it up
        this.handleCache.set(player.handle, player.did);
      }
      if (player?.status == "play") {
        this.activePlayers.add(id);
      } else {
        this.activePlayers.delete(id);
      }
    }
    return this.playerCache.get(id);
  }

  async getDid(handle: string) {
    if (!this.handleCache.has(handle)) {
      const did = await this.databaseService.getIdByHandle(handle);
      if (did) {
        this.handleCache.set(handle, did);
      } else {
        var repo = await this.bskyclient.publicagent.com.atproto.repo.describeRepo({
          repo: handle,
        });
        var res = JSON.stringify(repo, null, 2);

        var didresposne = repo.data.did;
        if (repo.success && repo?.data?.did) {
          let did = didresposne;
          this.handleCache.set(handle, did);
          this.databaseService.insertHandleId(handle, did);
        } else {
          return null;
        }
      }
    }
    return this.handleCache.get(handle);
  }
  // Delete a player by ID from the player cache
  async deletePlayer(id: string): Promise<void> {
    let player = await this.getPlayer(id);
    if (player) {
      this.handleCache.delete(player.handle);
    }
    this.playerCache.delete(id);
  }

  serializeNestedMap(map: Map<string, Map<string, string>>): string {
    return JSON.stringify([...map.entries()].map(([key, value]) => [key, [...value.entries()]]));
  }
  // Insert or update a player in both the database and cache
  async insertPlayer(id: string, player: Player): Promise<void> {
    if (player.status == "play") {
      this.activePlayers.add(id);
    } else {
      this.activePlayers.delete(id);
    }

    //handle the maps
    player.uri_meta_data_str = this.serializeNestedMap(player.uri_meta_data as Map<string, Map<string, string>>);
    await this.databaseService.insertPlayer(id, player);
    this.playerCache.set(id, player); // Update the cache
  }

  // Clear all player items from the player cache
  clearPlayerCache(): void {
    this.playerCache.clear();
  }

  // Clear all caches
  clearAllCaches(): void {
    this.playerCache.clear();
  }

  insertFollows(id: string, follows: string[]): void {
    this.databaseService.insertFollows(id, follows);
    this.followCache.set(id, follows); // Update the cache
  }
  insertFollowers(id: string, followers: string[]): void {
    this.databaseService.insertFollowers(id, followers);
    this.followCache.set(id, followers); // Update the cache
  }
  async getFollows(id: string): Promise<string[] | undefined> {
    if (!this.followCache.has(id)) {
      const follows = await this.databaseService.getFollowsById(id);
      if (follows) {
        this.followCache.set(id, follows);
      }
    }
    return this.followCache.get(id);
  }

  async doesFollow(did1: string, followingdid: string) {
    var has1Follow2 = (await this.getFollows(did1))?.includes(followingdid);
    return has1Follow2;
  }
  async isMutual(did1: string, did2: string): Promise<Boolean> {
    var has1Follow2 = (await this.getFollows(did1))?.includes(did2);
    var has2Follow1 = (await this.getFollows(did2))?.includes(did1);

    return Boolean(has1Follow2) && Boolean(has2Follow1);
  }

  async getFollowers(id: string): Promise<string[] | undefined> {
    if (!this.followerCache.has(id)) {
      const followers = await this.databaseService.getFollowersById(id);
      if (followers) {
        this.followerCache.set(id, followers);
      }
    }
    return this.followerCache.get(id);
  }
  removeInactivePlayers(): void {
    //may need to tweak based on activity, could go up, could go down
    const oneHourAgo = Date.now() - 3600000; // 3600000 ms = 1 hour
    for (const [id, player] of this.playerCache) {
      if (player.lastactivity < oneHourAgo) {
        this.playerCache.delete(id);
      }
    }
  }

  async createPlayer(did: string): Promise<Player> {
    const newPlayer: Player = {
      handle: "", // Default empty handle
      did: did, // The DID passed in
      pds: "",
      inventory: [], // Empty inventory initially
      status: "initial",
      lastactivity: Date.now(),
      uri_meta_data: new Map(),
      uri_meta_data_str: "",
    };

    const profileData: PlayerProfileData = {
      did: did,
      handle: "",
      description: "",
      displayName: "",
      followsCount: 0,
      pronouns: "",
    };

    var ratelimits = {
      did: did,
      count: 0,
      lastReset: 0,
      overLimitAttempts: 0,
      abusive: false,
    };

    await this.insertRateLimit(ratelimits);
    //get the user profile data
    var repo = await this.bskyclient.publicagent.com.atproto.repo.describeRepo({
      repo: did,
    });

    newPlayer.handle = repo.data.handle;
    newPlayer.pds = (repo.data.didDoc as { service: any[] })?.service[0].serviceEndpoint;

    this.handleCache.set(newPlayer.handle, newPlayer.did);

    var profileLocation = await this.bskyclient.pdsagents
      .getAgent(newPlayer.pds)
      .com.atproto.repo.listRecords({ repo: did, collection: "app.bsky.actor.profile" });
    var profileResponse = profileLocation.data.records[0].value as Record;

    profileData.description = profileResponse?.description ? profileResponse.description : "";
    profileData.displayName = profileResponse?.displayName ? profileResponse.displayName : "";
    profileData.handle = newPlayer.handle;

    //get follows
    var follows = await this.fetchAllFollows(did, newPlayer.pds);
    profileData.followsCount = follows.length;

    var flags: ProfileFlags = { did: did, flags: [] };

    await this.databaseService.insertHandleId(newPlayer.handle, newPlayer.did);
    await this.insertPlayerProfile(profileData);
    await this.insertProfileFlags(did, flags);
    await this.insertPlayer(did, newPlayer);
    await this.insertFollows(did, follows);

    return newPlayer;
  }

  async fetchAllFollows(did: string, pds: string): Promise<string[]> {
    let allRecords: any[] = [];
    let cursor: string | undefined = undefined;

    do {
      const follows = await this.bskyclient.pdsagents.getAgent(pds).com.atproto.repo.listRecords({
        repo: did,
        collection: "app.bsky.graph.follow",
        cursor: cursor,
      });

      allRecords.push(...follows.data.records);
      cursor = follows.data.cursor;
    } while (cursor);

    var follows: string[] = [];
    allRecords.forEach((rec) => {
      follows.push(rec.value.subject);
    });

    return follows;
  }
}
