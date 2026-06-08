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
  secUid: string;
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

export interface FollowResult {
  success: boolean;
  userId: string;
  username: string;
  action: "follow" | "unfollow";
}

export interface CommentResult {
  id: string;
  text: string;
  videoId: string;
  success: boolean;
}

export interface PublishResult {
  videoId: string;
  url: string;
  status: "published" | "processing";
}

export interface Draft {
  id: string;
  desc: string;
  createdAt: number;
  status: "draft" | "scheduled";
  scheduledAt?: number;
}

export interface AccountAnalytics {
  userId: string;
  username: string;
  followerCount: number;
  followingCount: number;
  totalLikes: number;
  totalVideos: number;
  avgViews: number;
  avgLikes: number;
  avgComments: number;
  engagementRate: number;
  period: "7d" | "30d" | "90d" | "all";
}

export interface VideoAnalytics {
  videoId: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagementRate: number;
  completionRate: number;
}

export interface AudienceInsight {
  topCountries: Array<{ country: string; percentage: number }>;
  ageGroups: Array<{ range: string; percentage: number }>;
  genderSplit: { female: number; male: number; unknown: number };
  peakHours: Array<{ hour: number; score: number }>;
}

export interface CompetitorAnalysis {
  username: string;
  followerCount: number;
  avgViews: number;
  avgEngagementRate: number;
  postingFrequencyPerWeek: number;
  topHashtags: Array<[string, number]>;
  topVideos: VideoResult[];
  contentAngles: string[];
}

export interface GrowthData {
  period: "7d" | "30d" | "90d";
  currentFollowers: number;
  followerDelta: number;
  avgViewsDelta: number;
  bestPerformingVideoId?: string;
}

export interface ScheduledPost {
  id: string;
  filePath: string;
  caption: string;
  hashtags: string[];
  scheduledAt: number;
  status: "pending" | "posted" | "failed";
  createdAt: number;
  error?: string;
}

export interface BulkResult {
  type: "like" | "follow";
  total: number;
  completed: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}

export interface Account {
  name: string;
  credential: Credential;
  isActive: boolean;
  addedAt: number;
}
