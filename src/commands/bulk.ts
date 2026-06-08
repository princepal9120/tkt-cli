import { Command } from "commander";
import { existsSync, readFileSync } from "fs";
import { printSuccess, printError, printInfo, printWarn, printEnvelope } from "../output/index.js";
import { isAuthenticated, loadCredential } from "../config.js";
import { TikTokClient } from "../client/index.js";
import chalk from "chalk";
import type { BulkResult } from "../models.js";

const SEEN_CAP = 5000;

export function registerBulkCommands(program: Command): void {
  program
    .command("bulk-like <file>")
    .description("Like videos from a file of video IDs (one per line)")
    .option("--delay <ms>", "Delay between actions in ms", "1000")
    .option("--json", "Output result as JSON")
    .action(async (file: string, opts: { delay: string; json?: boolean }) => {
      if (!isAuthenticated()) {
        printError("bulk-like requires login. Run: tkt login");
        process.exit(1);
      }
      if (!existsSync(file)) {
        printError(`File not found: ${file}`);
        process.exit(1);
      }

      const lines = readFileSync(file, "utf-8")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"));

      const delay = Number(opts.delay) || 1000;
      const client = new TikTokClient(loadCredential());
      const result: BulkResult = {
        type: "like",
        total: lines.length,
        completed: 0,
        failed: 0,
        errors: [],
      };

      for (const [i, id] of lines.entries()) {
        try {
          await client.likeVideo(id);
          result.completed++;
          printInfo(`[${i + 1}/${lines.length}] Liked ${id}`);
        } catch (e) {
          result.failed++;
          const msg = e instanceof Error ? e.message : String(e);
          result.errors.push({ id, error: msg });
          printWarn(`[${i + 1}/${lines.length}] Failed ${id}: ${msg}`);
        }
        if (i < lines.length - 1) await Bun.sleep(delay);
      }

      if (opts.json) {
        printEnvelope(result);
      } else {
        printSuccess(
          `bulk-like done: ${result.completed} liked, ${result.failed} failed (${result.total} total)`
        );
      }
    });

  program
    .command("bulk-follow <file>")
    .description("Follow users from a file of usernames (one per line)")
    .option("--delay <ms>", "Delay between actions in ms", "2000")
    .option("--json", "Output result as JSON")
    .action(async (file: string, opts: { delay: string; json?: boolean }) => {
      if (!isAuthenticated()) {
        printError("bulk-follow requires login. Run: tkt login");
        process.exit(1);
      }
      if (!existsSync(file)) {
        printError(`File not found: ${file}`);
        process.exit(1);
      }

      const lines = readFileSync(file, "utf-8")
        .split("\n")
        .map((l) => l.trim().replace(/^@/, ""))
        .filter((l) => l && !l.startsWith("#"));

      const delay = Number(opts.delay) || 2000;
      const client = new TikTokClient(loadCredential());
      const result: BulkResult = {
        type: "follow",
        total: lines.length,
        completed: 0,
        failed: 0,
        errors: [],
      };

      for (const [i, username] of lines.entries()) {
        try {
          const { profile } = await client.getUser(username);
          await client.followUser(profile.id);
          result.completed++;
          printInfo(`[${i + 1}/${lines.length}] Followed @${username}`);
        } catch (e) {
          result.failed++;
          const msg = e instanceof Error ? e.message : String(e);
          result.errors.push({ id: username, error: msg });
          printWarn(`[${i + 1}/${lines.length}] Failed @${username}: ${msg}`);
        }
        if (i < lines.length - 1) await Bun.sleep(delay);
      }

      if (opts.json) {
        printEnvelope(result);
      } else {
        printSuccess(
          `bulk-follow done: ${result.completed} followed, ${result.failed} failed (${result.total} total)`
        );
      }
    });

  program
    .command("monitor <hashtag>")
    .description("Monitor a hashtag for new videos in real time")
    .option("--interval <seconds>", "Poll interval in seconds", "60")
    .option("--count <n>", "Videos to fetch per poll", "10")
    .option("--json", "Print new videos as JSON lines")
    .action(async (hashtag: string, opts: { interval: string; count: string; json?: boolean }) => {
      const interval = (Number(opts.interval) || 60) * 1000;
      const count = Number(opts.count) || 10;
      const client = new TikTokClient(loadCredential());

      printInfo(`Monitoring #${hashtag} every ${opts.interval}s — Ctrl+C to stop`);

      // Initial seed
      let seen: Set<string>;
      try {
        const initial = await client.getHashtag(hashtag, count);
        seen = new Set(initial.map((v) => v.id));
        printInfo(`Seeded with ${seen.size} existing videos`);
      } catch (e) {
        printError(`Failed to fetch #${hashtag}: ${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
      }

      process.on("SIGINT", () => {
        console.log();
        printInfo("Monitor stopped.");
        process.exit(0);
      });

      while (true) {
        await Bun.sleep(interval);
        try {
          const videos = await client.getHashtag(hashtag, count);
          const newVideos = videos.filter((v) => !seen.has(v.id));
          for (const v of newVideos) {
            seen.add(v.id);
            if (opts.json) {
              // Streaming command: one compact envelope per line (JSONL).
              console.log(JSON.stringify({ ok: true, schema_version: "1.0", data: v }));
            } else {
              console.log(
                chalk.green("NEW") +
                  chalk.grey(` #${hashtag}`) +
                  ` @${chalk.bold(v.author)} — ${v.desc ? v.desc.slice(0, 60) : "(no caption)"}`
              );
              console.log(chalk.grey(`  ${v.url}`));
            }
          }
          while (seen.size > SEEN_CAP) {
            const oldest = seen.values().next().value;
            if (oldest === undefined) break;
            seen.delete(oldest);
          }
          if (newVideos.length === 0) {
            printInfo(`[${new Date().toLocaleTimeString()}] No new videos`);
          }
        } catch (e) {
          printWarn(`Poll error: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    });
}
