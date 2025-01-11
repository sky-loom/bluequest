import { FlagHandler } from "../models/flaghandler.js";
import { Player } from "../models/player.js";
import { PlayerProfileData } from "../models/playerprofiledata.js";
import { ProfileFlag, ProfileFlags } from "../models/profileflags.js";

export class FlagRegistry {
  private handlers: { [name: string]: FlagHandler } = {};
  registerFlag(handler: FlagHandler): void {
    this.handlers[handler.profileFlag.name] = handler;
  }
  updateOrAddFlag(profileFlags: ProfileFlags, newFlag: ProfileFlag) {
    const index = profileFlags.flags.findIndex((flag) => flag.name === newFlag.name);

    if (index !== -1) {
      // Replace the existing flag
      profileFlags.flags[index] = newFlag;
    } else {
      // Add the new flag to the end
      profileFlags.flags.push(newFlag);
    }
  }
  removeFlag(profileFlags: ProfileFlags, flagName: string): boolean {
    const index = profileFlags.flags.findIndex((flag) => flag.name === flagName);

    if (index !== -1) {
      profileFlags.flags.splice(index, 1);
      return true; // Return true if the flag was found and removed
    }

    return false; // Return false if the flag was not found
  }
  async executeAll(profileData: PlayerProfileData, profileFlags: ProfileFlags, player: Player, params: string[]): Promise<ProfileFlags> {
    for (const keyword in this.handlers) {
      if (this.handlers.hasOwnProperty(keyword)) {
        let flag = await this.handlers[keyword].execute(profileData, profileFlags, player, params);
        if (flag.flagged) {
          this.updateOrAddFlag(profileFlags, flag.flag);
        } else {
          this.removeFlag(profileFlags, flag.flag.name);
        }
      }
    }
    //save
    return profileFlags;
  }
}
