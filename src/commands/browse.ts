import { Command } from "commander";
import { TikTokClient } from "../client/index.js";
import { loadCredential, isAuthenticated, saveIndexCache } from "../config.js";
import { printVideoTable, printUserProfile, printError, printInfo } from "../output/index.js";
import { printJson } from "../output/index.js";

function makeClient() {
  return new TikTokClient(loadCredential());
}

function cacheVideos(results: Awaited<ReturnType<TikTokClient["getTrending"]>>, command: string) {
  saveIndexCache({
    command,
    items: results.map((v) => ({ id: v.id, type: "video" as const })),
    savedAt: Date.now(),
  });
}

export function registerBrowseCommands(program: Command): void {
  program
    .command("trending")
    .description("Browse trending TikTok videos")
    .option("-n, --count <n>", "Number of results", "20")
    .option("--region <region>", "Region code (e.g. US, IN, GB)", "US")
    .option("--json", "JSON output")
    .action(async (opts: { count: string; region: string; json?: boolean }) => {
      const client = makeClient();
      try {
        const results = await client.getTrending(Number(opts.count), opts.region);
        cacheVideos(results, "trending");
        if (opts.json) {
          printJson({ ok: true, schema_version: "1.0", data: results });
        } else {
          printVideoTable(results);
        }
      } catch (e) {
        printError(String(e instanceof Error ? e.message : e));
        process.exit(1);
      }
    });

  program
    .command("hashtag <tag>")
    .description("Browse videos for a hashtag")
    .option("-n, --count <n>", "Number of results", "20")
    .option("--json", "JSON output")
    .action(async (tag: string, opts: { count: string; json?: boolean }) => {
      const client = makeClient();
      try {
        const results = await client.getHashtag(tag, Number(opts.count));
        cacheVideos(results, `hashtag ${tag}`);
        if (opts.json) {
          printJson({ ok: true, schema_version: "1.0", data: results });
        } else {
          printVideoTable(results);
        }
      } catch (e) {
        printError(String(e instanceof Error ? e.message : e));
        process.exit(1);
      }
    });

  program
    .command("user <username>")
    .description("View user profile and latest videos")
    .option("-n, --count <n>", "Number of videos", "20")
    .option("--json", "JSON output")
    .action(async (username: string, opts: { count: string; json?: boolean }) => {
      const client = makeClient();
      try {
        const { profile, videos } = await client.getUser(username, Number(opts.count));
        cacheVideos(videos, `user ${username}`);
        if (opts.json) {
          printJson({ ok: true, schema_version: "1.0", data: { profile, videos } });
        } else {
          printUserProfile(profile);
          if (videos.length) printVideoTable(videos);
        }
      } catch (e) {
        printError(String(e instanceof Error ? e.message : e));
        process.exit(1);
      }
    });

  program
    .command("user-videos <username>")
    .description("List videos from a user")
    .option("-n, --count <n>", "Number of videos", "20")
    .option("--json", "JSON output")
    .action(async (username: string, opts: { count: string; json?: boolean }) => {
      const client = makeClient();
      try {
        const { videos } = await client.getUser(username, Number(opts.count));
        cacheVideos(videos, `user-videos ${username}`);
        if (opts.json) {
          printJson({ ok: true, schema_version: "1.0", data: videos });
        } else {
          printVideoTable(videos);
        }
      } catch (e) {
        printError(String(e instanceof Error ? e.message : e));
        process.exit(1);
      }
    });

  program
    .command("feed")
    .description("Browse your TikTok feed (requires login)")
    .option("--following", "Show following feed instead of For You")
    .option("-n, --count <n>", "Number of results", "20")
    .option("--json", "JSON output")
    .action(async (opts: { following?: boolean; count: string; json?: boolean }) => {
      if (!isAuthenticated()) {
        printError("Feed requires login. Run: tkt login");
        process.exit(1);
      }
      const client = makeClient();
      try {
        const type = opts.following ? "following" : "foryou";
        printInfo(opts.following ? "Fetching following feed..." : "Fetching For You feed...");
        const results = await client.getFeed(type, Number(opts.count));
        cacheVideos(results, `feed${opts.following ? " --following" : ""}`);
        if (opts.json) {
          printJson({ ok: true, schema_version: "1.0", data: results });
        } else {
          printVideoTable(results);
        }
      } catch (e) {
        printError(String(e instanceof Error ? e.message : e));
        process.exit(1);
      }
    });
}
