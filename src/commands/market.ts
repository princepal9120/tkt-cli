import { Command } from "commander";
import { TikTokClient } from "../client/index.js";
import { loadCredential } from "../config.js";
import { printError } from "../output/index.js";
import { printJson } from "../output/index.js";
import { fmt } from "../output/format.js";
import Table from "cli-table3";
import chalk from "chalk";
import type { VideoResult } from "../models.js";

interface MarketInsight {
  query: string;
  source: string;
  videosAnalyzed: number;
  totalViews: number;
  medianViews: number;
  medianEngagementRate: number;
  opportunityScore: number;
  decision: string;
  topKeywords: [string, number][];
  topHashtags: [string, number][];
  hookFormats: [string, number][];
  contentAngles: string[];
  productOpportunities: string[];
  validationPlan: string[];
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function topN(items: string[], n = 10): [string, number][] {
  const counts: Record<string, number> = {};
  for (const item of items) counts[item] = (counts[item] ?? 0) + 1;
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function analyzeMarket(videos: VideoResult[], query: string, source: string): MarketInsight {
  const plays = videos.map((v) => v.playCount);
  const totalViews = plays.reduce((s, n) => s + n, 0);
  const medianViews = median(plays);
  const engagements = videos.map((v) => {
    const total = v.playCount || 1;
    return (v.likeCount + v.commentCount + v.shareCount) / total;
  });
  const medianEngagementRate = median(engagements);

  // Extract keywords from descriptions
  const stopWords = new Set(["the", "a", "an", "in", "on", "at", "to", "for", "of", "and", "or", "is", "it", "this", "that", "with", "you", "i", "my", "your"]);
  const words = videos.flatMap((v) =>
    v.desc.toLowerCase().split(/\s+/).filter((w) => w.length > 3 && !stopWords.has(w))
  );
  const topKeywords = topN(words);
  const topHashtags = topN(videos.flatMap((v) => v.hashtags));

  // Hook formats from first words of descriptions
  const hooks = videos.map((v) => v.desc.split(/\s+/).slice(0, 4).join(" ").toLowerCase()).filter(Boolean);
  const hookFormats = topN(hooks, 5);

  // Opportunity score: high engagement + growing = high score
  const avgViews = totalViews / (videos.length || 1);
  const engScore = Math.min(medianEngagementRate * 1000, 40);
  const volScore = Math.min((avgViews / 1_000_000) * 20, 40);
  const countScore = Math.min(videos.length, 20);
  const opportunityScore = Math.round(engScore + volScore + countScore);

  const decision =
    opportunityScore >= 70 ? "🔥 High opportunity — validated demand" :
    opportunityScore >= 40 ? "📈 Growing niche — worth testing" :
    "🧊 Low signal — validate further before investing";

  return {
    query,
    source,
    videosAnalyzed: videos.length,
    totalViews,
    medianViews,
    medianEngagementRate,
    opportunityScore,
    decision,
    topKeywords,
    topHashtags,
    hookFormats,
    contentAngles: topKeywords.slice(0, 5).map(([w]) => `Content around "${w}"`),
    productOpportunities: topHashtags.slice(0, 5).map(([h]) => `Product for #${h} audience`),
    validationPlan: [
      `Post 3 test videos using top hooks: "${hookFormats[0]?.[0] ?? "..."}"`,
      `Target hashtags: ${topHashtags.slice(0, 3).map(([h]) => "#" + h).join(", ")}`,
      "Run for 7 days, aim for >3% engagement rate",
      `If median views > ${fmt(medianViews * 2)}, scale content production`,
    ],
  };
}

function renderMarket(insight: MarketInsight): void {
  const summary = new Table({ style: { border: ["grey"] } });
  summary.push(
    [chalk.bold("Query"), insight.query],
    ["Source", insight.source],
    ["Videos analyzed", String(insight.videosAnalyzed)],
    ["Total views", fmt(insight.totalViews)],
    ["Median views", fmt(insight.medianViews)],
    ["Median engagement", `${(insight.medianEngagementRate * 100).toFixed(2)}%`],
    [chalk.bold("Opportunity score"), chalk.bold(`${insight.opportunityScore}/100`)],
    [chalk.bold("Decision"), insight.decision],
  );
  console.log(chalk.bold(`\nMarket Intelligence: ${insight.query}`));
  console.log(summary.toString());

  const signals = new Table({
    head: [chalk.cyan("Keywords"), chalk.cyan("Hashtags"), chalk.cyan("Hook Formats")],
    style: { border: ["grey"] },
  });
  const rows = Math.max(insight.topKeywords.length, insight.topHashtags.length, insight.hookFormats.length);
  for (let i = 0; i < Math.min(rows, 8); i++) {
    const kw = insight.topKeywords[i] ? `${insight.topKeywords[i][0]} (${insight.topKeywords[i][1]})` : "";
    const ht = insight.topHashtags[i] ? `#${insight.topHashtags[i][0]} (${insight.topHashtags[i][1]})` : "";
    const hk = insight.hookFormats[i] ? insight.hookFormats[i][0] : "";
    signals.push([kw, ht, hk]);
  }
  console.log(signals.toString());

  const lists: [string, string[]][] = [
    ["Content Angles", insight.contentAngles],
    ["Product Opportunities", insight.productOpportunities],
    ["Validation Plan", insight.validationPlan],
  ];
  for (const [title, items] of lists) {
    const t = new Table({ style: { border: ["grey"] } });
    for (const [i, item] of items.entries()) t.push([String(i + 1), item]);
    console.log(chalk.bold(`\n${title}`));
    console.log(t.toString());
  }
}

export function registerMarketCommands(program: Command): void {
  program
    .command("market <query>")
    .description("Analyze TikTok trends into marketing intelligence")
    .option("--source <src>", "Source: search|hashtag|trending", "search")
    .option("-n, --count <n>", "Videos to analyze", "30")
    .option("--region <region>", "Region for trending source", "US")
    .option("--json", "JSON output")
    .action(async (query: string, opts: { source: string; count: string; region: string; json?: boolean }) => {
      const client = new TikTokClient(loadCredential());
      let videos: VideoResult[];

      try {
        if (opts.source === "hashtag") {
          videos = await client.getHashtag(query, Number(opts.count));
        } else if (opts.source === "trending") {
          videos = await client.getTrending(Number(opts.count), opts.region);
        } else {
          videos = await client.search(query, Number(opts.count));
        }
      } catch (e) {
        printError(String(e instanceof Error ? e.message : e));
        process.exit(1);
      }

      const insight = analyzeMarket(videos, query, opts.source);

      if (opts.json) {
        printJson({ ok: true, schema_version: "1.0", data: insight });
      } else {
        renderMarket(insight);
      }
    });
}
