// Load server/.env before anything reads process.env. Import this first: ES modules run their
// imports in order, and agent/live.ts reads AGENT_MODEL etc. when it loads.
// Variables already set in the shell win over the file.

import { existsSync } from "node:fs";
import { resolve } from "node:path";

const envFile = resolve(import.meta.dirname, "../.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);
