import { Bot } from "@skyware/bot";
import type { Repo } from "../../services/repo.js";
import { CommandContext } from "./commandcontext.js";

export interface CommandHandler {
  execute(context: CommandContext, repo: Repo, params: string[], bot: Bot): Promise<void>;
  //does this command require an @handle target?
  requiresTarget: boolean;
  //number of parameters the command expects
  expectedParams: number;
  //should we download the thread for the post this command came from?
  requiresThreadContext: boolean;
}
