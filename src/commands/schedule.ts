import { Command } from "commander";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { printSuccess, printError, printInfo, printWarn, printEnvelope } from "../output/index.js";
import { isAuthenticated, loadCredential } from "../config.js";
import { TikTokClient } from "../client/index.js";
import chalk from "chalk";
import Table from "cli-table3";
import type { ScheduledPost } from "../models.js";

const SCHEDULE_FILE = join(homedir(), ".tkt", "schedule.json");

function loadSchedule(): ScheduledPost[] {
  if (!existsSync(SCHEDULE_FILE)) return [];
  try {
    return JSON.parse(readFileSync(SCHEDULE_FILE, "utf-8")) as ScheduledPost[];
  } catch {
    return [];
  }
}

function saveSchedule(posts: ScheduledPost[]): void {
  mkdirSync(join(homedir(), ".tkt"), { recursive: true });
  writeFileSync(SCHEDULE_FILE, JSON.stringify(posts, null, 2));
}

function makeId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

export function registerScheduleCommands(program: Command): void {
  program
    .command("schedule <file>")
    .description("[experimental] Queue a video for future posting (firing needs TikTok Developer API)")
    .option("--caption <text>", "Caption for the video", "")
    .option("--tags <tags>", "Comma-separated hashtags", "")
    .option("--at <datetime>", "Scheduled datetime (e.g. '2025-12-31 23:59')")
    .action(async (file: string, opts: { caption: string; tags: string; at?: string }) => {
      if (!isAuthenticated()) {
        printError("Schedule requires login. Run: tkt login");
        process.exit(1);
      }
      if (!opts.at) {
        printError("--at <datetime> is required");
        process.exit(1);
      }
      if (!existsSync(file)) {
        printError(`File not found: ${file}`);
        process.exit(1);
      }

      const scheduledAt = new Date(opts.at).getTime();
      if (isNaN(scheduledAt)) {
        printError(`Invalid datetime: ${opts.at}`);
        process.exit(1);
      }
      if (scheduledAt <= Date.now()) {
        printError("Scheduled time must be in the future");
        process.exit(1);
      }

      const hashtags = opts.tags
        ? opts.tags.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean)
        : [];

      const post: ScheduledPost = {
        id: makeId(),
        filePath: file,
        caption: opts.caption,
        hashtags,
        scheduledAt,
        status: "pending",
        createdAt: Date.now(),
      };

      const schedule = loadSchedule();
      schedule.push(post);
      saveSchedule(schedule);
      printSuccess(`Scheduled post ${post.id} for ${new Date(scheduledAt).toLocaleString()}`);
    });

  const queueCmd = program
    .command("queue")
    .description("Manage scheduled posts (list by default)")
    .option("--json", "Output as JSON")
    .action((opts: { json?: boolean }) => {
      const schedule = loadSchedule();
      if (opts.json) {
        printEnvelope(schedule);
        return;
      }
      if (schedule.length === 0) {
        printInfo("No scheduled posts. Use: tkt schedule <file> --at <datetime>");
        return;
      }

      const t = new Table({
        head: [
          chalk.cyan("#"),
          chalk.cyan("Status"),
          chalk.cyan("File"),
          chalk.cyan("Caption"),
          chalk.cyan("Scheduled At"),
          chalk.cyan("Created At"),
        ],
        style: { head: [], border: ["grey"] },
        wordWrap: true,
      });

      for (const [i, p] of schedule.entries()) {
        let statusColored: string;
        if (p.status === "posted") statusColored = chalk.green(p.status);
        else if (p.status === "failed") statusColored = chalk.red(p.status);
        else statusColored = chalk.yellow(p.status);

        const caption = p.caption.length > 40 ? p.caption.slice(0, 37) + "..." : p.caption;

        t.push([
          String(i + 1),
          statusColored,
          p.filePath,
          caption,
          new Date(p.scheduledAt).toLocaleString(),
          new Date(p.createdAt).toLocaleString(),
        ]);
      }
      console.log(t.toString());
      console.log(chalk.grey(`  ${schedule.length} total  •  tkt queue fire  •  tkt queue cancel <id>`));
    });

  queueCmd
    .command("fire")
    .description("[experimental] Fire due posts — upload needs TikTok Developer API")
    .action(async () => {
      if (!isAuthenticated()) {
        printError("Queue fire requires login. Run: tkt login");
        process.exit(1);
      }

      const schedule = loadSchedule();
      const now = Date.now();
      const due = schedule.filter((p) => p.status === "pending" && p.scheduledAt <= now);

      if (due.length === 0) {
        printInfo("No posts due for firing.");
        return;
      }

      const client = new TikTokClient(loadCredential());
      let posted = 0;

      for (const post of due) {
        try {
          await client.uploadVideo(post.filePath, post.caption, post.hashtags);
          post.status = "posted";
          posted++;
        } catch (e) {
          post.status = "failed";
          post.error = e instanceof Error ? e.message : String(e);
          printWarn(`Failed to post ${post.id}: ${post.error}`);
        }
      }

      saveSchedule(schedule);
      printSuccess(`Fired ${posted} of ${due.length} due posts`);
    });

  queueCmd
    .command("cancel <id>")
    .description("Cancel a scheduled post by index (1-based) or id prefix")
    .action((id: string) => {
      const schedule = loadSchedule();
      const pending = schedule.filter((p) => p.status === "pending");

      let target: ScheduledPost | undefined;

      if (/^\d+$/.test(id)) {
        const idx = Number(id) - 1;
        if (idx < 0 || idx >= pending.length) {
          printError(`Index ${id} out of range (${pending.length} pending posts)`);
          process.exit(1);
        }
        target = pending[idx];
      } else {
        target = pending.find((p) => p.id.startsWith(id));
        if (!target) {
          printError(`No pending post found with id prefix: ${id}`);
          process.exit(1);
        }
      }

      const entry = schedule.find((p) => p.id === target!.id)!;
      entry.status = "failed";
      entry.error = "Cancelled";
      saveSchedule(schedule);
      printSuccess(`Cancelled post ${entry.id}`);
    });
}
