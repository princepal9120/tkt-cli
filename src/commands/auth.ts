import { Command } from "commander";
import { extractBrowserCredential } from "../auth/browser.js";
import { saveCredential, clearCredential, loadCredential, isAuthenticated } from "../config.js";
import { TikTokClient } from "../client/index.js";
import { printUserProfile, printSuccess, printError, printWarn, printInfo } from "../output/index.js";
import { fmt } from "../output/format.js";
import type { Credential } from "../models.js";

function parseCookieString(raw: string): Partial<Credential> {
  const result: Partial<Credential> = {};
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "msToken") result.msToken = value;
    if (key === "sessionid") result.sessionid = value;
    if (key === "ttwid") result.ttwid = value;
    if (key === "tt_webid_v2") result.tt_webid_v2 = value;
  }
  return result;
}

export function registerAuthCommands(program: Command): void {
  program
    .command("login")
    .description("Extract TikTok cookies from browser, or paste them manually")
    .option("--ms-token <token>", "Paste msToken cookie value")
    .option("--session-id <id>", "Paste sessionid cookie value")
    .option("--cookie <string>", 'Paste full cookie string (e.g. "msToken=xxx; sessionid=yyy")')
    .option("--browser", "Force browser cookie extraction (default)", true)
    .action(async (opts: { msToken?: string; sessionId?: string; cookie?: string; browser: boolean }) => {
      // Full cookie string: parse it
      if (opts.cookie) {
        const parsed = parseCookieString(opts.cookie);
        if (!parsed.msToken && !parsed.sessionid) {
          printError("Cookie string must contain msToken and/or sessionid.");
          printWarn('Example: tkt login --cookie "msToken=abc123; sessionid=xyz456"');
          process.exit(1);
        }
        saveCredential({ ...parsed, source: "manual", savedAt: Date.now() });
        const parts = [
          parsed.msToken && "msToken",
          parsed.sessionid && "sessionid",
          parsed.ttwid && "ttwid",
          parsed.tt_webid_v2 && "tt_webid_v2",
        ].filter(Boolean);
        printSuccess(`Saved credentials (${parts.join(", ")}) → ~/.tkt/config.json`);
        return;
      }

      // Individual token flags
      if (opts.msToken || opts.sessionId) {
        const cred: Credential = {
          msToken: opts.msToken,
          sessionid: opts.sessionId,
          source: "manual",
          savedAt: Date.now(),
        };
        saveCredential(cred);
        printSuccess("Saved TikTok credentials to ~/.tkt/config.json");
        return;
      }

      // Auto browser extraction
      printInfo("Extracting TikTok cookies from browser...");
      const cred = await extractBrowserCredential();

      if (cred) {
        saveCredential(cred);
        const parts: string[] = [];
        if (cred.msToken) parts.push("msToken");
        if (cred.sessionid) parts.push("sessionid");
        if (cred.ttwid) parts.push("ttwid");
        if (cred.tt_webid_v2) parts.push("tt_webid_v2");
        printSuccess(`Saved credentials (${parts.join(", ")}) from browser → ~/.tkt/config.json`);
      } else {
        printWarn("Could not auto-extract cookies from Chrome/Brave/Firefox.");
        console.log("");
        console.log("Manual options:");
        console.log("  Option A — paste full cookie string:");
        console.log('    1. Open https://www.tiktok.com in your browser');
        console.log('    2. Open DevTools (F12) → Network → any request → Headers → Cookie');
        console.log('    3. Copy the Cookie header value');
        console.log('    4. Run: tkt login --cookie "<paste here>"');
        console.log("");
        console.log("  Option B — paste individual values:");
        console.log("    1. Open DevTools → Application → Cookies → tiktok.com");
        console.log("    2. Copy msToken and sessionid values");
        console.log("    3. Run: tkt login --ms-token <msToken> --session-id <sessionid>");
      }
    });

  program
    .command("logout")
    .description("Remove stored TikTok credentials")
    .action(() => {
      clearCredential();
      printSuccess("Logged out. Removed credentials from ~/.tkt/config.json");
    });

  program
    .command("status")
    .description("Check authentication status")
    .option("--json", "JSON output")
    .action((opts: { json?: boolean }) => {
      const cred = loadCredential();
      const authed = isAuthenticated();

      if (opts.json) {
        console.log(JSON.stringify({
          ok: true,
          schema_version: "1.0",
          data: {
            authenticated: authed,
            source: cred?.source,
            has_ms_token: !!cred?.msToken,
            has_session: !!cred?.sessionid,
          },
        }, null, 2));
        return;
      }

      if (authed) {
        const suffix = cred?.msToken ? `***${cred.msToken.slice(-6)}` : "";
        console.log(`\x1b[32m✓ Authenticated\x1b[0m  source=${cred?.source}  msToken=${suffix}`);
        if (cred?.sessionid) console.log("  sessionid present (full auth)");
      } else {
        console.log("\x1b[33m⚠ Guest mode\x1b[0m — public content only");
        console.log("  Run \x1b[1mtkt login\x1b[0m for authenticated access");
      }
    });

  program
    .command("whoami")
    .description("Show your TikTok profile")
    .option("--json", "JSON output")
    .action(async (opts: { json?: boolean }) => {
      if (!isAuthenticated()) {
        printError("Not authenticated. Run: tkt login");
        process.exit(1);
      }
      const cred = loadCredential();
      const client = new TikTokClient(cred);
      try {
        const profile = await client.getWhoami();
        if (opts.json) {
          console.log(JSON.stringify({ ok: true, schema_version: "1.0", data: profile }, null, 2));
        } else {
          printUserProfile(profile);
        }
      } catch (e) {
        printError(String(e instanceof Error ? e.message : e));
        process.exit(1);
      }
    });
}
