import { Logger } from "../../models/logger.js";
import { BskyClient } from "../../services/bskyclient.js";
import { DatabaseService } from "../../services/database.postgres.js";
import { JetstreamIngest } from "../../services/jetstreamingest.js";
import { Repo } from "../../services/repo.js";

const logger: Logger = {
  log: console.log,
  warn: console.warn,
  error: console.error,
};

const db = new DatabaseService(logger);
//we shouldn't use this here.... but I dont feel like unwinding
const bskyclient: BskyClient = new BskyClient();
//await db.dropAllTables();
await db.initialize();
var repo: Repo = new Repo(db, bskyclient);
await repo.init();

//setup example handlers for JetStream

const jet = new JetstreamIngest(repo, logger);
jet.on("player.setstatus", async (event) => {
  console.log(`Handling player.setstatus event: ${event.did}`);
});
jet.on("player.active", async (event) => {
  console.log(`Handling player.active event: ${event.did}`);
});
jet.on("player.inactive", async (event) => {
  console.log(`Handling player.inactive event: ${event.did}`);
});
jet.on("player.command", async (event) => {
  console.log(`Handling player.command event: ${event.did} ${event.name}`);
});

async function shutdown(signal: string) {
  console.log(`JetStream: Received ${signal}. Shutting down...`);
  await jet.shutdown(); //any cleanup here
  console.log("JetStream: Flushing DB Pending Writes");
  await repo.flushSkeetDataBuffer();
  console.log(`JetStream: Exiting process`);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT")); // Ctrl+C or Docker stop

await jet.run();
