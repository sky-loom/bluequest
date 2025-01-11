# BlueQuest

BlueQuest is a series of libraries and services designed to create games on the Bluesky platform. It provides tools for player interactions, data management, and command execution.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [Example](#example)

## Installation

To install the dependencies, run:

```sh
npm install
```

## Usage

To build the project, run:

```sh
npm run build
```

## Configuration

Configuration files are located in the `config` directory. You can specify different environments to fit whatever naming convention you need.

## Key Components

- **Models**: Define the data structures used in the game framework
- **Services**: Provide functionality for interacting with the database, managing player activities, and handling commands.
- **Utilities**: Contain helper functions for various tasks.
- **Configuration**: JSON files for different environments.

## Example

This is a very minimal and untested example. It will be more detailed in the future.

Basic needs:

- an instance of JetstreamIngest to receive data from the network
- a repo to save/load player data
- a command registry to store your commands in
- individual command implementations
- a handler to call commands in the command registry, once they have arrived via jetstream

With these, you can also add timed events with `@skyloom/eventscheduler` and have some form of main game loop.
Commands are likely to fire off other game events, and it is recommended that games work as event-driven.
In the repo `/apps/jetstreamingest/` folder is an example of firing events using NATS. This makes it relatively
simple to have a microservice architecture and avoid repeated trips to a database. It will use more memory but
won't eat as much CPU.

Again, the below code is untested at this time.

```typescript
import { CommitCreateEvent, Jetstream } from "@skyware/jetstream";
import { CommandRegistry } from "./services/commandregistry";
import { Repo } from "./services/repo";
import { BskyClient } from "./services/bskyclient";
import { Logger } from "./models/logger";
import { Bot } from "@skyware/bot";
import { DatabaseService } from "../../services/database.postgres.js";
import { JetstreamIngest } from "../../services/jetstreamingest.js";

//setup the database
const db = new DatabaseService();
await db.initialize();

//setup a repo
const repo = new Repo(db, bskyclient);
await repo.init();

//register a shutdown to cleanup the DB
async function shutdown(signal: string) {
  try {
    await db.shutdown();
  } catch {
  } finally {
    process.exit(0);
  }
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

//setup bot if needed
const bot = new Bot();
await bot.login(ConfigLoader.load().accounts.bot);

const bskyClient = new BskyClient();
const logger: Logger = {
  log: console.log,
  warn: console.warn,
  error: console.error,
};

//register any commands
const commandRegistry = new CommandRegistry(repo, bot, bskyClient, logger);

commandRegistry.registerCommand("example", {
  execute: async (context, repo, params, bot) => {
    // Command implementation
  },
  requiresTarget: false,
  expectedParams: 0,
  requiresThreadContext: false,
});

//example of how to call
// any post that begins with !example, that comes from a player who is playing, will execute
// the handler has the option of providing a rate limit as well (see PlayerHandler example below)
const command = commandRegistry.parseCommand("!example");
if (command.command) {
  commandRegistry.executeCommand(/* parameters */);
}

//class for executing commands
class PlayerHandler {
  private commands: CommandRegistry;
  private ratelimiter: RateLimiter;
  private repo: Repo;
  constructor(repo: Repo, commands: CommandRegistry) {
    this.commands = commands;
    this.ratelimiter = new RateLimiter(repo, 10, 60000, 20);
    this.repo = repo;
  }
  async handleCommand(event: JSGameEventPost) {
    const pMesg: JSGameEventPost = JSON.parse(this.sc.decode(msg.data));
    let player = await this.repo.getPlayer(pMesg.did);
    let ratelimits = await this.repo.getRateLimitById(pMesg.did);
    //player has to be playing
    //they have to be non-abusive with rate limits
    if (player?.status == "play" && ratelimits?.abusive == false) {
      //don't check rate limits here, we need to make sure
      // its a valid command first
      let command = this.commands.parseCommand(pMesg.arg);
      let params: string[] = [];
      if (command.params) params = command.params;
      //check if player hasn't abused commands
      if (ratelimits) {
        if (command && command.command && (await this.ratelimiter.canExecuteCommandPlayer(ratelimits))) {
          this.commands.executeCommand(pMesg.event, command.command, player, command.target, this.repo, params);
        }
      }
    }
  }
  async handleSetStatus() {
    const pMesg: JSGameEventControl = JSON.parse(this.sc.decode(msg.data));
    if (pMesg.arg == "play" || pMesg.arg == "quit" || pMesg.arg == "purge") {
      //get the player, they'll be created if they dont exist
      let player = await this.repo.getPlayer(pMesg.did);
      if (!player) {
        //we create them no matter what, so we can track abuse
        player = await this.repo.createPlayer(pMesg.did);
        //handle any inititialization you need here
      }
      var ratelimits = await this.repo.getRateLimitById(pMesg.did);
      //check if player hasn't abused commands
      if (ratelimits) {
        if (await this.ratelimiter.canExecuteCommandPlayer(ratelimits)) {
          await this.handleAccountOperation(player, {
            command: pMesg.arg as "play" | "quit" | "purge",
            did: pMesg.did,
          });
        }
      }
    }
  }
  async handleAccountOperation(player: Player, operation: GameAccountOperationCommand) {
    if (player.status != operation.command) {
      console.log("Status" + player.status);
      switch (operation.command) {
        case "play":
          player.status = "play";
          break;
        case "quit":
          player.status = "quit";
          console.log("Player quitting - " + player.did + " " + player.handle);
          break;
        case "purge":
          //mark as "to purge" to get rid of player data in a ckeanup operation later
          player.status = "purge";
          break;
        default:
          console.error(`Unknown command`);
      }
      await this.repo.insertPlayer(player.did, player);
    }
  }
}

//create an instance
const playerCommandHandler = new PlayerHandler(repo, commandRegistry);
//jetstream
const jet = new JetstreamIngest(repo, logger);

jet.on("player.command", async (event) => {
  await playerCommandHandler.handleCommand(event);
});
```
