import { existsSync } from "fs";
import { homedir, platform } from "os";
import { join } from "path";
import type { Credential } from "../models.js";

const IS_MAC = platform() === "darwin";
const IS_LINUX = platform() === "linux";

interface BrowserProfile {
  path: string;
  keychainService: string;
  keychainAccount: string;
}

const CHROMIUM_PROFILES_MAC: BrowserProfile[] = [
  {
    path: join(homedir(), "Library/Application Support/Google/Chrome/Default/Cookies"),
    keychainService: "Chrome Safe Storage",
    keychainAccount: "Chrome",
  },
  {
    path: join(homedir(), "Library/Application Support/BraveSoftware/Brave-Browser/Default/Cookies"),
    keychainService: "Brave Safe Storage",
    keychainAccount: "Brave",
  },
  {
    path: join(homedir(), "Library/Application Support/Microsoft Edge/Default/Cookies"),
    keychainService: "Microsoft Edge Safe Storage",
    keychainAccount: "Microsoft Edge",
  },
];

const CHROMIUM_PROFILES_LINUX: BrowserProfile[] = [
  {
    path: join(homedir(), ".config/google-chrome/Default/Cookies"),
    keychainService: "",
    keychainAccount: "Chrome",
  },
  {
    path: join(homedir(), ".config/BraveSoftware/Brave-Browser/Default/Cookies"),
    keychainService: "",
    keychainAccount: "Brave",
  },
];

const CHROMIUM_PROFILES = IS_MAC ? CHROMIUM_PROFILES_MAC : CHROMIUM_PROFILES_LINUX;

const FIREFOX_PROFILE_DIR = IS_MAC
  ? join(homedir(), "Library/Application Support/Firefox/Profiles")
  : join(homedir(), ".mozilla/firefox");

const TIKTOK_COOKIES = ["msToken", "sessionid", "tt_webid_v2", "ttwid"];

interface RawCookie {
  name: string;
  value: string;
  host: string;
  encrypted_value?: Uint8Array;
}

async function readSqlite(dbPath: string, query: string): Promise<RawCookie[]> {
  const { Database } = await import("bun:sqlite");
  const tmpPath = `/tmp/tkt_cookies_${Date.now()}.db`;
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

function getKeychainPassword(service: string, account: string): string | null {
  try {
    const result = Bun.spawnSync([
      "security", "find-generic-password",
      "-w", "-a", account, "-s", service,
    ]);
    if (result.exitCode === 0) {
      return Buffer.from(result.stdout).toString("utf-8").trim();
    }
  } catch { /* ignore */ }
  return null;
}

async function deriveAesKey(password: string): Promise<Buffer> {
  const { pbkdf2Sync } = await import("crypto");
  // macOS: 1003 iterations; Linux: 1 iteration with fixed password "peanuts"
  const iterations = IS_MAC ? 1003 : 1;
  return pbkdf2Sync(password, "saltysalt", iterations, 16, "sha1");
}

async function decryptCookieValue(
  encryptedRaw: Uint8Array | undefined,
  plainValue: string,
  aesKey: Buffer | null,
): Promise<string | null> {
  if (plainValue) return plainValue;
  if (!encryptedRaw || encryptedRaw.length < 4) return null;

  const buf = Buffer.from(encryptedRaw);
  const prefix = buf.slice(0, 3).toString("ascii");

  // v20 uses a per-profile local-state key — not yet supported
  if (prefix === "v20") return null;

  if (prefix !== "v10" && prefix !== "v11") {
    // Older unencrypted format stored as raw bytes
    return buf.toString("utf-8") || null;
  }

  if (!aesKey) return null;

  try {
    const { createDecipheriv } = await import("crypto");
    const iv = Buffer.alloc(16, 0x20); // 16 space chars
    const ciphertext = buf.slice(3);
    const decipher = createDecipheriv("aes-128-cbc", aesKey, iv);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    // Chrome prepends a 32-byte header to the plaintext before encrypting
    return decrypted.slice(32).toString("utf-8");
  } catch {
    return null;
  }
}

async function extractChromiumCookies(): Promise<Record<string, string>> {
  for (const profile of CHROMIUM_PROFILES) {
    if (!existsSync(profile.path)) continue;
    try {
      const rows = await readSqlite(
        profile.path,
        `SELECT name, value, host_key as host, encrypted_value
         FROM cookies
         WHERE host_key LIKE '%tiktok.com%'`,
      );

      let aesKey: Buffer | null = null;
      if (IS_MAC && profile.keychainService) {
        const password = getKeychainPassword(profile.keychainService, profile.keychainAccount);
        if (password) aesKey = await deriveAesKey(password);
      } else if (IS_LINUX) {
        aesKey = await deriveAesKey("peanuts");
      }

      const result: Record<string, string> = {};
      for (const row of rows) {
        if (!TIKTOK_COOKIES.includes(row.name)) continue;
        const value = await decryptCookieValue(row.encrypted_value, row.value, aesKey);
        if (value) result[row.name] = value;
      }

      if (result.msToken || result.sessionid) return result;
    } catch {
      continue;
    }
  }
  return {};
}

async function findFirefoxProfile(): Promise<string | null> {
  if (!existsSync(FIREFOX_PROFILE_DIR)) return null;
  try {
    const { readdirSync } = await import("fs");
    const profiles = readdirSync(FIREFOX_PROFILE_DIR);
    const preferred =
      profiles.find((p) => p.endsWith(".default-release")) ??
      profiles.find((p) => p.includes("default"));
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
      `SELECT name, value, host FROM moz_cookies WHERE host LIKE '%tiktok.com%'`,
    );
    const result: Record<string, string> = {};
    for (const row of rows) {
      if (TIKTOK_COOKIES.includes(row.name) && row.value) result[row.name] = row.value;
    }
    return result;
  } catch {
    return {};
  }
}

export async function extractBrowserCredential(): Promise<Credential | null> {
  let cookies = await extractChromiumCookies();

  if (!cookies.msToken && !cookies.sessionid) {
    cookies = await extractFirefoxCookies();
  }

  if (!cookies.msToken && !cookies.sessionid) return null;

  return {
    msToken: cookies.msToken,
    sessionid: cookies.sessionid,
    ttwid: cookies.ttwid,
    tt_webid_v2: cookies.tt_webid_v2,
    source: "browser",
    savedAt: Date.now(),
  };
}
