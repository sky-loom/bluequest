import { CommitCreateEvent } from "@skyware/jetstream";
import { Player } from "../player.js";
import { ThreadViewPostStrict } from "../../utils/bskyutils.js";

//contains the context under which the command was run.
export interface CommandContext {
  //the player that executed the command
  player: Player;
  //the target if the command required one
  target: Player | undefined;
  //if the command required more data from a thread, the thread is here
  thread: ThreadViewPostStrict | undefined;
  //the jetstream event the command was fired for
  event: CommitCreateEvent<"app.bsky.feed.post">;
}
