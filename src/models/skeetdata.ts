export interface SkeetData {
  did: string;
  type: string; //post, like, reply
  time: number;
}

export interface SkeetDataSummary {
  did: string;
  post: number;
  like: number;
  reply: number;
  lastActiveTime: number;
  runTime: number;
}
