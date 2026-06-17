import { CHROME_HEADERS, jitter, xBogus, UA } from "./fingerprint.js";
import { ENDPOINTS, BASE_PARAMS } from "./endpoints.js";
import type { VideoResult, UserProfile, Comment, VideoDetail } from "../models.js";
import type { Credential } from "../models.js";
import type { FollowResult, CommentResult, PublishResult, AccountAnalytics, VideoAnalytics, CompetitorAnalysis } from "../models.js";
import { computeAccountAnalytics, computeVideoAnalytics, computeCompetitorAnalysis } from "../metrics.js";

export class TikTokError extends Error {}
export class TikTokBlockedError extends TikTokError {}
export class TikTokAuthError extends TikTokError {}

function buildUrl(base: string, params: Record<string, string>): string {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  // X-Bogus signs the query string. NOTE: the current implementation is an
  // approximation, not TikTok's real algorithm — a wrong signature can cause
  // TikTok to reject the request, so it can be disabled for cookie-only testing.
  if (process.env.TKT_NO_SIGN !== "1") {
    const qs = u.search.slice(1);
    u.searchParams.set("X-Bogus", xBogus(qs, UA));
  }
  return u.toString();
}

// DNS-over-HTTPS resolver. ISPs in some countries (e.g. India) block TikTok with
// a DNS sinkhole, so the system resolver returns a dead IP and every request times
// out. Resolving the real IP via DoH (Cloudflare/Google — not blocked) and connecting
// to it with the correct SNI bypasses the block with no VPN or proxy needed.
const dohCache = new Map<string, { ip: string; expires: number }>();

async function resolveDoh(host: string): Promise<string | null> {
  const cached = dohCache.get(host);
  if (cached && cached.expires > Date.now()) return cached.ip;
  const providers = [
    `https://1.1.1.1/dns-query?name=${host}&type=A`,
    `https://dns.google/resolve?name=${host}&type=A`,
  ];
  for (const url of providers) {
    try {
      const r = await fetch(url, {
        headers: { accept: "application/dns-json" },
        signal: AbortSignal.timeout(8000),
      });
      const j = (await r.json()) as { Answer?: Array<{ type: number; data: string }> };
      const a = (j.Answer ?? []).find((x) => x.type === 1 && /^[0-9.]+$/.test(x.data));
      if (a?.data) {
        dohCache.set(host, { ip: a.data, expires: Date.now() + 5 * 60_000 });
        return a.data;
      }
    } catch {
      // try next provider
    }
  }
  return null;
}

function cookieHeader(cred?: Credential): string {
  if (!cred) return "";
  const parts: string[] = [];
  if (cred.msToken) parts.push(`msToken=${cred.msToken}`);
  if (cred.sessionid) parts.push(`sessionid=${cred.sessionid}`);
  // ttwid / tt_webid_v2 are the device-identity cookies the web API checks for
  // guest access — sending them materially improves the odds of a non-empty reply.
  if (cred.ttwid) parts.push(`ttwid=${cred.ttwid}`);
  if (cred.tt_webid_v2) parts.push(`tt_webid_v2=${cred.tt_webid_v2}`);
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
    secUid: String(user.secUid ?? ""),
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
    this.proxy = proxy ?? process.env.TKT_PROXY ?? undefined;
  }

  // Single network entry point: applies the proxy (when set), a connect timeout,
  // and turns low-level connection failures into an actionable message. Without
  // the timeout a DNS-blocked host (e.g. TikTok in India) hangs for ~2 minutes.
  private async fetchRaw(url: string, init: RequestInit): Promise<Response> {
    // A TikTok API call always returns 200 JSON; a 3xx means the request was
    // refused (geo-block / not signed). So we never follow redirects — we detect
    // them and surface a precise reason instead of letting fetch chase a redirect
    // back through blocked DNS (which would hang).
    const opts: Record<string, unknown> = { ...init, redirect: "manual", signal: AbortSignal.timeout(20000) };
    let target = url;

    if (this.proxy) {
      // A proxy resolves DNS remotely, so it already bypasses local DNS blocks.
      opts.proxy = this.proxy;
    } else if (process.env.TKT_NO_DOH !== "1") {
      // No proxy: resolve via DoH and connect to the real IP, keeping SNI/Host
      // as the original hostname. This bypasses ISP DNS sinkholes (the cheap kind
      // of block). It does NOT change your source IP, so it cannot defeat an
      // application-layer geo-block (e.g. TikTok refusing Indian IPs).
      try {
        const u = new URL(url);
        const origHost = u.hostname;
        const ip = await resolveDoh(origHost);
        if (ip) {
          u.hostname = ip;
          target = u.toString();
          opts.headers = { ...(init.headers as Record<string, string>), Host: origHost };
          opts.tls = { serverName: origHost };
        }
      } catch {
        // resolution failed — fall through to a direct fetch on the original URL
      }
    }

    let res: Response;
    try {
      res = await fetch(target, opts as RequestInit);
    } catch (e) {
      const isTimeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      const detail = isTimeout ? "connection timed out" : e instanceof Error ? e.message : String(e);
      throw new TikTokBlockedError(
        `Could not reach TikTok (${detail}). If TikTok is blocked in your country ` +
          `(e.g. India), use a full-tunnel VPN or pass --proxy http://host:port ` +
          `(set TKT_PROXY to make it permanent). A browser-only VPN does not cover the CLI.`,
      );
    }

    // Geo-block: TikTok redirects requests from banned regions to a "/<cc>/about"
    // page. DoH fixes DNS but cannot change the source IP that triggers this.
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location") ?? "";
      if (/\/[a-z]{2}\/about/i.test(loc) || /\/about\b/i.test(loc)) {
        throw new TikTokBlockedError(
          `TikTok is geo-blocking your IP (redirected to ${loc || "its region page"}). ` +
            `Your network reached TikTok, but TikTok refuses requests from your region ` +
            `(e.g. India, where TikTok is banned). Route through a non-blocked exit IP: ` +
            `a full-tunnel system VPN, or --proxy http://host:port with a foreign exit. ` +
            `A browser-only VPN (e.g. Brave) does not cover the CLI.`,
        );
      }
    }
    return res;
  }

  private async get(url: string, extraHeaders: Record<string, string> = {}): Promise<Record<string, unknown>> {
    await jitter(300);

    const headers: Record<string, string> = {
      ...CHROME_HEADERS,
      ...extraHeaders,
    };
    const cookies = cookieHeader(this.cred);
    if (cookies) headers["Cookie"] = cookies;

    const res = await this.fetchRaw(url, { headers });

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

  private async post(url: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    await jitter(300);

    const headers: Record<string, string> = {
      ...CHROME_HEADERS,
      "Content-Type": "application/json",
    };
    const cookies = cookieHeader(this.cred);
    if (cookies) headers["Cookie"] = cookies;

    const res = await this.fetchRaw(url, { method: "POST", headers, body: JSON.stringify(body) });

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
      secUid: profile.secUid || profile.id,
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

  async postComment(videoId: string, text: string): Promise<CommentResult> {
    if (!this.cred?.sessionid) throw new TikTokAuthError("Post comment requires login. Run: tkt login");
    const url = buildUrl(ENDPOINTS.comment_post, { ...BASE_PARAMS });
    const data = await this.post(url, { aweme_id: videoId, text, type: "1", ...BASE_PARAMS });
    const comment = (data.comment ?? {}) as Record<string, unknown>;
    return { id: String(comment.cid ?? comment.id ?? ""), text, videoId, success: true };
  }

  async replyComment(videoId: string, commentId: string, text: string): Promise<CommentResult> {
    if (!this.cred?.sessionid) throw new TikTokAuthError("Reply comment requires login. Run: tkt login");
    const url = buildUrl(ENDPOINTS.comment_post, { ...BASE_PARAMS });
    const data = await this.post(url, { aweme_id: videoId, text, type: "2", reply_id: commentId, ...BASE_PARAMS });
    const comment = (data.comment ?? {}) as Record<string, unknown>;
    return { id: String(comment.cid ?? comment.id ?? ""), text, videoId, success: true };
  }

  async getComments(videoId: string, count = 20, cursor = 0): Promise<Comment[]> {
    const url = buildUrl(ENDPOINTS.comment_list, {
      ...BASE_PARAMS,
      aweme_id: videoId,
      count: String(count),
      cursor: String(cursor),
    });
    const data = await this.get(url);
    const rawComments = (data.comments ?? []) as Array<Record<string, unknown>>;
    return rawComments.map(parseComment);
  }

  async followUser(userId: string): Promise<FollowResult> {
    if (!this.cred?.sessionid) throw new TikTokAuthError("Follow requires login. Run: tkt login");
    const url = buildUrl(ENDPOINTS.follow_user, { ...BASE_PARAMS });
    await this.post(url, { user_id: userId, type: "1", ...BASE_PARAMS });
    return { success: true, userId, username: "", action: "follow" };
  }

  async unfollowUser(userId: string): Promise<FollowResult> {
    if (!this.cred?.sessionid) throw new TikTokAuthError("Unfollow requires login. Run: tkt login");
    const url = buildUrl(ENDPOINTS.unfollow_user, { ...BASE_PARAMS });
    await this.post(url, { user_id: userId, type: "0", ...BASE_PARAMS });
    return { success: true, userId, username: "", action: "unfollow" };
  }

  async getFollowing(secUid: string, count = 20): Promise<UserProfile[]> {
    if (!this.cred?.sessionid) throw new TikTokAuthError("Following list requires login. Run: tkt login");
    const url = buildUrl(ENDPOINTS.following_list, {
      ...BASE_PARAMS,
      secUid,
      count: String(count),
    });
    const data = await this.get(url);
    const list = (data.followingList ?? []) as Array<Record<string, unknown>>;
    return list.map(parseUser);
  }

  async getFollowers(secUid: string, count = 20): Promise<UserProfile[]> {
    const url = buildUrl(ENDPOINTS.follower_list, {
      ...BASE_PARAMS,
      secUid,
      count: String(count),
    });
    const data = await this.get(url);
    const list = (data.followers ?? []) as Array<Record<string, unknown>>;
    return list.map(parseUser);
  }

  async deleteVideo(videoId: string): Promise<void> {
    if (!this.cred?.sessionid) throw new TikTokAuthError("Delete video requires login. Run: tkt login");
    const url = buildUrl(ENDPOINTS.video_delete, { ...BASE_PARAMS });
    await this.post(url, { aweme_id: videoId, ...BASE_PARAMS });
  }

  async getAccountAnalytics(username: string): Promise<AccountAnalytics> {
    const { profile, videos } = await this.getUser(username, 50);
    return computeAccountAnalytics(profile, videos);
  }

  async getVideoAnalytics(videoId: string): Promise<VideoAnalytics> {
    const detail = await this.getVideoDetail(videoId);
    return computeVideoAnalytics(detail);
  }

  async getCompetitorAnalysis(username: string, count = 30): Promise<CompetitorAnalysis> {
    const { profile, videos } = await this.getUser(username, count);
    return computeCompetitorAnalysis(profile, videos);
  }

  async uploadVideo(_filePath: string, _caption: string, _hashtags: string[]): Promise<PublishResult> {
    throw new TikTokError(
      "Video upload requires TikTok Developer API credentials. Web cookie auth does not support upload. Apply at developers.tiktok.com"
    );
  }
}
