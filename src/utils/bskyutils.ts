import { ReplyRef } from "@skyware/bot";
import { CommandContext } from "../models/commands/commandcontext.js";
import { CommitCreateEvent } from "@skyware/jetstream";
import { BskyClient } from "../services/bskyclient.js";
import {
  BlockedPost,
  isThreadViewPost,
  NotFoundPost,
  PostView,
  ThreadViewPost,
} from "@atproto/api/dist/client/types/app/bsky/feed/defs.js";
import { AppBskyFeedDefs } from "@atproto/api";
import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post.js";
import { Player } from "../models/player.js";

export function isReply(context: CommandContext) {
  if (context.event.commit.record.reply) return true;
  return false;
}
export function getReplyData(context: CommandContext) {
  return context.event.commit.record.reply;
}
export function makeReply(context: CommandContext): ReplyRef | undefined {
  if (isReply(context)) {
    var replyRef = structuredClone(getReplyData(context));
    //root stays the same, just need to adjust the reply reference
    if (replyRef) {
      replyRef.parent.cid = context.event.commit.cid;
      replyRef.parent.uri = `at://${context.event.did}/app.bsky.feed.post/${context.event.commit.rkey}`;
      return replyRef;
    }
  } else {
    let reply = {
      parent: {
        cid: context.event.commit.cid,
        uri: `at://${context.event.did}/app.bsky.feed.post/${context.event.commit.rkey}`,
      },
      root: {
        cid: context.event.commit.cid,
        uri: `at://${context.event.did}/app.bsky.feed.post/${context.event.commit.rkey}`,
      },
    };
    return reply;
  }
  return undefined;
}
export function didFromUri(uri: string): string {
  // Split the string by slashes
  const parts = uri.split("/");

  // Check if the structure is valid and has the expected parts
  //if (parts.length > 2 && parts[0] === "at:" && parts[1] === "") {
  return parts[2]; // The `did` is in the third part (index 2)
  //}

  //return null; // Return null if the input doesn't match the expected structure
}

function isSameReply(reply1: ReplyRef, reply2: ReplyRef): boolean {
  // Check if both 'parent' and 'root' are objects in both replies
  if (
    typeof reply1.parent !== "object" ||
    typeof reply2.parent !== "object" ||
    typeof reply1.root !== "object" ||
    typeof reply2.root !== "object"
  ) {
    return false;
  }

  // Compare 'cid' and 'uri' of 'parent' and 'root' in both replies
  return (
    reply1.parent.cid === reply2.parent.cid &&
    reply1.parent.uri === reply2.parent.uri &&
    reply1.root.cid === reply2.root.cid &&
    reply1.root.uri === reply2.root.uri
  );
}

export function getDIDFromATUri(aturi: string): string {
  return aturi.slice(5, aturi.indexOf("/", 5));
}

export interface ThreadViewPostStrict {
  post: PostView;
  parent: ThreadViewPostStrict | undefined;
  replies: ThreadViewPostStrict[];
}

export interface ThreadData {
  post: PostView;
  parent: ThreadViewPost;
}
export interface MinThreadViewPost {
  uri: string;
  did: string;
  text: string;
}
//I hate this so much.
function ExtractPostView(
  threaddata:
    | AppBskyFeedDefs.ThreadViewPost
    | AppBskyFeedDefs.NotFoundPost
    | AppBskyFeedDefs.BlockedPost
    | { $type: string; [k: string]: unknown }
): ThreadViewPostStrict | undefined {
  let retData: ThreadViewPostStrict | undefined = undefined;
  if (threaddata.$type == "app.bsky.feed.defs#threadViewPost") {
    retData = { post: threaddata.post as PostView, replies: [], parent: undefined };
  }
  if (retData?.post) {
    let tvpThreadData = threaddata as ThreadViewPost;
    if (tvpThreadData.replies) {
      tvpThreadData.replies.forEach((reply) => {
        let replyStrict = ExtractPostView(reply);
        if (replyStrict) retData.replies.push(replyStrict);
      });
    }
    if (tvpThreadData.parent) {
      let parentStrict = ExtractPostView(tvpThreadData.parent);
      if (parentStrict) retData.parent = parentStrict;
    }
  }
  return retData;
}

//function ExtractMinimalThreadParents(thread: ThreadViewPostStrict) {}
export function ExtractMinimalThreadParents(thread: ThreadViewPostStrict): MinThreadViewPost[] {
  const result: MinThreadViewPost[] = [];

  let current: ThreadViewPostStrict | undefined = thread;

  while (current) {
    result.push({
      uri: current.post.uri,
      did: current.post.author.did,
      text: (current.post.record as Record).text,
    });

    current = current.parent; // Move to the parent
  }

  return result;
}

export async function getThread(player: Player, aturi: string, bskyClient: BskyClient): Promise<ThreadViewPostStrict | undefined> {
  let data = await bskyClient.publicagent.app.bsky.feed.getPostThread({
    uri: aturi,
  });
  return ExtractPostView(data.data.thread);
}

export function buildATUriFromEvent(event: CommitCreateEvent<"app.bsky.feed.post">) {
  return `at://${event.did}/app.bsky.feed.post/${event.commit.rkey}`;
}

export function findCommand(
  command: string,
  posts: MinThreadViewPost[],
  startIndex: number = 0
): { item: MinThreadViewPost | null; index: number } {
  for (let i = startIndex; i < posts.length; i++) {
    if (posts[i].text.startsWith("!" + command)) {
      return { item: posts[i], index: i };
    }
  }

  // If no match is found
  return { item: null, index: -1 };
}
