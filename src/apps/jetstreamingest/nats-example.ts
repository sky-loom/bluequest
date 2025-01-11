import { connect, StringCodec } from "nats";
import { Logger } from "../../models/logger.js";
import { BskyClient } from "../../services/bskyclient.js";
import { DatabaseService } from "../../services/database.postgres.js";
import { JetstreamIngest } from "../../services/jetstreamingest.js";
import { Repo } from "../../services/repo.js";
import { ConfigLoader } from "../../utils/configloader.js";

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

//setup NATS
const nc = await connect(ConfigLoader.load().nats);
const sc = StringCodec();

//setup example handlers for JetStream

const jet = new JetstreamIngest(repo, logger);
jet.on("player.setstatus", async (event) => {
  nc.publish("player.setstatus", sc.encode(JSON.stringify({ did: event.did, arg: event.arg })));
});
jet.on("player.active", async (event) => {
  nc.publish("player.active", sc.encode(JSON.stringify(event.did)));
});
jet.on("player.inactive", async (event) => {
  nc.publish("player.inactive", sc.encode(JSON.stringify(event.did)));
});
jet.on("player.command", async (event) => {
  nc.publish("player.command", sc.encode(JSON.stringify({ did: event.did, posttext: event.posttext, event: event })));
});

async function shutdown(signal: string) {
  console.log(`JetStream: Received ${signal}. Shutting down...`);
  await jet.shutdown(); //any cleanup here
  console.log("JetStream: Flushing DB Pending Writes");
  await repo.flushSkeetDataBuffer();

  //close NATS
  console.log(`JetStream: Closing NATS connection`);
  await nc.close();
  console.log(`JetStream: Exiting process`);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT")); // Ctrl+C or Docker stop

await jet.run();
