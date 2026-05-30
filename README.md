# tkt-cli

TikTok in your terminal — browse feeds, search, and analyze trends. Built with [Bun](https://bun.sh) for single-binary distribution.

Follows the same philosophy as `rdt-cli`, `twitter-cli`, and similar public CLIs:
- one obvious binary: `tkt`
- guest mode first — most commands work without login
- structured exports for agents and automations
- table output for humans, `--json` for pipelines
- thin adapter around TikTok's web API with Chrome fingerprint + jitter

## Install

### Download binary (no runtime needed)

```bash
# macOS Apple Silicon
curl -Lo tkt https://github.com/princepal9120/tkt-cli/releases/latest/download/tkt-darwin-arm64
chmod +x tkt && sudo mv tkt /usr/local/bin/

# macOS Intel
curl -Lo tkt https://github.com/yourname/tkt-cli/releases/latest/download/tkt-darwin-x64
chmod +x tkt && sudo mv tkt /usr/local/bin/

# Linux x64
curl -Lo tkt https://github.com/yourname/tkt-cli/releases/latest/download/tkt-linux-x64
chmod +x tkt && sudo mv tkt /usr/local/bin/
```

### From source (requires [Bun](https://bun.sh))

```bash
git clone https://github.com/yourname/tkt-cli
cd tkt-cli
bun install
bun run dev -- --help        # run without compiling
bun run build                # compile → ./tkt binary
```

## Auth

Most commands work in guest mode. Login for feed, like, and save.

```bash
tkt login                    # auto-extract cookies from Chrome/Firefox
tkt login --ms-token <val>   # or paste ms_token manually
tkt status                   # check auth state
tkt whoami                   # show your profile
tkt logout
```

## Browse

```bash
tkt trending                          # For You trending (US)
tkt trending --region IN -n 30        # 30 trending in India
tkt hashtag fyp                       # videos for #fyp
tkt hashtag "buildinpublic" -n 50
tkt user mrbeast                      # profile + latest videos
tkt user-videos charlidamelio -n 20   # videos only
tkt feed                              # your For You feed (requires login)
tkt feed --following                  # following feed
```

## Search

```bash
tkt search "cooking tips"
tkt search "ai tools" -n 30 --json
```

## View & Interact

After any listing command, use the row index (`#`) instead of a full video ID:

```bash
tkt trending
tkt show 3                    # details + comments for result #3
tkt open 3                    # open result #3 in browser
tkt like 3                    # like result #3 (requires login)
tkt save 3                    # save to favorites (requires login)
```

Or pass a video ID or URL directly:

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

Output: opportunity score, decision (build / validate / watchlist / ignore), top keywords, hashtags, hook formats, content angles, product opportunities, and a 4-step validation plan.

## Output format

All commands support `--json` for structured output:

```bash
tkt trending --json
tkt search "fitness" --json | jq '.data[].author'
```

Envelope schema:

```json
{
  "ok": true,
  "schema_version": "1.0",
  "data": [...]
}
```

## Build

```bash
bun run build              # compile for current platform → ./tkt
bun run build:all          # cross-compile mac-arm + mac-x64 + linux → dist/
```

## Roadmap

- `ig` / `--platform instagram` adapter — same CLI shape as `tkt market`, backed by Instaloader:
  ```bash
  tkt market "ai tools" --platform instagram --source hashtag
  tkt compare "ai tools" --platforms tiktok,instagram
  ig profile competitor --reels -n 30 --json
  ig market "buildinpublic" --source hashtag -n 50
  ```
- Disk cache for repeated research runs
- Trend velocity + freshness scoring
- Markdown report export

## Known limitations

TikTok changes its web internals often. If a command returns empty results, try:
1. `tkt login` — add your browser session cookies
2. Lower `-n` count
3. Retry after a few minutes (rate-limit jitter)

This CLI uses user-provided browser auth and publicly visible data only. It does not bypass TikTok restrictions.
