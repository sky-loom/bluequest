import { CommitCreateEvent, Jetstream } from "@skyware/jetstream";
import ws from "ws";
import { DatabaseService } from "./database.postgres.js";
import { Repo } from "./repo.js";
import { BskyClient } from "./bskyclient.js";
import { connect, NatsConnection, StringCodec } from "nats";
import { SkeetData } from "../models/skeetdata.js";
import { PlayerActivityTracker } from "./playeractivitytracker.js";
import { ConfigLoader } from "../utils/configloader.js";
import { Logger } from "../models/logger.js";
import { JSGameEventControl, JSGameEventDID, JSGameEventPost } from "../models/jetstreamgameevents.js";

export interface JetstreamEventMap {
  "player.active": JSGameEventDID;
  "player.inactive": JSGameEventDID;
  "player.setstatus": JSGameEventControl;
  "player.command": JSGameEventPost;
}

export class JetstreamIngest {
  private repo: Repo;
  private logger: Logger;
  private playerActivity: PlayerActivityTracker = new PlayerActivityTracker();
  private jetstream: Jetstream;
  private eventHandlers: { [K in keyof JetstreamEventMap]?: Array<(event: JetstreamEventMap[K]) => void> } = {};
  constructor(repo: Repo, logger: Logger) {
    this.repo = repo;
    this.logger = logger;
    this.jetstream = new Jetstream({
      ws: ws,
      wantedCollections: ["app.bsky.feed.post", "app.bsky.feed.like"], // omit to receive all collections
      wantedDids: ConfigLoader.load().jetstream.wantedDids.length > 0 ? ConfigLoader.load().jetstream.wantedDids : undefined,
    });
  }

  // Register an event handler
  public on<K extends keyof JetstreamEventMap>(eventName: K, handler: (event: JetstreamEventMap[K]) => Promise<void>) {
    if (!this.eventHandlers[eventName]) {
      this.eventHandlers[eventName] = [];
    }
    this.eventHandlers[eventName]!.push(handler);
  }

  // Trigger an event
  public trigger<K extends keyof JetstreamEventMap>(event: JetstreamEventMap[K]) {
    const handlers = this.eventHandlers[event.name as K] || [];
    handlers.forEach((handler) => handler(event));
  }

  async run() {
    this.logger.log("JetStream: Init JetStream...");
    this.jetstream.onCreate("app.bsky.feed.post", async (event) => {
      await this.checkForCommand(event, event.did, event.commit.record.text);

      if (this.repo.isPlayerPlaying(event.did)) {
        if (this.playerActivity.refreshActivity(event.did)) {
          this.trigger({ name: "player.active", did: event.did } as JSGameEventDID);
        }
        //just save english events rn
        if (event.commit.record.langs?.includes("en")) {
          if (event.commit.record.reply) {
            await this.insertDb({
              did: event.did,
              type: "reply",
              time: Date.now(),
            });
          } else {
            await this.insertDb({
              did: event.did,
              type: "post",
              time: Date.now(),
            });
          }
        }
      }
    });

    this.jetstream.onCreate("app.bsky.feed.like", async (event) => {
      if (this.repo.isPlayerPlaying(event.did)) {
        if (this.playerActivity.refreshActivity(event.did)) {
          this.trigger({ name: "player.active", did: event.did } as JSGameEventDID);
        }
        await this.insertDb({ did: event.did, type: "like", time: Date.now() });
      }
    });

    setInterval(
      () => {
        var players = this.playerActivity.clearInactivePlayers();
        players.forEach((did) => {
          this.trigger({ name: "player.inactive", did: did } as JSGameEventDID);
        });
      },
      5 * 60 * 1000 //5 minutes
    );
    this.jetstream.start();
  }

  async insertDb(data: SkeetData) {
    this.logger.log("JetStream: DB Activity Insert -> " + data.did + " " + data.type);

    this.repo.insertSkeetData(data);
  }

  async checkForCommand(event: CommitCreateEvent<"app.bsky.feed.post">, accountdid: string, record: string) {
    //all commands we need to rate limit

    if (record.length > 0) {
      if (record[0] == "@") {
        await this.parseSkeetstivalCommand(accountdid, record);
      } else if (record[0] == "!") {
        //are they playing?
        if (this.repo.isPlayerPlaying(accountdid)) {
          this.logger.log(`JetStream: Potential Game Command: ${record}`);
          this.trigger({ name: "player.command", did: accountdid, posttext: record, event: event } as JSGameEventPost);
        }
      }
    }
  }

  async parseSkeetstivalCommand(accountdid: string, input: string): Promise<void> {
    const trigger = "@" + ConfigLoader.load().accounts.trigger_handle;
    const parts = input.split(" ");

    if (parts.length >= 2) {
      if (parts[0].toLowerCase() == trigger) {
        this.logger.log(`JetStream: Command Detected: ${input}`);
        var arg = parts[1].toLowerCase();
        this.trigger({ name: "player.setstatus", did: accountdid, arg: arg } as JSGameEventControl);
        //this.nc.publish("player.setstatus", this.sc.encode(JSON.stringify({ did: accountdid, arg: arg })));
        //we wait 5 seconds before we start logging their data or killing it
        setTimeout(() => this.setPlayerStatus(accountdid, arg), 5000);
      }
    }
  }
  setPlayerStatus(did: string, status: string) {
    if (status == "play" || status == "quit" || status == "purge") {
      this.repo.overridePlayerStatus(did, status);
    }
  }
  getActivePlayers() {}
  async shutdown(): Promise<void> {
    console.log("JetStream: Jetstream shutting down...");
    this.jetstream.close();
  }
}
