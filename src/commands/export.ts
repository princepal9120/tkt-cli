import { Command } from "commander";
import { TikTokClient } from "../client/index.js";
import { loadCredential } from "../config.js";
import { printError, printSuccess } from "../output/index.js";
import type { VideoResult } from "../models.js";
import { writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";

type ExportKind = "trending" | "hashtag" | "user" | "search";

function toCsv(rows: VideoResult[]): string {
  const headers = ["id", "author", "desc", "createTime", "playCount", "likeCount", "commentCount", "shareCount", "duration", "url", "hashtags"];
  const lines = [headers.join(",")];
  for (const r of rows) {
    const vals = [
      r.id,
      `"${r.author.replace(/"/g, '""')}"`,
      `"${r.desc.replace(/"/g, '""')}"`,
      r.createTime,
      r.playCount,
      r.likeCount,
      r.commentCount,
      r.shareCount,
      r.duration ?? "",
      r.url,
      `"${r.hashtags.join(" ")}"`,
    ];
    lines.push(vals.join(","));
  }
  return lines.join("\n") + "\n";
}

export function registerExportCommands(program: Command): void {
  program
    .command("export <kind>")
    .description("Export TikTok data to JSON or CSV (kind: trending|hashtag|user|search)")
    .argument("[value]", "Tag, username, or query (not needed for trending)")
    .option("-o, --out <file>", "Output file path (required)")
    .option("-n, --count <n>", "Number of results", "50")
    .option("--region <region>", "Region for trending", "US")
    .option("--format <fmt>", "Output format: json or csv", "json")
    .action(async (kind: string, value: string | undefined, opts: { out?: string; count: string; region: string; format: string }) => {
      if (!opts.out) {
        printError("--out <file> is required");
        process.exit(1);
      }

      const validKinds: ExportKind[] = ["trending", "hashtag", "user", "search"];
      if (!validKinds.includes(kind as ExportKind)) {
        printError(`kind must be one of: ${validKinds.join(", ")}`);
        process.exit(1);
      }

      if (kind !== "trending" && !value) {
        printError(`value is required for kind=${kind}`);
        process.exit(1);
      }

      const client = new TikTokClient(loadCredential());
      let results: VideoResult[];

      try {
        switch (kind as ExportKind) {
          case "trending":
            results = await client.getTrending(Number(opts.count), opts.region);
            break;
          case "hashtag":
            results = await client.getHashtag(value!, Number(opts.count));
            break;
          case "user":
            results = (await client.getUser(value!, Number(opts.count))).videos;
            break;
          case "search":
            results = await client.search(value!, Number(opts.count));
            break;
        }
      } catch (e) {
        printError(String(e instanceof Error ? e.message : e));
        process.exit(1);
      }

      mkdirSync(dirname(opts.out), { recursive: true });

      if (opts.format === "csv") {
        writeFileSync(opts.out, toCsv(results!));
      } else {
        writeFileSync(opts.out, JSON.stringify(results!, null, 2) + "\n");
      }

      printSuccess(`Exported ${results!.length} rows → ${opts.out}`);
    });
}
