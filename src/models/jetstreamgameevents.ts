import { CommitCreateEvent } from "@skyware/jetstream";

//any game event that needs to be handled.  The name should be associated with a handler to
// either handle the event directly or via networking or database calls
export interface JSGameEvent {
  name: string;
}

//any actvity that requires a DID, including things that aren't commands, such as likes.
export interface JSGameEventDID extends JSGameEvent {
  did: string;
}

//general commands that require information
export interface JSGameEventPost extends JSGameEventDID {
  posttext: string;
  event: CommitCreateEvent<"app.bsky.feed.post">;
}

//for play/quit commands
export interface JSGameEventControl extends JSGameEventDID {
  arg: string;
}
