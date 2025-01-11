export class PlayerActivityTracker {
  private lastActivityTimestamps: Map<string, number>;

  constructor() {
    this.lastActivityTimestamps = new Map();

    // Set an interval to clear inactive players every 5 minutes
  }
  public activeCount() {
    return this.lastActivityTimestamps.size;
  }
  public getActiveDids() {
    return Array.from(this.lastActivityTimestamps.keys());
  }
  public refreshActivity(did: string): boolean {
    let updateNeeded: boolean = !this.lastActivityTimestamps.has(did);
    this.lastActivityTimestamps.set(did, Date.now());
    //return updateNeeded;
    return true; //always returning true for now since sometimes these fall out of sync
  }

  public isActive(did: string): boolean {
    const lastActivity = this.lastActivityTimestamps.get(did);
    if (!lastActivity) {
      return false;
    }
    const oneHourInMillis = 30 * 60 * 1000;
    var activity = Date.now() - lastActivity <= oneHourInMillis;
    return activity;
  }
  public isNotActive(did: string) {
    this.lastActivityTimestamps.delete(did);
  }
  public clearInactivePlayers(): string[] {
    const oneHourInMillis = 30 * 60 * 1000;
    const now = Date.now();
    const removedPlayers: string[] = [];
    this.lastActivityTimestamps.forEach((lastactivity, did) => {
      if (now - lastactivity > oneHourInMillis) {
        this.lastActivityTimestamps.delete(did);
        removedPlayers.push(did);
      }
    });
    return removedPlayers;
  }
}
