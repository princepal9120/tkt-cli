import Table from "cli-table3";
import chalk from "chalk";
import { fmt, clip, ago, fmtDuration } from "./format.js";
import type { VideoResult, UserProfile, Comment, VideoDetail } from "../models.js";

export function printVideoTable(results: VideoResult[]): void {
  const t = new Table({
    head: [
      chalk.cyan("#"),
      chalk.cyan("Author"),
      chalk.cyan("Views"),
      chalk.cyan("Likes"),
      chalk.cyan("Cmts"),
      chalk.cyan("Duration"),
      chalk.cyan("Description"),
    ],
    style: { head: [], border: ["grey"] },
    colWidths: [4, 20, 9, 9, 7, 8, 55],
    wordWrap: true,
  });

  for (const [i, v] of results.entries()) {
    t.push([
      String(i + 1),
      clip(v.author, 18),
      fmt(v.playCount),
      fmt(v.likeCount),
      fmt(v.commentCount),
      fmtDuration(v.duration),
      clip(v.desc, 53),
    ]);
  }
  console.log(t.toString());
  console.log(chalk.grey(`  ${results.length} results  •  tkt show <#> to view details`));
}

export function printUserProfile(u: UserProfile): void {
  console.log();
  console.log(chalk.bold(`@${u.uniqueId}`) + (u.verified ? chalk.blue(" ✓") : ""));
  if (u.nickname) console.log(chalk.grey(u.nickname));
  if (u.bio) console.log(u.bio);
  console.log();
  const t = new Table({ style: { head: [], border: ["grey"] } });
  t.push(
    ["Followers", chalk.bold(fmt(u.followerCount))],
    ["Following", fmt(u.followingCount)],
    ["Likes", fmt(u.heartCount)],
    ["Videos", fmt(u.videoCount)],
  );
  console.log(t.toString());
}

export function printVideoDetail(v: VideoDetail): void {
  console.log();
  console.log(chalk.bold(`@${v.author}`) + chalk.grey(` • ${ago(v.createTime)}`));
  console.log(v.desc || chalk.grey("(no description)"));
  if (v.hashtags.length) console.log(chalk.cyan(v.hashtags.map((h) => `#${h}`).join(" ")));
  console.log();
  const stats = new Table({ style: { border: ["grey"] } });
  stats.push([
    `▶ ${fmt(v.playCount)}`,
    `♥ ${fmt(v.likeCount)}`,
    `💬 ${fmt(v.commentCount)}`,
    `↗ ${fmt(v.shareCount)}`,
    fmtDuration(v.duration),
  ]);
  console.log(stats.toString());
  console.log(chalk.grey(`  ${v.url}`));

  if (v.comments.length) {
    console.log();
    console.log(chalk.bold("Comments"));
    for (const c of v.comments.slice(0, 20)) {
      printComment(c, 0);
    }
  }
}

function printComment(c: Comment, depth: number): void {
  const indent = "  ".repeat(depth);
  const likes = c.likeCount ? chalk.grey(` (♥ ${fmt(c.likeCount)})`) : "";
  console.log(`${indent}${chalk.cyan("@" + c.author)}${likes}`);
  console.log(`${indent}${c.text}`);
  if (c.replies?.length) {
    for (const r of c.replies.slice(0, 3)) printComment(r, depth + 1);
  }
}

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function printError(msg: string): void {
  console.error(chalk.red(`✗ ${msg}`));
}

export function printSuccess(msg: string): void {
  console.log(chalk.green(`✓ ${msg}`));
}

export function printWarn(msg: string): void {
  console.log(chalk.yellow(`⚠ ${msg}`));
}

export function printInfo(msg: string): void {
  console.log(chalk.grey(msg));
}
