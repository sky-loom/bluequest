import { Agent } from "@atproto/api";

//manages connections to different PDS servers
class PDSAgentFactory {
  private agentMap: Map<string, Agent>;

  constructor() {
    this.agentMap = new Map();
  }

  // Creates or returns an existing Agent based on pds
  getAgent(pds: string): Agent {
    if (!this.agentMap.has(pds)) {
      const newAgent = new Agent(pds);
      this.agentMap.set(pds, newAgent);
    }
    return this.agentMap.get(pds)!;
  }

  // Returns the Agent based on a Player's pds property
  getAgentForPlayer(player: { pds: string }): Agent {
    return this.getAgent(player.pds);
  }

  //we should include the calls we want directly here and just do the lookup.
  // that way we can also re-lookup if someone's pds changes
}

//class for managing queries to bluesky itself. It primarily reads from unauthenticated public APIs, and occassionally directly from a user's PDS.
export class BskyClient {
  public pdsagents: PDSAgentFactory;
  public publicagent: Agent;
  constructor() {
    this.publicagent = new Agent("https://public.api.bsky.app"); //new Agent('https://bsky.social')
    this.pdsagents = new PDSAgentFactory();
  }
}
