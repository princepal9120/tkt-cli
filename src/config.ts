import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { Config, Credential } from "./models.js";

const CONFIG_DIR = join(homedir(), ".tkt");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const INDEX_CACHE_FILE = join(CONFIG_DIR, "index_cache.json");

function ensureDir(): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
}

export function loadConfig(): Config {
  if (!existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) as Config;
  } catch {
    return {};
  }
}

export function saveConfig(config: Config): void {
  ensureDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function saveCredential(cred: Credential): void {
  const config = loadConfig();
  config.credential = cred;
  saveConfig(config);
}

export function clearCredential(): void {
  const config = loadConfig();
  delete config.credential;
  saveConfig(config);
}

export function loadCredential(): Credential | undefined {
  return loadConfig().credential;
}

export function isAuthenticated(): boolean {
  const cred = loadCredential();
  return !!(cred?.msToken || cred?.sessionid);
}

export interface IndexCache {
  command: string;
  items: { id: string; type: "video" | "user" }[];
  savedAt: number;
}

export function saveIndexCache(cache: IndexCache): void {
  ensureDir();
  writeFileSync(INDEX_CACHE_FILE, JSON.stringify(cache, null, 2));
}

export function loadIndexCache(): IndexCache | null {
  if (!existsSync(INDEX_CACHE_FILE)) return null;
  try {
    return JSON.parse(readFileSync(INDEX_CACHE_FILE, "utf-8")) as IndexCache;
  } catch {
    return null;
  }
}
