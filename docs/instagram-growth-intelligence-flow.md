# Instagram Growth Intelligence Flow

Purpose: help entrepreneurs, indie hackers, and content creators find Instagram trend signals, analyze product-marketing opportunity, and decide what to create or build next.

## Recommended data access

### Best open-source CLI/API: Instaloader

Use Instaloader first because it is mature, Python-based, supports CLI and library usage, and can fetch metadata for profiles, hashtags, reels, stories, feeds, saved media, comments, geotags, and captions.

Install:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install instaloader
```

Useful commands:

```bash
# Public profile posts and metadata
instaloader profile_name --no-pictures --no-videos --no-video-thumbnails --comments

# Hashtag research. Login is usually required.
instaloader --login YOUR_USERNAME '#aitools' --no-pictures --no-videos --no-video-thumbnails --comments

# Reels for a profile
instaloader --reels profile_name --no-pictures --no-video-thumbnails

# Incremental updates
instaloader --fast-update profile_name
```

Programmatic API:

```python
import instaloader

L = instaloader.Instaloader(download_pictures=False, download_videos=False, save_metadata=True)
profile = instaloader.Profile.from_username(L.context, "instagram")
for post in profile.get_posts():
    print(post.shortcode, post.caption, post.likes, post.comments, post.date_utc, post.video_view_count)
```

### Alternative CLI: instagram-dl / insta-dl

Good for downloader-style workflows. Supports profiles, posts, reels, stories, highlights, hashtags, and comments. Has two backends:

- HikerAPI: paid, no Instagram login, lower ban risk.
- aiograpi: open-source private API backend.

Use if Instaloader becomes unreliable for hashtags or if a paid no-login backend is acceptable.

### Risk notes

Instagram has strict rate limits and private API usage can risk account blocks. Product should:

- prefer user-provided sessions
- avoid aggressive crawling
- cache results
- limit counts per run
- show clear warnings
- never bypass restrictions or scrape private content without authorized access

## Product flow

### 1. Discover

Inputs:

- niche keyword: `ai tools`, `solo founder`, `fitness coach`, `notion template`
- hashtags: `#aitools`, `#indiehacker`, `#buildinpublic`
- competitor profiles
- creator profiles

Fetch:

- recent posts/reels
- captions
- hashtags
- like count
- comment count
- view count when available
- post date
- shortcode/url
- owner username

### 2. Normalize

Convert every Instagram post/reel into a common item:

```json
{
  "platform": "instagram",
  "source": "hashtag|profile|reels",
  "id": "shortcode",
  "url": "https://www.instagram.com/reel/.../",
  "author": "username",
  "caption": "text",
  "created_at": "iso date",
  "view_count": 0,
  "like_count": 0,
  "comment_count": 0,
  "hashtags": [],
  "raw": {}
}
```

### 3. Score trend opportunity

Score 0 to 100 using:

- reach: views or likes relative to median
- engagement: `(likes + comments) / views_or_likes_proxy`
- freshness: newer posts weighted higher
- pain intent: words like `struggle`, `problem`, `hard`, `waste`, `manual`, `confusing`
- buyer intent: `tool`, `template`, `app`, `automation`, `client`, `leads`, `business`, `revenue`
- repeatability: same topic/hook appears across multiple creators

Decision labels:

- 75 to 100: Build/campaign now
- 55 to 74: Create content and validate
- 35 to 54: Watchlist
- 0 to 34: Ignore

### 4. Analyze hooks

Detect reusable hook formats:

- how-to tutorial
- before/after transformation
- founder story
- contrarian warning
- tool stack/listicle
- mistake/fix
- result proof: `$`, `%`, `x`, days

Output:

- top hooks
- top hashtags
- top creator angles
- repeated pain points
- content gaps

### 5. Recommend actions

For each trend, generate:

- 5 reel ideas
- 3 carousel ideas
- 3 productized offers
- 1 lead magnet
- 1 landing page angle
- 1 validation plan

Example action output:

```text
Decision: Create content and validate
Why: high engagement, repeated automation pain, clear buyer intent.
Do next:
1. Post a reel: "I automated 3 hours of founder content research in 10 minutes."
2. Offer a free trend audit checklist as lead magnet.
3. If comments ask for the workflow, build a small paid dashboard.
```

## CLI shape to add later

Use the same shape as `tkt-cli`:

```bash
ig market "ai tools" --source hashtag --count 50
ig profile competitor_name --reels --count 30 --format json
ig export hashtag aitools --out data/ig-aitools.json
ig compare hashtag aitools buildinpublic solofounder
```

Or integrate into `tkt-cli` as multi-platform commands:

```bash
tkt market "ai tools" --platform instagram --source hashtag
tkt market "ai tools" --platform tiktok --source search
tkt compare "ai tools" --platforms tiktok,instagram
```

## MVP implementation recommendation

Start with Instaloader backend:

1. Add optional dependency: `instaloader>=4.15.1`.
2. Add `InstagramTrendClient` with methods:
   - `get_profile(username, count)`
   - `get_hashtag(tag, count)`
   - `get_reels(username, count)`
3. Normalize to existing `VideoResult` or a new cross-platform `TrendResult`.
4. Reuse current `analyze_market()` scoring from `tkt-cli`.
5. Add `--platform instagram` later after TikTok path is stable.

This gives the product a real Instagram research path without building a fragile scraper from scratch.
