import { describe, expect, test } from "bun:test";
import {
  computeAccountAnalytics,
  computeVideoAnalytics,
  computeCompetitorAnalysis,
  computeGrowthData,
  sortVideos,
} from "./metrics.js";
import type { UserProfile, VideoResult, VideoDetail } from "./models.js";

function vid(overrides: Partial<VideoResult> = {}): VideoResult {
  return {
    id: "v1",
    desc: "",
    author: "alice",
    authorId: "a1",
    createTime: 1_000_000,
    playCount: 1000,
    likeCount: 100,
    commentCount: 10,
    shareCount: 5,
    url: "https://www.tiktok.com/@alice/video/v1",
    hashtags: [],
    ...overrides,
  };
}

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: "u1",
    uniqueId: "alice",
    secUid: "SEC_alice",
    nickname: "Alice",
    followerCount: 5000,
    followingCount: 100,
    heartCount: 99999,
    videoCount: 42,
    verified: false,
    ...overrides,
  };
}

describe("computeAccountAnalytics", () => {
  test("averages views/likes/comments and computes a non-zero engagement rate", () => {
    const videos = [
      vid({ playCount: 1000, likeCount: 100, commentCount: 20, shareCount: 10 }),
      vid({ playCount: 3000, likeCount: 200, commentCount: 40, shareCount: 30 }),
    ];
    const a = computeAccountAnalytics(profile(), videos);

    expect(a.avgViews).toBe(2000);
    expect(a.avgLikes).toBe(150);
    expect(a.avgComments).toBe(30);
    // (avgLikes 150 + avgComments 30 + avgShares 20) / avgViews 2000 = 0.1
    expect(a.engagementRate).toBeCloseTo(0.1, 10);
    expect(a.engagementRate).toBeGreaterThan(0); // regression: was always 0.00%
    expect(a.userId).toBe("u1");
    expect(a.username).toBe("alice");
    expect(a.totalLikes).toBe(99999);
    expect(a.totalVideos).toBe(42);
    expect(a.period).toBe("all");
  });

  test("no divide-by-zero on an account with zero videos", () => {
    const a = computeAccountAnalytics(profile(), []);
    expect(a.avgViews).toBe(0);
    expect(a.engagementRate).toBe(0);
  });
});

describe("computeVideoAnalytics", () => {
  test("derives engagement rate and zero completion rate", () => {
    const detail = {
      ...vid({ id: "v9", playCount: 1000, likeCount: 80, commentCount: 15, shareCount: 5 }),
      comments: [],
    } as VideoDetail;
    const v = computeVideoAnalytics(detail);

    expect(v.videoId).toBe("v9");
    expect(v.views).toBe(1000);
    expect(v.engagementRate).toBeCloseTo(0.1, 10); // (80+15+5)/1000
    expect(v.completionRate).toBe(0);
  });

  test("zero views does not divide by zero", () => {
    const detail = { ...vid({ playCount: 0, likeCount: 0, commentCount: 0, shareCount: 0 }), comments: [] } as VideoDetail;
    expect(computeVideoAnalytics(detail).engagementRate).toBe(0);
  });
});

describe("computeCompetitorAnalysis", () => {
  test("posting frequency is per WEEK, not per day", () => {
    // 8 videos spanning exactly 7 days → 1.0 posts/day → 7.0 posts/week
    const videos = Array.from({ length: 8 }, (_, i) =>
      vid({ id: `v${i}`, createTime: 1_000_000 + i * 86400 }),
    );
    const c = computeCompetitorAnalysis(profile(), videos);
    // span = 7 days, 8 videos → 8/7 per day → *7 = 8 per week
    expect(c.postingFrequencyPerWeek).toBeCloseTo(8, 5);
  });

  test("topHashtags are [tag, count] tuples sorted by frequency desc", () => {
    const videos = [
      vid({ hashtags: ["fyp", "cooking"] }),
      vid({ hashtags: ["fyp", "cooking"] }),
      vid({ hashtags: ["fyp"] }),
    ];
    const c = computeCompetitorAnalysis(profile(), videos);
    expect(c.topHashtags[0]).toEqual(["fyp", 3]);
    expect(c.topHashtags[1]).toEqual(["cooking", 2]);
  });

  test("avgViews and avgEngagementRate are populated (regression: were undefined/0)", () => {
    const videos = [
      vid({ playCount: 1000, likeCount: 100, commentCount: 0, shareCount: 0 }),
      vid({ playCount: 3000, likeCount: 300, commentCount: 0, shareCount: 0 }),
    ];
    const c = computeCompetitorAnalysis(profile(), videos);
    expect(c.avgViews).toBe(2000);
    expect(c.avgEngagementRate).toBeCloseTo(0.1, 10); // mean of 0.1 and 0.1
    expect(c.avgEngagementRate).toBeGreaterThan(0);
  });

  test("topVideos capped at 5, sorted by playCount desc", () => {
    const videos = Array.from({ length: 8 }, (_, i) => vid({ id: `v${i}`, playCount: i * 100 }));
    const c = computeCompetitorAnalysis(profile(), videos);
    expect(c.topVideos).toHaveLength(5);
    expect(c.topVideos[0].playCount).toBe(700);
  });
});

describe("sortVideos", () => {
  const videos = [
    vid({ id: "a", playCount: 100, likeCount: 50, commentCount: 1, shareCount: 0 }),
    vid({ id: "b", playCount: 300, likeCount: 10, commentCount: 9, shareCount: 0 }),
    vid({ id: "c", playCount: 50, likeCount: 40, commentCount: 0, shareCount: 0 }),
  ];

  test("by views", () => {
    expect(sortVideos(videos, "views").map((v) => v.id)).toEqual(["b", "a", "c"]);
  });
  test("by likes", () => {
    expect(sortVideos(videos, "likes").map((v) => v.id)).toEqual(["a", "c", "b"]);
  });
  test("by engagement (rate, not absolute)", () => {
    // c: 40/50=0.8, a: 51/100=0.51, b: 19/300=0.063
    expect(sortVideos(videos, "engagement").map((v) => v.id)).toEqual(["c", "a", "b"]);
  });
  test("does not mutate the input array", () => {
    const input = [...videos];
    sortVideos(input, "views");
    expect(input.map((v) => v.id)).toEqual(["a", "b", "c"]);
  });
});

describe("computeGrowthData", () => {
  const NOW = 1_000_000_000; // fixed clock for determinism
  const day = 86400;

  test("splits recent vs older by the period window and reports avg views delta", () => {
    const videos = [
      vid({ id: "recent1", createTime: NOW - 1 * day, playCount: 5000 }),
      vid({ id: "recent2", createTime: NOW - 3 * day, playCount: 3000 }),
      vid({ id: "old1", createTime: NOW - 40 * day, playCount: 1000 }),
    ];
    const g = computeGrowthData(videos, profile(), "7d", NOW);
    expect(g.period).toBe("7d");
    expect(g.currentFollowers).toBe(5000);
    // recent avg = 4000, older avg = 1000 → delta 3000
    expect(g.avgViewsDelta).toBe(3000);
    expect(g.bestPerformingVideoId).toBe("recent1");
  });

  test("90d window includes videos the 7d window excludes", () => {
    const videos = [vid({ id: "x", createTime: NOW - 40 * day, playCount: 2000 })];
    const g7 = computeGrowthData(videos, profile(), "7d", NOW);
    const g90 = computeGrowthData(videos, profile(), "90d", NOW);
    // 7d: x is "older", no recent → avgRecent 0, delta = 0 - 2000
    expect(g7.avgViewsDelta).toBe(-2000);
    // 90d: x is "recent", no older → delta = 2000 - 0
    expect(g90.avgViewsDelta).toBe(2000);
  });
});
