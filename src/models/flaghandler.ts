import { Player } from "./player.js";
import { PlayerProfileData } from "./playerprofiledata.js";
import { ProfileFlag, ProfileFlags } from "./profileflags.js";

export interface FlagHandler {
  execute(
    profileData: PlayerProfileData,
    profileFlags: ProfileFlags,
    player: Player,
    params: string[]
  ): Promise<{ flagged: boolean; flag: ProfileFlag }>;
  profileFlag: ProfileFlag;
}
