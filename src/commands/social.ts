import { Command } from "commander";
import { TikTokClient } from "../client/index.js";
import { loadCredential, isAuthenticated, loadIndexCache } from "../config.js";
import { printSuccess, printError } from "../output/index.js";

function resolveId(input: string): string {
  if (/^\d+$/.test(input)) {
    const cache = loadIndexCache();
    if (!cache) {
      printError("No listing cache. Run a list command first.");
      process.exit(1);
    }
    const idx = Number(input) - 1;
    if (idx < 0 || idx >= cache.items.length) {
      printError(`Index ${input} out of range`);
      process.exit(1);
    }
    return cache.items[idx].id;
  }
  const urlMatch = input.match(/\/video\/(\d+)/);
  return urlMatch ? urlMatch[1] : input;
}

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
}
