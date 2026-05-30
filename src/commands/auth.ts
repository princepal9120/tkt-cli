import { Command } from "commander";
import { extractBrowserCredential } from "../auth/browser.js";
import { saveCredential, clearCredential, loadCredential, isAuthenticated } from "../config.js";
import { TikTokClient } from "../client/index.js";
import { printUserProfile, printSuccess, printError, printWarn, printInfo } from "../output/index.js";
import { fmt } from "../output/format.js";
import type { Credential } from "../models.js";

export function registerAuthCommands(program: Command): void {
  program
    .command("login")
    .description("Extract TikTok cookies from browser or paste ms_token manually")
    .option("--ms-token <token>", "Paste ms_token value directly")
    .option("--session-id <id>", "Paste sessionid cookie value")
    .option("--browser", "Force browser cookie extraction (default)", true)
    .action(async (opts: { msToken?: string; sessionId?: string; browser: boolean }) => {
      // Manual token input
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

      // Browser extraction
      printInfo("Extracting TikTok cookies from browser...");
      const cred = await extractBrowserCredential();

      if (cred) {
        saveCredential(cred);
        const parts: string[] = [];
        if (cred.msToken) parts.push("msToken");
        if (cred.sessionid) parts.push("sessionid");
        printSuccess(`Saved credentials (${parts.join(", ")}) from browser → ~/.tkt/config.json`);
      } else {
        printWarn("Could not auto-extract cookies from Chrome/Firefox.");
        console.log("");
        console.log("Manual steps:");
        console.log("  1. Open https://www.tiktok.com in your browser");
        console.log("  2. Open DevTools → Application → Cookies → tiktok.com");
        console.log("  3. Copy the value of: msToken  and/or  sessionid");
        console.log("  4. Run: tkt login --ms-token <value>");
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
