import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { Config, Credential } from "./models.js";
import type { Account } from "./models.js";

const CONFIG_DIR = join(homedir(), ".tkt");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const INDEX_CACHE_FILE = join(CONFIG_DIR, "index_cache.json");
const ACCOUNTS_FILE = join(CONFIG_DIR, "accounts.json");

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
  const accounts = loadAccounts();
  if (accounts.length > 0) {
    for (const a of accounts) a.isActive = false;
    saveAccounts(accounts);
  }
}

export function loadCredential(): Credential | undefined {
  const active = getActiveAccount();
  if (active?.credential) return active.credential;
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

export function loadAccounts(): Account[] {
  if (!existsSync(ACCOUNTS_FILE)) return [];
  try {
    return JSON.parse(readFileSync(ACCOUNTS_FILE, "utf-8")) as Account[];
  } catch {
    return [];
  }
}

export function saveAccounts(accounts: Account[]): void {
  ensureDir();
  writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
}

export function getActiveAccount(): Account | undefined {
  if (!existsSync(ACCOUNTS_FILE)) return undefined;
  return loadAccounts().find((a) => a.isActive);
}

export function setActiveAccount(name: string): void {
  const accounts = loadAccounts();
  const target = accounts.find((a) => a.name === name);
  if (!target) throw new Error(`Account "${name}" not found.`);
  for (const a of accounts) a.isActive = false;
  target.isActive = true;
  saveAccounts(accounts);
}
