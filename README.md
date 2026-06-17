# tkt-cli

[![CI](https://github.com/princepal9120/tkt-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/princepal9120/tkt-cli/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/princepal9120/tkt-cli)](https://github.com/princepal9120/tkt-cli/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

TikTok in your terminal — browse feeds, search, analyze trends, and interact. Built with [Bun](https://bun.sh) as a **single binary** (no Node, no Python, no runtime needed).

- one obvious binary: `tkt`
- guest mode first — trending, hashtags, search, and user profiles work without login
- automatic browser cookie extraction — `tkt login` reads Chrome/Brave/Firefox directly, no copy-pasting
- works from blocked regions — `--proxy` / `TKT_PROXY` routes around country-level blocks (see below)
- table output for humans, `--json` for pipelines and AI agents
- Chrome 133 fingerprint + request signing + Gaussian jitter for real-world reliability

## ⚠️ Is TikTok blocked in your country? (India, etc.) — read this first

There are **two different kinds of block**, and they need different fixes. tkt-cli tells you which one you've hit.

**1. DNS block (handled automatically).** Many ISPs block TikTok by poisoning DNS — `www.tiktok.com` resolves to a dead "sinkhole" IP. tkt-cli works around this on its own using **DNS-over-HTTPS** (it resolves the real IP via Cloudflare/Google, which aren't blocked). You don't have to do anything. To disable it, set `TKT_NO_DOH=1`.

**2. Geo-block by IP (needs a foreign exit).** Some countries — notably **India** (TikTok banned since 2020) — go further: TikTok itself **refuses connections from your country's IP addresses**. You'll see:

```
✗ TikTok is geo-blocking your IP (redirected to https://www.tiktok.com/in/about). ...
```

DNS-over-HTTPS cannot fix this, because the problem isn't DNS — it's your **source IP**. TikTok sees an Indian IP and turns you away. A US account and US cookies do **not** help. You must make your traffic *leave* your machine from a non-blocked region:

**Option A — full-tunnel system VPN (simplest).** Connect a VPN to a US/SG/UK region in **full-tunnel / "route all traffic"** mode, then run `tkt` normally.

> ⚠️ A **browser VPN does not work** for the CLI. Brave's built-in VPN, VPN extensions, and split-tunnel setups only route *browser* traffic. tkt-cli is a terminal app — its traffic bypasses them. That's why login (done in the browser) works while commands fail. Use a system-wide/full-tunnel VPN.

**Option B — HTTP proxy (no system VPN needed).** Pass a proxy whose exit IP is in a non-blocked region:

```bash
tkt --proxy http://user:pass@host:port trending      # per-command
export TKT_PROXY="http://user:pass@host:port"         # permanent for the session
tkt trending
```

> The `--proxy` flag is global — put it **before** the subcommand: `tkt --proxy <url> <command>`. `TKT_PROXY` works anywhere. When a proxy is set, tkt-cli routes DNS through it and skips DoH.

Either way, requests **fail fast** with a precise message (DNS sinkhole vs. geo-block vs. timeout), so you know immediately what's wrong and whether your VPN/proxy is actually covering the CLI.

## Install

### One-line install (macOS / Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/princepal9120/tkt-cli/main/install.sh | bash
```

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/princepal9120/tkt-cli/main/install.ps1 | iex
```

### Manual binary download

```bash
# macOS Apple Silicon
curl -Lo tkt https://github.com/princepal9120/tkt-cli/releases/latest/download/tkt-darwin-arm64
chmod +x tkt && sudo mv tkt /usr/local/bin/

# macOS Intel
curl -Lo tkt https://github.com/princepal9120/tkt-cli/releases/latest/download/tkt-darwin-x64
chmod +x tkt && sudo mv tkt /usr/local/bin/

# Linux x64
curl -Lo tkt https://github.com/princepal9120/tkt-cli/releases/latest/download/tkt-linux-x64
chmod +x tkt && sudo mv tkt /usr/local/bin/
```

### From source (requires [Bun](https://bun.sh))

```bash
git clone https://github.com/princepal9120/tkt-cli
cd tkt-cli
bun install
bun run dev -- --help     # run without compiling
bun run build             # compile → ./tkt single binary
```

## Quick start

```bash
tkt trending                          # 1. browse without login (works in guest mode)
tkt login                             # 2. add your TikTok session for feed/like/comment
tkt search "ai marketing tools"       # 3. research
tkt market "ai marketing tools"       # 4. turn research into a build/skip decision
```

## Global flags

These work on every command:

| Flag | Purpose |
|---|---|
| `--proxy <url>` | Route all requests through an HTTP/HTTPS proxy. Use from geo-blocked regions (e.g. India). Also settable via `TKT_PROXY` env var. Put it before the subcommand. |
| `--json` | Machine-readable output (most commands). Envelope: `{ "ok": true, "schema_version": "1.0", "data": ... }` |
| `--version` | Print version |
| `--help` | Per-command help, e.g. `tkt market --help` |

Environment variables:

| Var | Purpose |
|---|---|
| `TKT_PROXY` | Same as `--proxy`, persists for the session. |
| `TKT_NO_DOH=1` | Disable the built-in DNS-over-HTTPS resolver (on by default; it bypasses ISP DNS sinkholes). |

## Auth

Most browse/search/analytics commands work **without** login. Login is only needed for your own feed and for write actions (like, save, comment, follow, scheduling). Run `tkt login` to pull cookies from your browser automatically — no DevTools, no copy-pasting.

```bash
tkt login                                        # auto-extract from Chrome / Brave / Firefox
tkt login --cookie "msToken=x; sessionid=y"      # paste full cookie string from DevTools
tkt login --ms-token <val> --session-id <val>    # paste individual values
tkt status                                       # check auth state
tkt whoami                                       # show your TikTok profile (requires login)
tkt logout                                       # remove stored credentials
```

### How `tkt login` works

**Option 1 — automatic (recommended):** `tkt login` with no flags reads your browser's cookie database directly on disk, decrypts it, and saves the tokens.

| Browser | macOS | Linux |
|---|---|---|
| Chrome | ✅ | ✅ |
| Brave | ✅ | ✅ |
| Edge | ✅ | — |
| Firefox | ✅ | ✅ |

On macOS, Chrome/Brave encrypt cookies with a key in your Keychain. On first run you may see: _"tkt wants to use your confidential information stored in 'Chrome Safe Storage' in your keychain."_ Click **Allow**. tkt only reads the key in memory — nothing is stored or sent.

> **Note:** Chrome's newest `v20` cookie encryption is not yet supported for auto-extraction. If auto-extract returns nothing, use Option 2 or 3 below.

**Option 2 — paste cookie string (no browser on this machine):**

1. Open [tiktok.com](https://www.tiktok.com) in any browser and log in
2. DevTools (`F12`) → Network tab → click any request → Headers → copy the **Cookie** header value
3. Run: `tkt login --cookie "msToken=abc123...; sessionid=xyz..."`

**Option 3 — paste individual values:**

1. DevTools → Application → Cookies → tiktok.com
2. Copy `msToken` and `sessionid` separately
3. Run: `tkt login --ms-token <msToken value> --session-id <sessionid value>`

> Credentials are stored in `~/.tkt/config.json`. Run `tkt login` again any time to refresh them.

## Command reference

### Browse — `tkt trending · hashtag · user · user-videos · feed`

Discover and read content. All except `feed` work in guest mode.

| Command | Use case |
|---|---|
| `tkt trending [-n 20] [--region US]` | See what's trending now in a region. Foundation for trend research. |
| `tkt hashtag <tag> [-n 20]` | Pull videos for a hashtag, e.g. niche or campaign research. |
| `tkt user <username> [-n 20]` | A creator's profile (followers, likes) plus their latest videos. |
| `tkt user-videos <username> [-n 20]` | Just the video list for a creator — feeds analytics/exports. |
| `tkt feed [--following] [-n 20]` | Your own For You (or `--following`) feed. **Requires login.** |

```bash
tkt trending                          # trending videos (US)
tkt trending --region IN -n 30        # 30 trending in India
tkt hashtag fyp                       # videos for #fyp
tkt hashtag "buildinpublic" -n 50
tkt user mrbeast                      # profile + latest videos
tkt user-videos charlidamelio -n 20   # videos only
tkt feed                              # your For You feed (requires login)
tkt feed --following                  # following feed (requires login)
```

### Search — `tkt search`

```bash
tkt search "cooking tips"             # search videos by keyword
tkt search "ai tools" -n 30 --json    # pipe results into jq / a script
```

### View & interact — `tkt show · open · like · save · comment · reply · comments`

After any listing command, refer to a result by its row `#` instead of a full video ID (the last listing is cached in `~/.tkt`).

| Command | Use case | Login |
|---|---|---|
| `tkt show <#\|id\|url>` | Full video details + top comments. | no |
| `tkt open <#\|id\|url>` | Open the video in your browser. | no |
| `tkt comments <id> [-n 20]` | List comments on a video. | no |
| `tkt like <#\|id>` | Like a video. | yes |
| `tkt save <#\|id>` | Save a video to favorites. | yes |
| `tkt comment <#\|id> "<text>"` | Post a comment. | yes |
| `tkt reply <commentId> "<text>" [--video <id>]` | Reply to a comment. | yes |

```bash
tkt trending
tkt show 3                            # details + comments for result #3
tkt open 3                            # open result #3 in browser
tkt like 3                            # like result #3 (requires login)
tkt save 3                            # save to favorites (requires login)
tkt comment 3 "Great video!"          # comment on result #3 (requires login)
tkt show 7298765432109876543          # or pass a raw video ID / URL
```

### Social graph — `tkt follow · unfollow · following · followers`

| Command | Use case | Login |
|---|---|---|
| `tkt follow <user>` | Follow a creator. | yes |
| `tkt unfollow <user>` | Unfollow a creator. | yes |
| `tkt following [username] [-n 20]` | Who a user follows (defaults to you). | yes |
| `tkt followers [username] [-n 20]` | A user's followers (defaults to you). | no |

```bash
tkt follow charlidamelio
tkt unfollow charlidamelio
tkt following            # accounts you follow
tkt followers mrbeast    # mrbeast's followers
```

### Analytics — `tkt analytics · competitor · growth · top-videos`

Turn public profile/video data into metrics. No login required (reads public data).

| Command | Use case |
|---|---|
| `tkt analytics [username] [--video <id>]` | Account analytics dashboard, or single-video stats with `--video`. |
| `tkt competitor <user> [-n 30]` | Competitor breakdown: posting cadence, engagement, top formats. |
| `tkt growth [username] [--period 7d\|30d\|90d]` | Growth/engagement metrics over a window. |
| `tkt top-videos <user> [--sort views\|likes\|comments\|engagement] [-n 30]` | A creator's best-performing videos by a chosen metric. |

```bash
tkt analytics mrbeast
tkt analytics --video 7298765432109876543
tkt competitor charlidamelio -n 50
tkt growth mrbeast --period 90d
tkt top-videos khaby.lame --sort engagement
```

### Market intelligence — `tkt market`

Turns raw trend data into an indie-hacker build/skip decision.

```bash
tkt market "ai marketing tools"
tkt market aitools --source hashtag -n 50
tkt market "solo founder CRM" --source search --json > report.json
tkt market memes --source trending --region US
```

Sources: `search` (default), `hashtag`, `trending`. Output: opportunity score (0–100), decision (build now / validate / watchlist / ignore), top keywords, hashtags, hook formats, content angles, product opportunities, and a 4-step validation plan.

### Export — `tkt export`

Dump data to JSON or CSV for spreadsheets, dashboards, or AI pipelines.

```bash
tkt export trending -o data/trending.json
tkt export trending -o data/trending.csv --format csv --region IN -n 100
tkt export hashtag aitools -o data/aitools.json
tkt export user mrbeast -o data/mrbeast.json
tkt export search "solofounder" -o data/solofounder.json
```

`kind` is one of `trending | hashtag | user | search`. `-o/--out` is required; `--format` is `json` (default) or `csv`.

### Bulk & monitoring — `tkt bulk-like · bulk-follow · monitor`

| Command | Use case | Login |
|---|---|---|
| `tkt bulk-like <file> [--delay 1000]` | Like many videos from a file of IDs (one per line). | yes |
| `tkt bulk-follow <file> [--delay 2000]` | Follow many users from a file of usernames. | yes |
| `tkt monitor <hashtag> [--interval 60] [--count 10]` | Poll a hashtag and stream new videos as they appear. | no |

```bash
tkt bulk-like ids.txt --delay 1500
tkt bulk-follow users.txt
tkt monitor buildinpublic --interval 120 --json   # JSON-lines stream of new posts
```

> `--delay` throttles between actions to stay under rate limits. Keep it generous.

### Accounts — `tkt accounts · add · switch · remove`

Manage multiple TikTok logins and switch the active one.

```bash
tkt login                # log in to an account first
tkt accounts add work    # save current credentials as "work"
tkt accounts             # list saved accounts
tkt accounts switch work # make "work" the active account
tkt accounts remove work # delete a saved account
```

### Posting (experimental) — `tkt upload · delete · caption · drafts · schedule · queue`

> ⚠️ **TikTok's web cookie auth cannot upload videos.** Upload/draft/fire require official **TikTok Developer API** credentials (apply at [developers.tiktok.com](https://developers.tiktok.com)). These commands are scaffolding; the metadata/queue parts work, the actual upload does not without Developer API access.

| Command | Status |
|---|---|
| `tkt upload <file>` | Needs Developer API. |
| `tkt delete <id>` | Delete one of your videos (cookie auth). |
| `tkt caption <id> [text]` | Show / attempt caption update. |
| `tkt drafts` | Needs Developer API. |
| `tkt schedule <file> --at "2025-12-31 23:59" [--caption ...] [--tags a,b]` | Queue a post locally. |
| `tkt queue` | List the local schedule. |
| `tkt queue fire` | Fire due posts (upload needs Developer API). |
| `tkt queue cancel <id>` | Cancel a scheduled post by index or id prefix. |

## Output format

All listing commands support `--json`:

```bash
tkt trending --json
tkt search "fitness" --json | jq '.data[].author'
```

Envelope schema:

```json
{ "ok": true, "schema_version": "1.0", "data": [] }
```

## Build binaries

```bash
bun run build           # current platform → ./tkt
bun run build:all       # cross-compile mac-arm + mac-x64 + linux → dist/
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `TikTok is geo-blocking your IP (redirected to .../about)` | TikTok refuses your country's IPs (e.g. India). DNS was bypassed but your source IP is blocked. | Full-tunnel system VPN, or `--proxy` with a foreign exit. **Browser VPNs don't cover the CLI.** |
| `Could not reach TikTok (connection timed out)` | Network can't reach TikTok at all (DNS/firewall), and DoH couldn't help. | Use a full-tunnel VPN, or `--proxy` / `TKT_PROXY`. See [the blocked-region section](#️-is-tiktok-blocked-in-your-country-india-etc--read-this-first). |
| `TikTok blocked request (HTTP 403/429)` | Rate-limited or unsigned from your IP. | Slow down, lower `-n`, run `tkt login`, or rotate `--proxy`. |
| Commands connect but return empty results | Web request signing (`X-Bogus`) is an approximation, not TikTok's current algorithm (TikTok now uses `X-Gnarly`). | Re-run `tkt login` to capture `ttwid` cookies; try `TKT_NO_SIGN=1 tkt trending` to compare cookie-only vs signed. A full fix needs a real signer — see [Known limitation](#known-limitation-request-signing). |
| Commands return empty results | Missing session or geo-restricted content. | Run `tkt login`; try `--region`; lower `-n`. |
| `tkt login` finds nothing | Chrome `v20` cookie encryption. | Use `tkt login --cookie "..."` (Option 2 above). |
| Upload says "requires Developer API" | Web cookies can't upload by design. | Apply for the TikTok Developer API. |

### Will it get blocked?

**Guest mode works for most users at a normal research pace. Heavy scraping gets rate-limited.**

| Scenario | Reliability |
|---|---|
| Guest mode, 1–3 requests/min | ✅ Works for most users |
| Authenticated (`tkt login`), normal pace | ✅ Best reliability |
| >10 requests/min, no auth | ⚠️ Rate limited — add `--proxy` or slow down |
| Same IP, hundreds of requests | ❌ Temporary block — rotate proxy or wait |

What's implemented to reduce blocking:
- Chrome 133 consistent fingerprint headers (`sec-ch-ua`, `sec-fetch-*`)
- Request signing on the query string (TikTok returns empty results otherwise)
- Gaussian jitter between requests (300ms mean)
- Built-in DNS-over-HTTPS to bypass ISP DNS sinkholes (disable with `TKT_NO_DOH=1`)
- 20s connect timeout + geo-block detection so blocked regions fail fast with a precise reason instead of hanging

This CLI uses user-provided browser auth and publicly visible data. It does not bypass TikTok access controls.

## Known limitation: request signing

TikTok's web API expects a signed query parameter. This CLI ships an **approximation** of the old `X-Bogus` signer, but TikTok has since moved to **`X-Gnarly`**, and the real algorithm runs inside TikTok's obfuscated `webmssdk.js`. As a result, some endpoints (notably `trending`/`search`) may return **empty results** even when your network and login are fine.

Mitigations in place: requests send your real `msToken` + `ttwid` + `sessionid` cookies (re-run `tkt login` to refresh), and you can disable the approximate signer with `TKT_NO_SIGN=1` to test cookie-only behavior.

A complete fix means generating a valid signature. The only reliable known method is running TikTok's own SDK in a headless browser. Reference implementations to port from:
- [carcabot/tiktok-signature](https://github.com/carcabot/tiktok-signature) — Node + headless browser executing `webmssdk.js`, outputs valid `X-Bogus`/`X-Gnarly` (maintained 2026)
- [davidteather/TikTok-Api](https://github.com/davidteather/TikTok-Api) — Python + Playwright reference
- [justscrapeme/tiktok-web-reverse-engineering](https://github.com/justscrapeme/tiktok-web-reverse-engineering) — `X-Gnarly` notes

This would add a headless-browser dependency, trading the single-binary footprint for working signatures.

## Roadmap

- Disk cache for repeated research runs
- Trend velocity + freshness scoring
- Chrome `v20` cookie decryption for auto-login
