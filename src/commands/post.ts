import { Command } from "commander";
import { TikTokClient } from "../client/index.js";
import { loadCredential, loadIndexCache } from "../config.js";
import { printVideoDetail, printError, printInfo } from "../output/index.js";
import { printJson } from "../output/index.js";
import { resolveId } from "./resolve.js";

export function registerPostCommands(program: Command): void {
  program
    .command("show <id>")
    .description("Show video details and comments (id or index # from last listing)")
    .option("--json", "JSON output")
    .action(async (input: string, opts: { json?: boolean }) => {
      const videoId = resolveId(input);
      const client = new TikTokClient(loadCredential());
      try {
        printInfo(`Fetching video ${videoId}...`);
        const detail = await client.getVideoDetail(videoId);
        if (opts.json) {
          printJson({ ok: true, schema_version: "1.0", data: detail });
        } else {
          printVideoDetail(detail);
        }
      } catch (e) {
        printError(String(e instanceof Error ? e.message : e));
        process.exit(1);
      }
    });

  program
    .command("open <id>")
    .description("Open video in browser (id or index # from last listing)")
    .action(async (input: string) => {
      const videoId = resolveId(input);
      // Need the URL — try cache first for author
      const cache = loadIndexCache();
      let url = `https://www.tiktok.com/@user/video/${videoId}`;

      if (/^\d+$/.test(input) && cache) {
        // Fetch detail for proper URL only if index given
        try {
          const client = new TikTokClient(loadCredential());
          const detail = await client.getVideoDetail(videoId);
          url = detail.url;
        } catch {
          // fallback
        }
      }

      // macOS open
      const proc = Bun.spawn(["open", url]);
      await proc.exited;
      printInfo(`Opened: ${url}`);
    });
}
