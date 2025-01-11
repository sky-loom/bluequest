//utility interface for extracting information from a potential command
export interface CommandParseResult {
  command: string | null;
  target: string | null;
  params: string[] | null;
}
