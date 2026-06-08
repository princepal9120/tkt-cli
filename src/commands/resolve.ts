import { loadIndexCache } from "../config.js";
import { printError } from "../output/index.js";

export function resolveId(input: string): string {
  // If numeric (short index), look up from cache
  if (/^\d+$/.test(input)) {
    const cache = loadIndexCache();
    if (!cache) {
      printError("No listing cache. Run a list command first (tkt trending, tkt search, etc.)");
      process.exit(1);
    }
    const idx = Number(input) - 1;
    if (idx < 0 || idx >= cache.items.length) {
      printError(`Index ${input} out of range (cache has ${cache.items.length} items)`);
      process.exit(1);
    }
    return cache.items[idx].id;
  }
  // Direct video ID or URL
  const urlMatch = input.match(/\/video\/(\d+)/);
  return urlMatch ? urlMatch[1] : input;
}
