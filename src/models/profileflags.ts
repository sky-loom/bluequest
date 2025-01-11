export interface ProfileFlag {
  name: string;
  value: number;
}

export interface ProfileFlags {
  did: string;
  flags: ProfileFlag[];
}
