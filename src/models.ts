export interface VideoResult {
  id: string;
  desc: string;
  author: string;
  authorId: string;
  createTime: number;
  playCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  url: string;
  musicTitle?: string;
  hashtags: string[];
  duration?: number;
}

export interface UserProfile {
  id: string;
  uniqueId: string;
  nickname: string;
  bio?: string;
  followerCount: number;
  followingCount: number;
  heartCount: number;
  videoCount: number;
  verified: boolean;
  avatarUrl?: string;
}

export interface Comment {
  id: string;
  text: string;
  author: string;
  likeCount: number;
  createTime: number;
  replies?: Comment[];
}

export interface VideoDetail extends VideoResult {
  comments: Comment[];
  downloadUrl?: string;
}

export interface Credential {
  msToken?: string;
  sessionid?: string;
  source: "browser" | "manual" | "unknown";
  savedAt: number;
  username?: string;
}

export interface Config {
  credential?: Credential;
  region?: string;
  proxies?: string[];
}

export interface Envelope<T> {
  ok: boolean;
  schema_version: "1.0";
  data?: T;
  error?: string;
}

export type OutputFormat = "table" | "json";
