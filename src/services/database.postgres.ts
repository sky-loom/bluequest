import pkg from "pg";
import { type Player } from "../models/player.js";
import type { GameState } from "../models/gamestate.js";
import { RateLimits } from "../models/ratelimits.js";
import { SkeetData, SkeetDataSummary } from "../models/skeetdata.js";
import { PlayerProfileData } from "../models/playerprofiledata.js";
import { ProfileFlags } from "../models/profileflags.js";
import { ConfigLoader } from "../utils/configloader.js";
import { DataWrapperEvents } from "../models/db/datawrapperevents.js";
import { DataWrapper } from "../models/db/datawrapper.js";
import { Logger } from "../models/logger.js";
import { IDatabaseService } from "../models/db/idatabaseservice.js";

export class DatabaseService implements IDatabaseService {
  private client: pkg.Client;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    this.client = new pkg.Client({
      connectionString: ConfigLoader.load().db.connectionString,
    });
    this.client.connect();
  }

  public async initialize(): Promise<void> {
    // Create tables for Player, Gift, and Elf (one table per document type)
    await this.client.query(`
            CREATE TABLE IF NOT EXISTS players (
                id TEXT PRIMARY KEY,
                document JSONB
            )
        `);

    // Create the table for gamestate (a global state)
    await this.client.query(`
            CREATE TABLE IF NOT EXISTS gamestate (
                id TEXT PRIMARY KEY,
                document JSONB
            )
        `);

    await this.client.query(`
            CREATE TABLE IF NOT EXISTS handle_id_table (
                handle TEXT PRIMARY KEY,
                id TEXT
            )
        `);

    await this.client.query(`
            CREATE TABLE IF NOT EXISTS follows (
                id TEXT PRIMARY KEY,
                document JSONB
            )
        `);

    await this.client.query(`
            CREATE TABLE IF NOT EXISTS followers (
                id TEXT PRIMARY KEY,
                document JSONB
            )
        `);
    await this.client.query(`
          CREATE TABLE IF NOT EXISTS ratelimits (
              did TEXT PRIMARY KEY,
              count INTEGER,
              lastReset BIGINT,
              overLimitAttempts INTEGER,
              abusive BOOLEAN
          );
      `);
    await this.client.query(`
        CREATE TABLE IF NOT EXISTS skeet_data_summary (
          did TEXT NOT NULL,
          post INTEGER NOT NULL,
          plike INTEGER NOT NULL,
          reply INTEGER NOT NULL,
          runTime BIGINT NOT NULL,
          PRIMARY KEY (did, runTime)
        );
      `);
    await this.client.query(`
        CREATE TABLE IF NOT EXISTS skeet_data (
          did TEXT NOT NULL,
          type TEXT,
          time BIGINT NOT NULL,
          PRIMARY KEY (did, time)
        );
      `);
    await this.client.query(`
        CREATE TABLE IF NOT EXISTS eventschedule (
          id TEXT PRIMARY KEY,
          document JSONB NOT NULL
        );
      `);
    await this.client.query(`
        CREATE TABLE IF NOT EXISTS player_profiles (
          id TEXT PRIMARY KEY,
          document JSONB
        )
      `);
    await this.client.query(`
        CREATE TABLE IF NOT EXISTS profile_flags (
          id TEXT PRIMARY KEY,
          document JSONB
        )
      `);
  }

  public async getPlayersWithStatusPlay(): Promise<Set<string>> {
    const res = await this.client.query(`
      SELECT id 
      FROM players 
      WHERE document->>'status' = 'play'
    `);

    const ids = new Set<string>(res.rows.map((row) => row.id));
    return ids;
  }
  public async getProfileFlagsByIds(ids: string[]): Promise<ProfileFlags[]> {
    const batchSize = 100; // Define batch size
    const batches: ProfileFlags[] = [];
    for (let i = 0; i < ids.length; i += batchSize) {
      const batchIds = ids.slice(i, i + batchSize);
      const res = await this.client.query(
        `
        SELECT document FROM profile_flags WHERE id = ANY($1::text[])
      `,
        [batchIds]
      );
      batches.push(...res.rows.map((row) => row.document));
    }
    return batches;
  }

  async insertProfileFlags(id: string, profileFlags: ProfileFlags): Promise<void> {
    await this.insertDocument("profile_flags", id, profileFlags);
  }

  async getProfileFlagsById(id: string): Promise<ProfileFlags | undefined> {
    return (await this.getDocumentById("profile_flags", id)) as ProfileFlags | undefined;
  }

  async deleteProfileFlagsById(id: string): Promise<void> {
    await this.deleteDocumentById("profile_flags", id);
  }

  public async insertPlayerProfile(id: string, profile: PlayerProfileData): Promise<void> {
    await this.insertDocument("player_profiles", id, profile);
  }

  public async getPlayerProfileById(id: string): Promise<PlayerProfileData | undefined> {
    return (await this.getDocumentById("player_profiles", id)) as PlayerProfileData | undefined;
  }

  public async deletePlayerProfileById(id: string): Promise<void> {
    await this.deleteDocumentById("player_profiles", id);
  }

  public async insertSkeetData(record: SkeetData): Promise<void> {
    const query = `
      INSERT INTO skeet_data (did, type, time)
      VALUES ($1, $2, $3)
      ON CONFLICT (did, time) DO NOTHING;
    `;
    await this.client.query(query, [record.did, record.type, record.time]);
  }

  public async summarizeData(): Promise<void> {
    const query = `
      INSERT INTO skeet_data_summary (did, post, plike, reply, runTime)
      SELECT 
          did,
          COUNT(CASE WHEN type = 'post' THEN 1 END) AS post,
          COUNT(CASE WHEN type = 'plike' THEN 1 END) AS plike,
          COUNT(CASE WHEN type = 'reply' THEN 1 END) AS reply,
          EXTRACT(EPOCH FROM NOW()) * 1000 AS runTime
      FROM 
          skeet_data
      WHERE 
          time >= EXTRACT(EPOCH FROM (NOW() - INTERVAL '28 minutes')) * 1000
      GROUP BY 
          did;
    `;
    await this.client.query(query);
  }

  public async aggregateDailySummaryAndCleanup(): Promise<void> {
    try {
      await this.client.query("BEGIN");

      const aggregationQuery = `
        INSERT INTO skeet_data_summary (did, post, plike, reply, runTime)
        SELECT 
            'daily_summary' as did,
            SUM(post) AS post,
            SUM(plike) AS plike,
            SUM(reply) AS reply,
            EXTRACT(EPOCH FROM NOW()) * 1000 AS runTime
        FROM 
            skeet_data_summary
        WHERE 
            runTime >= EXTRACT(EPOCH FROM (NOW() - INTERVAL '1 day')) * 1000
        RETURNING did, runTime;
      `;

      const deleteQuery = `
        DELETE FROM skeet_data_summary
        WHERE runTime >= EXTRACT(EPOCH FROM (NOW() - INTERVAL '1 day')) * 1000;
      `;

      const { rows } = await this.client.query(aggregationQuery);
      this.logger.log(`DatabaseService: Aggregated daily summary for ${rows.length} entries`);

      await this.client.query(deleteQuery);
      this.logger.log("DatabaseService: Deleted old summary entries");

      await this.client.query("COMMIT");
    } catch (error) {
      await this.client.query("ROLLBACK");
      this.logger.error("DatabaseService: Error during aggregation and cleanup:", error);
    } finally {
      //this.client.release();
    }
  }

  public async insertSkeetDataBatch(records: SkeetData[]): Promise<void> {
    if (records.length === 0) {
      return;
    }

    // Extract arrays of columns
    const dids = records.map((record) => record.did);
    const types = records.map((record) => record.type);
    const times = records.map((record) => record.time);

    const query = `
      WITH data (did, type, time) AS (
        SELECT * FROM UNNEST($1::text[], $2::text[], $3::bigint[])
      )
      INSERT INTO skeet_data (did, type, time)
      SELECT did, type, time FROM data
      ON CONFLICT (did, time) DO NOTHING;
    `;

    await this.client.query(query, [dids, types, times]);
  }
  public async deleteSkeetData(did: string, time: number): Promise<void> {
    const query = `
      DELETE FROM skeet_data
      WHERE did = $1 AND time = $2;
    `;
    await this.client.query(query, [did, time]);
  }

  public async getSkeetData(did: string, time: number): Promise<SkeetData | undefined> {
    const query = `
      SELECT * FROM skeet_data
      WHERE did = $1 AND time = $2;
    `;
    const result = await this.client.query(query, [did, time]);
    return result.rows.length > 0 ? (result.rows[0] as SkeetData) : undefined;
  }

  public async deleteSkeetDataSummary(did: string, runTime: number): Promise<void> {
    const query = `
      DELETE FROM skeet_data_summary
      WHERE did = $1 AND runTime = $2;
    `;
    await this.client.query(query, [did, runTime]);
  }

  public async getSkeetDataSummary(did: string, runTime: number): Promise<SkeetDataSummary | undefined> {
    const query = `
      SELECT * FROM skeet_data_summary
      WHERE did = $1 AND runTime = $2;
    `;
    const result = await this.client.query(query, [did, runTime]);
    return result.rows.length > 0 ? (result.rows[0] as SkeetDataSummary) : undefined;
  }
  //rate limits
  async insertRatelimit(record: RateLimits): Promise<void> {
    const query = `
      INSERT INTO ratelimits (did, count, lastReset, overLimitAttempts, abusive)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (did) DO NOTHING;
  `;
    await this.client.query(query, [record.did, record.count, record.lastReset, record.overLimitAttempts, record.abusive]);
  }
  async deleteRecord(did: string): Promise<void> {
    const query = `
        DELETE FROM ratelimits
        WHERE did = $1;
    `;
    await this.client.query(query, [did]);
  }

  async getRateLimit(did: string): Promise<RateLimits | undefined> {
    const query = `
        SELECT * FROM ratelimits WHERE did = $1;
    `;
    const result = await this.client.query(query, [did]);
    return result.rows.length > 0 ? (result.rows[0] as RateLimits) : undefined;
  }

  // Insert or update a player document
  async insertPlayer(id: string, player: Player): Promise<void> {
    await this.insertDocument("players", id, player);
  }

  // Get a player by ID
  async getPlayerById(id: string): Promise<Player | undefined> {
    return (await this.getDocumentById("players", id)) as Player | undefined;
  }

  // Delete a player by ID
  async deletePlayerById(id: string): Promise<void> {
    await this.deleteDocumentById("players", id);
  }

  async insertFollows(id: string, follows: string[]): Promise<void> {
    await this.insertDocument("follows", id, { data: follows });
  }

  // Get a player by ID
  async getFollowsById(id: string): Promise<string[] | undefined> {
    const result = await this.getDocumentById("follows", id);
    const dataWrapper: DataWrapper | undefined = result as DataWrapper | undefined;
    return dataWrapper?.data;
  }

  //fix later to use json object...
  async insertEventSchedule(id: string, events: string): Promise<void> {
    await this.insertDocument("eventschedule", id, { data: events });
  }

  // Get a player by ID
  async getEventSchedule(id: string): Promise<string | undefined> {
    const result = await this.getDocumentById("eventschedule", id);
    const dataWrapper: DataWrapperEvents | undefined = result as DataWrapperEvents | undefined;
    return dataWrapper?.data;
  }

  // Delete a player by ID
  async deleteFollowsById(id: string): Promise<void> {
    await this.deleteDocumentById("followers", id);
  }

  async insertFollowers(id: string, player: string[]): Promise<void> {
    await this.insertDocument("followers", id, player);
  }

  // Get a player by ID
  async getFollowersById(id: string): Promise<string[] | undefined> {
    return (await this.getDocumentById("followers", id)) as string[] | undefined;
  }

  // Delete a player by ID
  async deleteFollowersById(id: string): Promise<void> {
    await this.deleteDocumentById("follows", id);
  }

  // Generic insert method for all documents
  private async insertDocument(table: string, id: string, document: object): Promise<void> {
    const query = `
            INSERT INTO ${table} (id, document) VALUES ($1, $2)
            ON CONFLICT (id) DO UPDATE SET document = EXCLUDED.document
        `;
    await this.client.query(query, [id, document]);
  }

  // Generic method to get a document by ID
  private async getDocumentById(table: string, id: string): Promise<object | undefined> {
    const query = `
            SELECT document FROM ${table} WHERE id = $1
        `;
    const result = await this.client.query(query, [id]);
    if (result.rows.length > 0) {
      return result.rows[0].document;
    }
    return undefined;
  }

  // Generic method to delete a document by ID
  private async deleteDocumentById(table: string, id: string): Promise<void> {
    const query = `
            DELETE FROM ${table} WHERE id = $1
        `;
    await this.client.query(query, [id]);
  }

  async getAllPlayers(): Promise<Player[]> {
    return (await this.getAllDocuments("players")) as Player[];
  }

  // Save the global game state
  async saveGameState(gameState: GameState): Promise<void> {
    await this.insertDocument("gamestate", "global", gameState);
  }

  // Restore the global game state
  async getGameState(): Promise<GameState | undefined> {
    return (await this.getDocumentById("gamestate", "global")) as GameState | undefined;
  }

  async insertHandleId(handle: string, id: string): Promise<void> {
    const query = `
            INSERT INTO handle_id_table (handle, id) VALUES ($1, $2)
            ON CONFLICT (handle) DO UPDATE SET id = EXCLUDED.id
        `;
    await this.client.query(query, [handle, id]);
  }

  // Get the id by handle from the handle_id_table
  async getIdByHandle(handle: string): Promise<string | undefined> {
    const query = `
            SELECT id FROM handle_id_table WHERE handle = $1
        `;
    const result = await this.client.query(query, [handle]);
    if (result.rows.length > 0) {
      return result.rows[0].id;
    }
    return undefined;
  }

  // Delete a record by handle from the handle_id_table
  async deleteHandle(handle: string): Promise<void> {
    const query = `
            DELETE FROM handle_id_table WHERE handle = $1
        `;
    await this.client.query(query, [handle]);
  }

  // Generic method to get all documents from a table
  private async getAllDocuments(table: string): Promise<object[]> {
    const query = `
            SELECT document FROM ${table}
        `;
    const result = await this.client.query(query);
    return result.rows.map((row) => row.document);
  }
  async shutdown() {
    await this.client.end();
  }
  async dropAllTables() {
    try {
      // Query to get all table names in the skeetstival schema
      const result = await this.client.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public';
    `);

      // Iterate over each table and drop it
      for (const row of result.rows) {
        const tableName = row.tablename;
        this.logger.log(`DatabaseService: Dropping table: ${tableName}`);
        this.logger.log(`DatabaseService: DROP TABLE IF EXISTS public.${tableName} CASCADE;`);
        await this.client.query(`DROP TABLE IF EXISTS public.${tableName} CASCADE;`);
      }

      this.logger.log("DatabaseService: All tables in the public schema dropped successfully.");
    } catch (err) {
      this.logger.error("DatabaseService: Error dropping tables:", err);
    } finally {
    }
  }
}
