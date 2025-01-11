import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

// Define __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Define the type for the configuration object (customized for your structure)
export interface Config {
  nats: {
    servers: string;
  };
  db: {
    connectionString: string;
  };
  jetstream: {
    wantedDids: string[];
  };
  accounts: {
    bot: {
      identifier: string;
      password: string;
    };
    trigger_handle: string;
  };
}

// Encapsulate the configuration loading logic
export class ConfigLoader {
  private static config: Config | null = null;

  public static load(envArg: string = "--env=", defaultEnv: string = "development"): Config {
    if (this.config) {
      return this.config; // Return cached configuration if already loaded
    }

    // Parse CLI arguments to find the environment
    const args = process.argv.slice(2);
    const env = args.find((arg) => arg.startsWith(envArg))?.split("=")[1] || defaultEnv;

    // Build the path to the configuration file
    const configPath = path.resolve(__dirname, `../config/${env}.json`);

    // Check if the configuration file exists
    if (!fs.existsSync(configPath)) {
      throw new Error(`Configuration file not found for environment: ${env}`);
    }

    // Load and cache the configuration
    this.config = JSON.parse(fs.readFileSync(configPath, "utf8")) as Config;

    return this.config;
  }
}
