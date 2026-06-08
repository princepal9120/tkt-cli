import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import { TikTokClient } from "../client/index.js";
import { loadCredential, isAuthenticated } from "../config.js";
import { printSuccess, printError, printInfo, printEnvelope } from "../output/index.js";
import { fmt } from "../output/format.js";
import type { FollowResult, CommentResult } from "../models.js";
import { resolveId } from "./resolve.js";

export function registerSocialCommands(program: Command): void {
  program
    .command("like <id>")
    .description("Like a video (id or index # from last listing)")
    .action(async (input: string) => {
      if (!isAuthenticated()) {
        printError("Like requires login. Run: tkt login");
        process.exit(1);
      }
      const videoId = resolveId(input);
      const client = new TikTokClient(loadCredential());
      try {
        await client.likeVideo(videoId);
        printSuccess(`Liked video ${videoId}`);
      } catch (e) {
        printError(String(e instanceof Error ? e.message : e));
        process.exit(1);
      }
    });

  program
    .command("save <id>")
    .description("Save a video to favorites (id or index # from last listing)")
    .action(async (input: string) => {
      if (!isAuthenticated()) {
        printError("Save requires login. Run: tkt login");
        process.exit(1);
      }
      const videoId = resolveId(input);
      const client = new TikTokClient(loadCredential());
      try {
        await client.saveVideo(videoId);
        printSuccess(`Saved video ${videoId}`);
      } catch (e) {
        printError(String(e instanceof Error ? e.message : e));
        process.exit(1);
      }
    });

  program
    .command("comment <id> <text>")
    .description("Post a comment on a video (id or index # from last listing)")
    .action(async (input: string, text: string) => {
      if (!isAuthenticated()) {
        printError("Comment requires login. Run: tkt login");
        process.exit(1);
      }
      const videoId = resolveId(input);
      const client = new TikTokClient(loadCredential());
      try {
        const result: CommentResult = await client.postComment(videoId, text);
        printSuccess(`Commented on video ${videoId} (comment id: ${result.id})`);
      } catch (e) {
        printError(String(e instanceof Error ? e.message : e));
        process.exit(1);
      }
    });

  program
    .command("reply <commentId> <text>")
    .description("Reply to a comment")
    .option("--video <id>", "Video id or index # (required if not resolvable from comment)")
    .action(async (commentId: string, text: string, opts: { video?: string }) => {
      if (!isAuthenticated()) {
        printError("Reply requires login. Run: tkt login");
        process.exit(1);
      }
      if (!opts.video) {
        printError("--video <id> is required for reply");
        process.exit(1);
      }
      const videoId = resolveId(opts.video);
      const client = new TikTokClient(loadCredential());
      try {
        const result: CommentResult = await client.replyComment(videoId, commentId, text);
        printSuccess(`Replied to comment ${commentId} on video ${videoId} (comment id: ${result.id})`);
      } catch (e) {
        printError(String(e instanceof Error ? e.message : e));
        process.exit(1);
      }
    });

  program
    .command("comments <id>")
    .description("List comments on a video (id or index # from last listing)")
    .option("-n, --count <n>", "Number of comments to fetch", "20")
    .option("--json", "Output as JSON")
    .action(async (input: string, opts: { count: string; json?: boolean }) => {
      const videoId = resolveId(input);
      const count = parseInt(opts.count, 10);
      const client = new TikTokClient(loadCredential());
      try {
        const comments = await client.getComments(videoId, count);
        if (opts.json) {
          printEnvelope(comments);
          return;
        }
        if (!comments.length) {
          printInfo("No comments found.");
          return;
        }
        const t = new Table({
          head: [chalk.cyan("#"), chalk.cyan("Author"), chalk.cyan("Likes"), chalk.cyan("Comment")],
          style: { head: [], border: ["grey"] },
          colWidths: [4, 20, 8, 60],
          wordWrap: true,
        });
        for (const [i, c] of comments.entries()) {
          t.push([String(i + 1), c.author, fmt(c.likeCount), c.text]);
        }
        console.log(t.toString());
        printInfo(`  ${comments.length} comments`);
      } catch (e) {
        printError(String(e instanceof Error ? e.message : e));
        process.exit(1);
      }
    });

  program
    .command("follow <user>")
    .description("Follow a TikTok user")
    .action(async (user: string) => {
      if (!isAuthenticated()) {
        printError("Follow requires login. Run: tkt login");
        process.exit(1);
      }
      const clean = user.replace(/^@/, "");
      const client = new TikTokClient(loadCredential());
      try {
        const { profile } = await client.getUser(clean, 1);
        const result: FollowResult = await client.followUser(profile.id);
        printSuccess(`Followed @${clean} (userId: ${profile.id})`);
        void result;
      } catch (e) {
        printError(String(e instanceof Error ? e.message : e));
        process.exit(1);
      }
    });

  program
    .command("unfollow <user>")
    .description("Unfollow a TikTok user")
    .action(async (user: string) => {
      if (!isAuthenticated()) {
        printError("Unfollow requires login. Run: tkt login");
        process.exit(1);
      }
      const clean = user.replace(/^@/, "");
      const client = new TikTokClient(loadCredential());
      try {
        const { profile } = await client.getUser(clean, 1);
        const result: FollowResult = await client.unfollowUser(profile.id);
        printSuccess(`Unfollowed @${clean} (userId: ${profile.id})`);
        void result;
      } catch (e) {
        printError(String(e instanceof Error ? e.message : e));
        process.exit(1);
      }
    });

  program
    .command("following [username]")
    .description("List accounts a user is following (defaults to your own account)")
    .option("-n, --count <n>", "Number of results to fetch", "20")
    .option("--json", "Output as JSON")
    .action(async (username: string | undefined, opts: { count: string; json?: boolean }) => {
      const count = parseInt(opts.count, 10);
      const client = new TikTokClient(loadCredential());
      try {
        let secUid: string;
        if (!username) {
          const me = await client.getWhoami();
          secUid = me.secUid || me.id;
        } else {
          const clean = username.replace(/^@/, "");
          const { profile } = await client.getUser(clean, 1);
          secUid = profile.secUid || profile.id;
        }
        const list = await client.getFollowing(secUid, count);
        if (opts.json) {
          printEnvelope(list);
          return;
        }
        if (!list.length) {
          printInfo("No following returned. The account may be private, have none, or require a valid logged-in session.");
          return;
        }
        const t = new Table({
          head: [chalk.cyan("#"), chalk.cyan("Username"), chalk.cyan("Nickname"), chalk.cyan("Followers")],
          style: { head: [], border: ["grey"] },
          colWidths: [4, 24, 24, 12],
          wordWrap: true,
        });
        for (const [i, u] of list.entries()) {
          t.push([String(i + 1), `@${u.uniqueId}`, u.nickname, fmt(u.followerCount)]);
        }
        console.log(t.toString());
        printInfo(`  ${list.length} results`);
      } catch (e) {
        printError(String(e instanceof Error ? e.message : e));
        process.exit(1);
      }
    });

  program
    .command("followers [username]")
    .description("List followers of a user (defaults to your own account)")
    .option("-n, --count <n>", "Number of results to fetch", "20")
    .option("--json", "Output as JSON")
    .action(async (username: string | undefined, opts: { count: string; json?: boolean }) => {
      const count = parseInt(opts.count, 10);
      const client = new TikTokClient(loadCredential());
      try {
        let secUid: string;
        if (!username) {
          const me = await client.getWhoami();
          secUid = me.secUid || me.id;
        } else {
          const clean = username.replace(/^@/, "");
          const { profile } = await client.getUser(clean, 1);
          secUid = profile.secUid || profile.id;
        }
        const list = await client.getFollowers(secUid, count);
        if (opts.json) {
          printEnvelope(list);
          return;
        }
        if (!list.length) {
          printInfo("No followers returned. The account may be private, have none, or require a valid logged-in session.");
          return;
        }
        const t = new Table({
          head: [chalk.cyan("#"), chalk.cyan("Username"), chalk.cyan("Nickname"), chalk.cyan("Followers")],
          style: { head: [], border: ["grey"] },
          colWidths: [4, 24, 24, 12],
          wordWrap: true,
        });
        for (const [i, u] of list.entries()) {
          t.push([String(i + 1), `@${u.uniqueId}`, u.nickname, fmt(u.followerCount)]);
        }
        console.log(t.toString());
        printInfo(`  ${list.length} results`);
      } catch (e) {
        printError(String(e instanceof Error ? e.message : e));
        process.exit(1);
      }
    });
}
