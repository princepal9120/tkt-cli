import { Command } from "commander";
import { TikTokClient } from "../client/index.js";
import { loadCredential, isAuthenticated } from "../config.js";
import { printError, printInfo, printJson } from "../output/index.js";
import { fmt } from "../output/format.js";
import Table from "cli-table3";
import chalk from "chalk";
import type {
  AccountAnalytics,
  VideoAnalytics,
  CompetitorAnalysis,
  GrowthData,
} from "../models.js";
import { computeGrowthData, sortVideos, type SortKey } from "../metrics.js";

function renderAccountAnalytics(a: AccountAnalytics): void {
  console.log(chalk.bold(`\nAccount Analytics: @${a.username}`));

  const t = new Table({ style: { border: ["grey"] } });
  t.push(
    [chalk.bold("Username"), `@${a.username}`],
    ["Followers", fmt(a.followerCount)],
    ["Following", fmt(a.followingCount)],
    ["Total likes", fmt(a.totalLikes)],
    ["Total videos", fmt(a.totalVideos)],
    ["Avg views", fmt(a.avgViews)],
    ["Avg likes", fmt(a.avgLikes)],
    ["Avg comments", fmt(a.avgComments)],
    ["Engagement rate", `${(a.engagementRate * 100).toFixed(2)}%`],
    ["Period", a.period],
  );
  console.log(t.toString());
}

function renderVideoAnalytics(v: VideoAnalytics): void {
  console.log(chalk.bold(`\nVideo Analytics: ${v.videoId}`));

  const t = new Table({ style: { border: ["grey"] } });
  t.push(
    [chalk.bold("Video ID"), v.videoId],
    ["Views", fmt(v.views)],
    ["Likes", fmt(v.likes)],
    ["Comments", fmt(v.comments)],
    ["Shares", fmt(v.shares)],
    ["Engagement rate", `${(v.engagementRate * 100).toFixed(2)}%`],
    ["Completion rate", `${(v.completionRate * 100).toFixed(2)}%`],
  );
  console.log(t.toString());
}

function renderCompetitor(c: CompetitorAnalysis): void {
  console.log(chalk.bold(`\nCompetitor Analysis: @${c.username}`));

  const summary = new Table({ style: { border: ["grey"] } });
  summary.push(
    [chalk.bold("Username"), `@${c.username}`],
    ["Followers", fmt(c.followerCount)],
    ["Avg views", fmt(c.avgViews)],
    ["Avg engagement", `${(c.avgEngagementRate * 100).toFixed(2)}%`],
    ["Posts per week", c.postingFrequencyPerWeek.toFixed(1)],
  );
  console.log(summary.toString());

  if (c.topHashtags.length) {
    console.log(chalk.bold("\nTop Hashtags"));
    const ht = new Table({
      head: [chalk.cyan("#"), chalk.cyan("Hashtag"), chalk.cyan("Count")],
      style: { border: ["grey"] },
    });
    for (const [i, [tag, count]] of c.topHashtags.slice(0, 10).entries()) {
      ht.push([String(i + 1), `#${tag}`, String(count)]);
    }
    console.log(ht.toString());
  }

  // Top videos
  const topVideos = c.topVideos;
  if (topVideos.length) {
    console.log(chalk.bold("\nTop Videos"));
    const vt = new Table({
      head: [chalk.cyan("#"), chalk.cyan("Views"), chalk.cyan("Likes"), chalk.cyan("Engagement"), chalk.cyan("Description")],
      style: { border: ["grey"] },
      colWidths: [4, 9, 9, 12, 50],
      wordWrap: true,
    });
    for (const [i, v] of topVideos.slice(0, 5).entries()) {
      const views = v.playCount || 1;
      const eng = ((v.likeCount + v.commentCount + v.shareCount) / views * 100).toFixed(2) + "%";
      const desc = v.desc.length > 48 ? v.desc.slice(0, 47) + "…" : v.desc;
      vt.push([String(i + 1), fmt(v.playCount), fmt(v.likeCount), eng, desc]);
    }
    console.log(vt.toString());
  }

  // Content angles
  const angles = c.contentAngles ?? [];
  if (angles.length) {
    console.log(chalk.bold("\nContent Angles"));
    const at = new Table({ style: { border: ["grey"] } });
    for (const [i, angle] of angles.slice(0, 10).entries()) {
      at.push([String(i + 1), angle]);
    }
    console.log(at.toString());
  }
}

function renderGrowth(g: GrowthData & { bestVideoDesc?: string }): void {
  console.log(chalk.bold(`\nGrowth Report (${g.period})`));

  const t = new Table({ style: { border: ["grey"] } });
  const deltaSign = g.followerDelta >= 0 ? "+" : "";
  const viewsSign = g.avgViewsDelta >= 0 ? "+" : "";
  t.push(
    ["Period", g.period],
    ["Current followers", fmt(g.currentFollowers)],
    ["Follower delta", chalk.bold(`${deltaSign}${fmt(g.followerDelta)}`)],
    ["Avg views delta", `${viewsSign}${fmt(g.avgViewsDelta)}`],
  );
  if (g.bestPerformingVideoId) {
    t.push(["Best video ID", g.bestPerformingVideoId]);
    if (g.bestVideoDesc) t.push(["Best video desc", g.bestVideoDesc]);
  }
  console.log(t.toString());
}

export function registerAnalyticsCommands(program: Command): void {
  // analytics [username]
  program
    .command("analytics [username]")
    .description("Account or video analytics")
    .option("--video <id>", "Analyze a specific video by ID")
    .option("--json", "JSON output")
    .action(async (username: string | undefined, opts: { video?: string; json?: boolean }) => {
      const client = new TikTokClient(loadCredential());

      try {
        if (opts.video) {
          const data = await client.getVideoAnalytics(opts.video);
          if (opts.json) {
            printJson({ ok: true, schema_version: "1.0", data });
          } else {
            renderVideoAnalytics(data);
          }
          return;
        }

        let targetUser = username;
        if (!targetUser) {
          if (!isAuthenticated()) {
            printError("No username provided and not logged in. Run: tkt login");
            process.exit(1);
          }
          const me = await client.getWhoami();
          targetUser = me.uniqueId;
        }

        const data = await client.getAccountAnalytics(targetUser);
        if (opts.json) {
          printJson({ ok: true, schema_version: "1.0", data });
        } else {
          renderAccountAnalytics(data);
        }
      } catch (e) {
        printError(String(e instanceof Error ? e.message : e));
        process.exit(1);
      }
    });

  // competitor <user>
  program
    .command("competitor <user>")
    .description("Competitor analysis for a TikTok user")
    .option("-n, --count <n>", "Videos to fetch", "30")
    .option("--json", "JSON output")
    .action(async (user: string, opts: { count: string; json?: boolean }) => {
      const client = new TikTokClient(loadCredential());

      try {
        const data = await client.getCompetitorAnalysis(user, Number(opts.count));
        if (opts.json) {
          printJson({ ok: true, schema_version: "1.0", data });
        } else {
          renderCompetitor(data);
        }
      } catch (e) {
        printError(String(e instanceof Error ? e.message : e));
        process.exit(1);
      }
    });

  // growth [username]
  program
    .command("growth [username]")
    .description("Growth metrics over a time period")
    .option("--period <period>", "Period: 7d|30d|90d", "30d")
    .option("--json", "JSON output")
    .action(async (username: string | undefined, opts: { period: string; json?: boolean }) => {
      const validPeriods = ["7d", "30d", "90d"];
      if (!validPeriods.includes(opts.period)) {
        printError(`Invalid period "${opts.period}". Must be one of: ${validPeriods.join(", ")}`);
        process.exit(1);
      }

      const client = new TikTokClient(loadCredential());

      let targetUser = username;
      try {
        if (!targetUser) {
          if (!isAuthenticated()) {
            printError("No username provided and not logged in. Run: tkt login");
            process.exit(1);
          }
          const me = await client.getWhoami();
          targetUser = me.uniqueId;
        }

        const { profile, videos } = await client.getUser(targetUser, 100);
        const growthData = computeGrowthData(videos, profile, opts.period as "7d" | "30d" | "90d");

        if (opts.json) {
          printJson({ ok: true, schema_version: "1.0", data: growthData });
        } else {
          renderGrowth(growthData);
        }
      } catch (e) {
        printError(String(e instanceof Error ? e.message : e));
        process.exit(1);
      }
    });

  // top-videos <user>
  program
    .command("top-videos <user>")
    .description("Top performing videos for a TikTok user")
    .option("-n, --count <n>", "Videos to fetch", "30")
    .option("--sort <field>", "Sort by: views|likes|comments|engagement", "views")
    .option("--json", "JSON output")
    .action(async (user: string, opts: { count: string; sort: string; json?: boolean }) => {
      const validSorts = ["views", "likes", "comments", "engagement"];
      if (!validSorts.includes(opts.sort)) {
        printError(`Invalid sort "${opts.sort}". Must be one of: ${validSorts.join(", ")}`);
        process.exit(1);
      }

      const client = new TikTokClient(loadCredential());

      try {
        const { videos } = await client.getUser(user, Number(opts.count));

        const sorted = sortVideos(videos, opts.sort as SortKey);

        if (opts.json) {
          printJson({ ok: true, schema_version: "1.0", data: sorted });
          return;
        }

        printInfo(`\nTop videos for @${user} — sorted by ${opts.sort}`);
        const t = new Table({
          head: [
            chalk.cyan("#"),
            chalk.cyan("Views"),
            chalk.cyan("Likes"),
            chalk.cyan("Comments"),
            chalk.cyan("Engagement"),
            chalk.cyan("Description"),
          ],
          style: { head: [], border: ["grey"] },
          colWidths: [4, 9, 9, 10, 12, 50],
          wordWrap: true,
        });

        for (const [i, v] of sorted.entries()) {
          const views = v.playCount || 1;
          const eng = ((v.likeCount + v.commentCount + v.shareCount) / views * 100).toFixed(2) + "%";
          const desc = v.desc.length > 48 ? v.desc.slice(0, 47) + "…" : v.desc;
          t.push([
            String(i + 1),
            fmt(v.playCount),
            fmt(v.likeCount),
            fmt(v.commentCount),
            eng,
            desc,
          ]);
        }
        console.log(t.toString());
        console.log(chalk.grey(`  ${sorted.length} videos`));
      } catch (e) {
        printError(String(e instanceof Error ? e.message : e));
        process.exit(1);
      }
    });
}
