export interface Player {
  handle: string;
  did: string;
  pds: string;
  status: string;
  lastactivity: number;
  inventory: any[]; //up to the implementor to deal with type safety here
  uri_meta_data: Map<string, Map<string, string>> | undefined;
  uri_meta_data_str: string;
}
