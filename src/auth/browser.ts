import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { Credential } from "../models.js";

// macOS Chrome/Firefox cookie paths for TikTok
const CHROME_COOKIES_PATH = join(
  homedir(),
  "Library/Application Support/Google/Chrome/Default/Cookies"
);
const FIREFOX_PROFILE_DIR = join(homedir(), "Library/Application Support/Firefox/Profiles");

const TIKTOK_COOKIES = ["msToken", "sessionid", "tt_webid_v2", "ttwid"];

interface RawCookie {
  name: string;
  value: string;
  host: string;
  encrypted_value?: Buffer;
}

async function readSqlite(dbPath: string, query: string): Promise<RawCookie[]> {
  // Use Bun's built-in sqlite
  const { Database } = await import("bun:sqlite");
  const tmpPath = `/tmp/tkt_cookies_${Date.now()}.db`;

  // Copy DB to avoid lock conflicts
  await Bun.write(tmpPath, Bun.file(dbPath));

  try {
    const db = new Database(tmpPath, { readonly: true });
    const rows = db.query(query).all() as RawCookie[];
    db.close();
    return rows;
  } finally {
    const fs = await import("fs");
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}

async function extractChromeCookies(): Promise<Record<string, string>> {
  if (!existsSync(CHROME_COOKIES_PATH)) return {};

  try {
    const rows = await readSqlite(
      CHROME_COOKIES_PATH,
      `SELECT name, value, host_key as host, encrypted_value FROM cookies WHERE host_key LIKE '%tiktok.com%'`
    );

    const result: Record<string, string> = {};
    for (const row of rows) {
      if (TIKTOK_COOKIES.includes(row.name) && row.value) {
        result[row.name] = row.value;
      }
    }
    return result;
  } catch {
    return {};
  }
}

async function findFirefoxProfile(): Promise<string | null> {
  if (!existsSync(FIREFOX_PROFILE_DIR)) return null;
  try {
    const { readdirSync } = await import("fs");
    const profiles = readdirSync(FIREFOX_PROFILE_DIR);
    // Prefer default-release profile
    const preferred = profiles.find((p) => p.endsWith(".default-release")) ?? profiles.find((p) => p.includes("default"));
    if (!preferred) return null;
    return join(FIREFOX_PROFILE_DIR, preferred, "cookies.sqlite");
  } catch {
    return null;
  }
}

async function extractFirefoxCookies(): Promise<Record<string, string>> {
  const cookiePath = await findFirefoxProfile();
  if (!cookiePath || !existsSync(cookiePath)) return {};

  try {
    const rows = await readSqlite(
      cookiePath,
      `SELECT name, value, host as host FROM moz_cookies WHERE host LIKE '%tiktok.com%'`
    );

    const result: Record<string, string> = {};
    for (const row of rows) {
      if (TIKTOK_COOKIES.includes(row.name) && row.value) {
        result[row.name] = row.value;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export async function extractBrowserCredential(): Promise<Credential | null> {
  // Try Chrome first, then Firefox
  let cookies = await extractChromeCookies();
  let source: "browser" = "browser";

  if (!cookies.msToken && !cookies.sessionid) {
    cookies = await extractFirefoxCookies();
  }

  if (!cookies.msToken && !cookies.sessionid) return null;

  return {
    msToken: cookies.msToken,
    sessionid: cookies.sessionid,
    source,
    savedAt: Date.now(),
  };
}
