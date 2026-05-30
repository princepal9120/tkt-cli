import { CHROME_HEADERS, jitter, xBogus, UA } from "./fingerprint.js";
import { ENDPOINTS, BASE_PARAMS } from "./endpoints.js";
import type { VideoResult, UserProfile, Comment, VideoDetail } from "../models.js";
import type { Credential } from "../models.js";

export class TikTokError extends Error {}
export class TikTokBlockedError extends TikTokError {}
export class TikTokAuthError extends TikTokError {}

function buildUrl(base: string, params: Record<string, string>): string {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  // X-Bogus signs the query string — required or TikTok returns empty itemList
  const qs = u.search.slice(1);
  u.searchParams.set("X-Bogus", xBogus(qs, UA));
  return u.toString();
}

function cookieHeader(cred?: Credential): string {
  if (!cred) return "";
  const parts: string[] = [];
  if (cred.msToken) parts.push(`msToken=${cred.msToken}`);
  if (cred.sessionid) parts.push(`sessionid=${cred.sessionid}`);
  return parts.join("; ");
}

function parseVideo(item: Record<string, unknown>): VideoResult {
  const v = (item.video ?? {}) as Record<string, unknown>;
  const stats = (item.stats ?? {}) as Record<string, unknown>;
  const author = (item.author ?? {}) as Record<string, unknown>;
  const music = (item.music ?? {}) as Record<string, unknown>;
  const challenges = (item.challenges ?? []) as Array<Record<string, unknown>>;

  const id = String(item.id ?? "");
  return {
    id,
    desc: String(item.desc ?? ""),
    author: String(author.uniqueId ?? author.nickname ?? ""),
    authorId: String(author.id ?? ""),
    createTime: Number(item.createTime ?? 0),
    playCount: Number(stats.playCount ?? 0),
    likeCount: Number(stats.diggCount ?? 0),
    commentCount: Number(stats.commentCount ?? 0),
    shareCount: Number(stats.shareCount ?? 0),
    url: `https://www.tiktok.com/@${author.uniqueId ?? "user"}/video/${id}`,
    musicTitle: String(music.title ?? ""),
    hashtags: challenges.map((c) => String(c.title ?? "")).filter(Boolean),
    duration: Number(v.duration ?? 0) || undefined,
  };
}

function parseUser(data: Record<string, unknown>): UserProfile {
  const user = (data.user ?? data) as Record<string, unknown>;
  const stats = (data.stats ?? {}) as Record<string, unknown>;
  return {
    id: String(user.id ?? ""),
    uniqueId: String(user.uniqueId ?? ""),
    nickname: String(user.nickname ?? ""),
    bio: String(user.signature ?? "") || undefined,
    followerCount: Number(stats.followerCount ?? 0),
    followingCount: Number(stats.followingCount ?? 0),
    heartCount: Number(stats.heartCount ?? 0),
    videoCount: Number(stats.videoCount ?? 0),
    verified: Boolean(user.verified),
    avatarUrl: String(user.avatarMedium ?? user.avatarThumb ?? "") || undefined,
  };
}

function parseComment(c: Record<string, unknown>): Comment {
  const user = (c.user ?? {}) as Record<string, unknown>;
  return {
    id: String(c.cid ?? c.id ?? ""),
    text: String(c.text ?? ""),
    author: String(user.uniqueId ?? user.nickname ?? ""),
    likeCount: Number(c.digg_count ?? 0),
    createTime: Number(c.create_time ?? 0),
  };
}

export class TikTokClient {
  private cred?: Credential;
  private proxy?: string;

  constructor(cred?: Credential, proxy?: string) {
    this.cred = cred;
    this.proxy = proxy;
  }

  private async get(url: string, extraHeaders: Record<string, string> = {}): Promise<Record<string, unknown>> {
    await jitter(300);

    const headers: Record<string, string> = {
      ...CHROME_HEADERS,
      ...extraHeaders,
    };
    const cookies = cookieHeader(this.cred);
    if (cookies) headers["Cookie"] = cookies;

    const res = await fetch(url, { headers });

    if (res.status === 403 || res.status === 429) {
      throw new TikTokBlockedError(`TikTok blocked request (HTTP ${res.status}). Try a proxy or wait.`);
    }
    if (res.status === 401) {
      throw new TikTokAuthError("Not authenticated. Run: tkt login");
    }
    if (!res.ok) {
      throw new TikTokError(`HTTP ${res.status} from TikTok`);
    }

    const text = await res.text();
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new TikTokError("TikTok returned non-JSON response (likely blocked)");
    }
  }

  async getTrending(count = 20, region = "US"): Promise<VideoResult[]> {
    const url = buildUrl(ENDPOINTS.trending, {
      ...BASE_PARAMS,
      count: String(count),
      region,
      type: "5",
    });
    const data = await this.get(url);
    const items = (data.itemList ?? []) as Array<Record<string, unknown>>;
    return items.map(parseVideo);
  }

  async getHashtag(tag: string, count = 20): Promise<VideoResult[]> {
    const cleanTag = tag.replace(/^#/, "");
    // First get challenge ID
    const infoUrl = buildUrl(ENDPOINTS.hashtag_info, {
      ...BASE_PARAMS,
      challengeName: cleanTag,
    });
    const info = await this.get(infoUrl);
    const challengeId = String(
      ((info.challengeInfo as Record<string, unknown>)?.challenge as Record<string, unknown>)?.id ?? ""
    );
    if (!challengeId) throw new TikTokError(`Hashtag not found: #${cleanTag}`);

    const feedUrl = buildUrl(ENDPOINTS.hashtag_feed, {
      ...BASE_PARAMS,
      challengeID: challengeId,
      count: String(count),
      cursor: "0",
    });
    const data = await this.get(feedUrl);
    const items = (data.itemList ?? []) as Array<Record<string, unknown>>;
    return items.map(parseVideo);
  }

  async getUser(username: string, count = 20): Promise<{ profile: UserProfile; videos: VideoResult[] }> {
    const cleanUser = username.replace(/^@/, "");
    const infoUrl = buildUrl(ENDPOINTS.user_info, {
      ...BASE_PARAMS,
      uniqueId: cleanUser,
    });
    const info = await this.get(infoUrl);
    const userInfo = info.userInfo as Record<string, unknown> ?? {};
    const profile = parseUser(userInfo);

    const feedUrl = buildUrl(ENDPOINTS.user_feed, {
      ...BASE_PARAMS,
      secUid: profile.id,
      count: String(count),
      cursor: "0",
    });
    const feedData = await this.get(feedUrl);
    const items = (feedData.itemList ?? []) as Array<Record<string, unknown>>;

    return { profile, videos: items.map(parseVideo) };
  }

  async search(query: string, count = 20): Promise<VideoResult[]> {
    const url = buildUrl(ENDPOINTS.search_general, {
      ...BASE_PARAMS,
      keyword: query,
      count: String(count),
      cursor: "0",
      web_search_code: JSON.stringify({ top_author_hit: 1 }),
    });
    const data = await this.get(url);
    const items = (data.data ?? []) as Array<Record<string, unknown>>;
    return items
      .map((item) => (item.item ?? item) as Record<string, unknown>)
      .filter((item) => item.id)
      .map(parseVideo);
  }

  async getVideoDetail(videoId: string): Promise<VideoDetail> {
    const url = buildUrl(ENDPOINTS.video_detail, {
      ...BASE_PARAMS,
      itemId: videoId,
    });
    const data = await this.get(url);
    const itemInfo = (data.itemInfo ?? {}) as Record<string, unknown>;
    const itemStruct = (itemInfo.itemStruct ?? {}) as Record<string, unknown>;
    const video = parseVideo(itemStruct);

    // Fetch comments
    let comments: Comment[] = [];
    try {
      const commentsUrl = buildUrl(ENDPOINTS.comment_list, {
        ...BASE_PARAMS,
        aweme_id: videoId,
        count: "20",
        cursor: "0",
      });
      const commentsData = await this.get(commentsUrl);
      const rawComments = (commentsData.comments ?? []) as Array<Record<string, unknown>>;
      comments = rawComments.map(parseComment);
    } catch {
      // Comments optional
    }

    return { ...video, comments };
  }

  async getFeed(type: "foryou" | "following" = "foryou", count = 20): Promise<VideoResult[]> {
    if (!this.cred?.sessionid) throw new TikTokAuthError("Feed requires login. Run: tkt login");
    const endpoint = type === "following" ? ENDPOINTS.feed_following : ENDPOINTS.feed_foryou;
    const url = buildUrl(endpoint, {
      ...BASE_PARAMS,
      count: String(count),
      type: type === "following" ? "1" : "5",
    });
    const data = await this.get(url);
    const items = (data.itemList ?? []) as Array<Record<string, unknown>>;
    return items.map(parseVideo);
  }

  async getWhoami(): Promise<UserProfile> {
    if (!this.cred?.sessionid) throw new TikTokAuthError("whoami requires login. Run: tkt login");
    const url = buildUrl(ENDPOINTS.whoami, {
      ...BASE_PARAMS,
      uniqueId: "self",
    });
    const data = await this.get(url);
    const userInfo = (data.userInfo ?? {}) as Record<string, unknown>;
    return parseUser(userInfo);
  }

  async likeVideo(videoId: string): Promise<void> {
    if (!this.cred?.sessionid) throw new TikTokAuthError("Like requires login. Run: tkt login");
    const url = buildUrl(ENDPOINTS.like_video, {
      ...BASE_PARAMS,
      aweme_id: videoId,
      type: "1",
    });
    await this.get(url);
  }

  async saveVideo(videoId: string): Promise<void> {
    if (!this.cred?.sessionid) throw new TikTokAuthError("Save requires login. Run: tkt login");
    const url = buildUrl(ENDPOINTS.save_video, {
      ...BASE_PARAMS,
      aweme_id: videoId,
      type: "1",
    });
    await this.get(url);
  }
}
