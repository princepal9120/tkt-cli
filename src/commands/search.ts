import { Command } from "commander";
import { TikTokClient } from "../client/index.js";
import { loadCredential, saveIndexCache } from "../config.js";
import { printVideoTable, printError } from "../output/index.js";
import { printJson } from "../output/index.js";

export function registerSearchCommands(program: Command): void {
  program
    .command("search <query>")
    .description("Search TikTok videos")
    .option("-n, --count <n>", "Number of results", "20")
    .option("--json", "JSON output")
    .action(async (query: string, opts: { count: string; json?: boolean }) => {
      const client = new TikTokClient(loadCredential());
      try {
        const results = await client.search(query, Number(opts.count));
        saveIndexCache({
          command: `search ${query}`,
          items: results.map((v) => ({ id: v.id, type: "video" as const })),
          savedAt: Date.now(),
        });
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
