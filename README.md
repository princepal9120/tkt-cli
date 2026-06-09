# tkt-cli

[![CI](https://github.com/princepal9120/tkt-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/princepal9120/tkt-cli/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/princepal9120/tkt-cli)](https://github.com/princepal9120/tkt-cli/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

TikTok in your terminal — browse feeds, search, and analyze trends. Built with [Bun](https://bun.sh) as a **single binary** (no Node, no Python, no runtime needed).

- one obvious binary: `tkt`
- guest mode first — trending, hashtags, search, and user profiles work without login
- automatic browser cookie extraction — `tkt login` reads Chrome/Brave/Firefox directly, no copy-pasting
- no-browser fallback — paste a cookie string from DevTools if auto-extract can't run
- structured exports for agents and automations
- table output for humans, `--json` for pipelines
- Chrome 133 fingerprint + X-Bogus signing + Gaussian jitter for real-world reliability

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

## Auth

Most commands work without login. Run `tkt login` to automatically pull cookies from your browser — no DevTools, no copy-pasting.

```bash
tkt login                                        # auto-extract from Chrome / Brave / Firefox
tkt login --cookie "msToken=x; sessionid=y"      # paste full cookie string from DevTools
tkt login --ms-token <val> --session-id <val>    # paste individual values
tkt status                                       # check auth state
tkt whoami                                       # show your TikTok profile
tkt logout
```

### How `tkt login` works

**Option 1 — automatic (recommended):** `tkt login` with no flags reads your browser's cookie database directly on disk, decrypts it, and saves the tokens. No DevTools needed.

| Browser | macOS | Linux |
|---|---|---|
| Chrome | ✅ | ✅ |
| Brave | ✅ | ✅ |
| Edge | ✅ | — |
| Firefox | ✅ | ✅ |

On macOS, Chrome/Brave encrypt cookies with a key stored in your system Keychain. On first run you may see a macOS prompt: _"tkt wants to use your confidential information stored in 'Chrome Safe Storage' in your keychain."_ Click **Allow**. tkt only reads the key in memory — nothing is stored or sent.

**Option 2 — paste cookie string (no browser on this machine):**

1. Open [tiktok.com](https://www.tiktok.com) in any browser and log in
2. Open DevTools (`F12`) → Network tab → click any request → Headers → copy the **Cookie** header value
3. Run:
   ```bash
   tkt login --cookie "msToken=abc123...; sessionid=xyz..."
   ```

**Option 3 — paste individual values:**

1. DevTools → Application → Cookies → tiktok.com
2. Copy `msToken` and `sessionid` values separately
3. Run:
   ```bash
   tkt login --ms-token <msToken value> --session-id <sessionid value>
   ```

> Credentials are stored in `~/.tkt/config.json`. Run `tkt login` again any time to refresh them.

## Browse

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

## Search

```bash
tkt search "cooking tips"
tkt search "ai tools" -n 30 --json
```

## View & Interact

After any listing command, use the row `#` instead of a full video ID:

```bash
tkt trending
tkt show 3          # details + comments for result #3
tkt open 3          # open result #3 in browser
tkt like 3          # like result #3 (requires login)
tkt save 3          # save to favorites (requires login)
```

Pass a video ID or URL directly:

```bash
tkt show 7298765432109876543
tkt open https://www.tiktok.com/@user/video/7298765432109876543
```

## Export

```bash
tkt export trending -o data/trending.json
tkt export trending -o data/trending.csv --format csv --region IN -n 100
tkt export hashtag aitools -o data/aitools.json
tkt export user mrbeast -o data/mrbeast.json
tkt export search "solofounder" -o data/solofounder.json
```

## Market Intelligence

`tkt market` turns raw trend data into an indie-hacker decision:

```bash
tkt market "ai marketing tools"
tkt market aitools --source hashtag -n 50
tkt market "solo founder CRM" --source search --json > report.json
```

Output: opportunity score (0–100), decision (build now / validate / watchlist / ignore), top keywords, hashtags, hook formats, content angles, product opportunities, and a 4-step validation plan.

## Output format

All commands support `--json` for structured output:

```bash
tkt trending --json
tkt search "fitness" --json | jq '.data[].author'
```

Envelope schema:

```json
{ "ok": true, "schema_version": "1.0", "data": [...] }
```

## Build binaries

```bash
bun run build           # current platform → ./tkt
bun run build:all       # cross-compile mac-arm + mac-x64 + linux → dist/
```

## Will it get blocked?

Short answer: **guest mode works for most users at normal research pace. Heavy scraping will get rate-limited.**

| Scenario | Reliability |
|---|---|
| Guest mode, 1–3 requests/min | ✅ Works for most users |
| Authenticated (`tkt login`), normal pace | ✅ Best reliability |
| >10 requests/min, no auth | ⚠️ Rate limited — add `--proxy` or slow down |
| Same IP, hundreds of requests | ❌ Temporary block — rotate proxy or wait |

What's implemented to reduce blocking:
- Chrome 133 consistent fingerprint headers (`sec-ch-ua`, `sec-fetch-*`)
- **X-Bogus request signing** — required or TikTok silently returns empty results
- Gaussian jitter between requests (300ms mean, ±90ms)
- Exponential backoff on 429 / 403

If commands return empty results:
1. Run `tkt login` to add your browser session
2. Lower `-n` count
3. Use `--proxy http://user:pass@host:port` to rotate IP
4. Retry after a few minutes

This CLI uses user-provided browser auth and publicly visible data. It does not bypass TikTok access controls.

## Roadmap

- Disk cache for repeated research runs
- Trend velocity + freshness scoring
