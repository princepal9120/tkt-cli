# tkt-cli

`rdt-cli` style TikTok trend discovery from the terminal.

`tkt-cli` is intentionally transparent: it tries public guest access first. If TikTok blocks or rate-limits guest requests, you can optionally provide your own TikTok browser `ms_token`; the CLI stores it locally in `~/.tkt/config.json`, then uses `TikTokApi` + Playwright to fetch trending videos, hashtags, users, and search results.

## Public CLI method

`tkt-cli` follows the same practical pattern as small public CLIs like `rdt-cli`, `twitter-cli`, and BirdCrawl-style tools:

- one obvious binary: `tkt`
- terminal-first workflows before dashboards
- guest mode first, local browser-cookie auth only when needed
- structured exports for agents and automations
- table output for humans, JSON/CSV output for pipelines
- thin adapters around unstable platform APIs
- explicit warnings when platforms block or return empty data

The goal is not to bypass TikTok. The goal is to make legitimate trend research faster and scriptable.

## Install locally

```bash
cd tkt-cli
python -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
playwright install chromium
```

## Guest mode and optional auth

You can try public TikTok data without logging in:

```bash
tkt trending --region IN --count 20
tkt hashtag aitools --count 50
tkt search "ai agents"
```

If TikTok returns empty responses or blocks guest sessions, add your own browser token:

1. Open TikTok in your browser.
2. Inspect cookies for `tiktok.com`.
3. Copy the `ms_token` value.
4. Run:

```bash
tkt login
```

Check status:

```bash
tkt status
```

Logout:

```bash
tkt logout
```

## Commands

```bash
tkt trending --region IN --count 20
tkt trending --region US --count 20 --format json

tkt hashtag aitools --count 50
tkt user mrbeast --count 20
tkt search "ai agents" --count 30

tkt export trending --out data/trending.json --format json --count 100
tkt export hashtag aitools --out data/aitools.csv --format csv --count 100
```

## Proxy support

Use one proxy directly:

```bash
tkt trending --proxy http://user:pass@host:port
```

Or create `~/.tkt/proxies.txt`; the CLI uses the first non-comment line when `--proxy` is not passed.

## Known limitations

TikTok changes its web internals often and may return empty responses when a guest session is rate-limited or blocked. If that happens, `tkt` prints a warning instead of silently failing. Try `tkt login`, a fresh `ms_token`, a proxy, or a lower request count.

This CLI does not bypass TikTok restrictions. It uses user-provided browser auth and public/session-visible data.

## Roadmap

- Trend scoring: velocity, engagement ratio, freshness, repeated hooks.
- Region-aware source tuning.
- `instagram` adapter with the same CLI shape.
- Markdown reports for content ideas.
