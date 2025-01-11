import { Bot } from "@skyware/bot";
import type { CommandHandler } from "../models/commands/commandhandler.js";
import type { CommandParseResult } from "../models/commands/commandparseresult.js";
import type { Player } from "../models/player.js";
import type { Repo } from "./repo.js";
import { CommitCreateEvent } from "@skyware/jetstream";
import { BskyClient } from "./bskyclient.js";
import { buildATUriFromEvent, getThread, ThreadViewPostStrict } from "../utils/bskyutils.js";
import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post.js";
import { Logger } from "../models/logger.js";

export class CommandRegistry {
  private handlers: { [keyword: string]: CommandHandler } = {};
  private bot: Bot;
  private bskyClient: BskyClient;
  private logger: Logger;

  private repo: Repo;
  constructor(repo: Repo, bot: Bot, bskyClient: BskyClient, logger: Logger) {
    this.repo = repo;
    this.bot = bot;
    this.bskyClient = bskyClient;
    this.logger = logger;
  }
  // Register a new command handler
  registerCommand(keyword: string, handler: CommandHandler): void {
    this.handlers[keyword] = handler;
  }
  commandExists(command: string) {
    return command in this.handlers;
  }
  //todo, we should have a manual parser or look at how to use facets here
  parseCommand(input: string): CommandParseResult {
    const parts = input.split(" "); // Split the input string by spaces

    let command: string | null = null;
    let target: string | null = null;
    let param: string | null = null;
    let params: string[] | null = [];

    // Look for command, target, and optional extra text
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      if (!command && part.startsWith("!")) {
        command = part.substring(1); // Remove the "!" from the command
        //if the command doesn't exist, we bail
        if (!this.commandExists(command)) return { command: null, target: null, params: null };
      } else if (command && part.startsWith("@")) {
        target = part.slice(1); // The target follows the command, remove the @
      } else if (target) {
        // If there's text after the target but no extra text yet, capture it
        param = part; // Optional single word after the target
        params = [...params, param];
        //break;  // Exit once we capture the extra text
      } else if (command && part && !part.startsWith("@")) {
        // If there's any invalid text between command and target, just return the command
        return { command: command, target: null, params: null };
      }
    }

    return { command, target, params };
  }

  async executeCommand(
    event: CommitCreateEvent<"app.bsky.feed.post">,
    keyword: string,
    player: Player,
    target: string | null,
    repo: Repo,
    params: string[]
  ): Promise<void> {
    const handler = this.handlers[keyword];
    if (!handler) {
      this.logger.warn(`CommandRegistry: No handler registered for command: ${keyword}`);
      return;
    }
    var targetData: Player | undefined = undefined;
    var targetThread: ThreadViewPostStrict | undefined = undefined;
    if (handler.requiresTarget && target) {
      //convert handle to id
      this.logger.log(`CommandRegistry: Requires Target ${keyword}`);
      let did = await this.repo.getDid(target);
      if (did) {
        targetData = await this.repo.getPlayer(did);
      }
    }
    if (handler.requiresTarget && !targetData) {
      this.logger.warn(`CommandRegistry: Missing Target ${keyword}`);
      //no target, we require one, so we bail
      return;
    }
    if (handler.expectedParams > params.length) {
      this.logger.warn(`CommandRegistry: Param mismatch - expected ${handler.expectedParams} but got ${params.length}`);
      return;
    }

    //rest of command checks out, lets see if we need a thread context and grab it
    if (handler.requiresThreadContext) {
      var aturi = buildATUriFromEvent(event);
      let thread = await getThread(player, aturi, this.bskyClient);
      targetThread = thread;
      if (!thread) {
        this.logger.warn(`CommandRegistry: Missing Thread Required for Command ${keyword}`);
        return;
      }
    }

    await handler.execute({ player: player, target: targetData, event: event, thread: targetThread }, repo, params, this.bot);
  }
}
