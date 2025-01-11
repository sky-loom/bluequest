export interface GameState {
  state: "running" | "paused" | "stopped" | "ended"; // Assuming other possible states
  santaInterval: number;
}
