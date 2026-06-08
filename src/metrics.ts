// Pure metric computations — no network, no IO, no process state.
// Extracted from TikTokClient and the analytics command so the math
// (engagement, posting frequency, growth, sorting) is unit-testable
// without hitting the TikTok API. Client methods fetch, then call these.

import type {
  AccountAnalytics,
  VideoAnalytics,
  CompetitorAnalysis,
  GrowthData,
  UserProfile,
  VideoResult,
  VideoDetail,
} from "./models.js";

function mean(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

export function computeAccountAnalytics(profile: UserProfile, videos: VideoResult[]): AccountAnalytics {
  const avgViews = mean(videos.map((v) => v.playCount));
  const avgLikes = mean(videos.map((v) => v.likeCount));
  const avgComments = mean(videos.map((v) => v.commentCount));
  const avgShares = mean(videos.map((v) => v.shareCount));
  const engagementRate = (avgLikes + avgComments + avgShares) / (avgViews || 1);
  return {
    userId: profile.id,
    username: profile.uniqueId,
    followerCount: profile.followerCount,
    followingCount: profile.followingCount,
    totalLikes: profile.heartCount,
    totalVideos: profile.videoCount,
    avgViews,
    avgLikes,
    avgComments,
    engagementRate,
    period: "all",
  };
}

export function computeVideoAnalytics(detail: VideoDetail): VideoAnalytics {
  const views = detail.playCount;
  const likes = detail.likeCount;
  const comments = detail.commentCount;
  const shares = detail.shareCount;
  return {
    videoId: detail.id,
    views,
    likes,
    comments,
    shares,
    engagementRate: (likes + comments + shares) / (views || 1),
    completionRate: 0,
  };
}

export function computeCompetitorAnalysis(profile: UserProfile, videos: VideoResult[]): CompetitorAnalysis {
  // Posting frequency from createTime spread (per-week).
  let postingFrequencyPerWeek = 0;
  if (videos.length > 1) {
    const times = videos.map((v) => v.createTime).sort((a, b) => a - b);
    const spanDays = (times[times.length - 1] - times[0]) / 86400;
    const perDay = spanDays > 0 ? videos.length / spanDays : 0;
    postingFrequencyPerWeek = perDay * 7;
  }

  // Top 10 hashtags by frequency, kept as [tag, count] tuples.
  const hashtagCounts: Record<string, number> = {};
  for (const v of videos) {
    for (const h of v.hashtags) {
      hashtagCounts[h] = (hashtagCounts[h] ?? 0) + 1;
    }
  }
  const topHashtags: Array<[string, number]> = Object.entries(hashtagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, n]) => [tag, n] as [string, number]);

  const topVideos = [...videos].sort((a, b) => b.playCount - a.playCount).slice(0, 5);

  // Content angles: most frequent meaningful words across descriptions.
  const wordCounts: Record<string, number> = {};
  for (const v of videos) {
    const words = v.desc.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    for (const w of words) {
      wordCounts[w] = (wordCounts[w] ?? 0) + 1;
    }
  }
  const contentAngles = Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);

  const avgViews = mean(videos.map((v) => v.playCount));
  const avgEngagementRate = mean(
    videos.map((v) => (v.likeCount + v.commentCount + v.shareCount) / (v.playCount || 1)),
  );

  return {
    username: profile.uniqueId,
    followerCount: profile.followerCount,
    avgViews,
    avgEngagementRate,
    postingFrequencyPerWeek,
    topHashtags,
    topVideos,
    contentAngles,
  };
}

export type SortKey = "views" | "likes" | "comments" | "engagement";

const engagement = (v: VideoResult): number =>
  (v.likeCount + v.commentCount + v.shareCount) / (v.playCount || 1);

export function sortVideos(videos: VideoResult[], sort: SortKey): VideoResult[] {
  return [...videos].sort((a, b) => {
    if (sort === "likes") return b.likeCount - a.likeCount;
    if (sort === "comments") return b.commentCount - a.commentCount;
    if (sort === "engagement") return engagement(b) - engagement(a);
    return b.playCount - a.playCount;
  });
}

// `nowSec` is injected (default = wall clock) so growth windows are
// deterministic in tests.
export function computeGrowthData(
  videos: VideoResult[],
  profile: { followerCount: number; uniqueId: string },
  period: "7d" | "30d" | "90d",
  nowSec: number = Math.floor(Date.now() / 1000),
): GrowthData & { bestVideoDesc?: string } {
  const periodDays = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  const cutoff = nowSec - periodDays * 86400;

  const recent = videos.filter((v) => v.createTime >= cutoff);
  const older = videos.filter((v) => v.createTime < cutoff);

  const avgRecent = mean(recent.map((v) => v.playCount));
  const avgOlder = mean(older.map((v) => v.playCount));

  const bestVideo = [...videos].sort((a, b) => b.playCount - a.playCount)[0];

  return {
    period,
    currentFollowers: profile.followerCount,
    followerDelta: 0, // TikTok API doesn't expose historical follower counts via public scraping
    avgViewsDelta: Math.round(avgRecent - avgOlder),
    bestPerformingVideoId: bestVideo?.id,
    bestVideoDesc: bestVideo?.desc,
  };
}
