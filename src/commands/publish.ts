import { Command } from "commander";
import { TikTokClient } from "../client/index.js";
import { loadCredential, isAuthenticated } from "../config.js";
import { printSuccess, printError, printInfo, printWarn, printEnvelope } from "../output/index.js";
import type { PublishResult } from "../models.js";
import { resolveId } from "./resolve.js";

export function registerPublishCommands(program: Command): void {
  program
    .command("upload <file>")
    .description("[experimental] Upload a video — requires TikTok Developer API (not web cookies)")
    .option("--caption <text>", "Video caption", "")
    .option("--tags <tags>", "Comma-separated hashtags", "")
    .option("--json", "Output as JSON")
    .action(async (file: string, opts: { caption: string; tags: string; json?: boolean }) => {
      if (!isAuthenticated()) {
        printError("Upload requires login. Run: tkt login");
        process.exit(1);
      }
      const tags = opts.tags ? opts.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
      const client = new TikTokClient(loadCredential());
      try {
        const result: PublishResult = await client.uploadVideo(file, opts.caption, tags);
        if (opts.json) {
          printEnvelope(result);
        } else {
          printSuccess(`Video uploaded: ${result.url} (status: ${result.status})`);
        }
      } catch (e) {
        printError(String(e instanceof Error ? e.message : e));
        process.exit(1);
      }
    });

  program
    .command("delete <id>")
    .description("Delete a video (id or index # from last listing)")
    .action(async (input: string) => {
      if (!isAuthenticated()) {
        printError("Delete requires login. Run: tkt login");
        process.exit(1);
      }
      const videoId = resolveId(input);
      printWarn(`Deleting video ${videoId} — this cannot be undone.`);
      const client = new TikTokClient(loadCredential());
      try {
        await client.deleteVideo(videoId);
        printSuccess(`Deleted video ${videoId}`);
      } catch (e) {
        printError(String(e instanceof Error ? e.message : e));
        process.exit(1);
      }
    });

  program
    .command("caption <id> <text>")
    .description("Show or attempt to update a video caption (id or index # from last listing)")
    .option("--json", "Output as JSON")
    .action(async (input: string, text: string, opts: { json?: boolean }) => {
      const videoId = resolveId(input);
      const client = new TikTokClient(loadCredential());
      try {
        const detail = await client.getVideoDetail(videoId);
        if (opts.json) {
          printEnvelope({ videoId, currentCaption: detail.desc, requestedCaption: text });
        } else {
          printInfo(`Current caption: ${detail.desc || "(none)"}`);
          printWarn("Caption editing is not supported via web cookies. Use the TikTok app or Developer API.");
        }
      } catch (e) {
        printError(String(e instanceof Error ? e.message : e));
        process.exit(1);
      }
    });

  program
    .command("drafts")
    .description("[experimental] List video drafts — requires TikTok Developer API (not web cookies)")
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      if (!isAuthenticated()) {
        printError("Drafts requires login. Run: tkt login");
        process.exit(1);
      }
      if (opts.json) {
        printEnvelope({ drafts: [], note: "Drafts require the TikTok Developer API and are not accessible via web cookies." });
      } else {
        printInfo("Drafts are only accessible via the TikTok Developer API, not web cookie auth.");
      }
    });
}
