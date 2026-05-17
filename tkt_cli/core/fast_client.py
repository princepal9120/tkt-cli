from __future__ import annotations

import json
import re
from html import unescape
from typing import Any
from urllib.parse import quote_plus

import httpx

from .client import VideoResult, normalize_video

DEFAULT_HEADERS = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
    "accept-language": "en-US,en;q=0.9",
}

SCRIPT_PATTERNS = [
    re.compile(r'<script[^>]+id="SIGI_STATE"[^>]*>(.*?)</script>', re.S),
    re.compile(r'<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)</script>', re.S),
]


class FastTikTokClient:
    """Fast public TikTok reader using static HTML hydration data.

    This avoids Playwright startup and login when TikTok exposes enough public page
    data. It is intentionally best-effort and should fall back to TikTokApi when
    TikTok serves an empty shell or challenge page.
    """

    def __init__(self, timeout: float = 12.0) -> None:
        self.timeout = timeout

    async def get_hashtag(self, tag: str, count: int = 20, proxy: str | None = None) -> list[VideoResult]:
        tag = tag.lstrip("#")
        return await self._fetch_videos(f"https://www.tiktok.com/tag/{quote_plus(tag)}", count, proxy)

    async def get_user(self, username: str, count: int = 20, proxy: str | None = None) -> list[VideoResult]:
        username = username.lstrip("@")
        return await self._fetch_videos(f"https://www.tiktok.com/@{quote_plus(username)}", count, proxy)

    async def search(self, query: str, count: int = 20, proxy: str | None = None) -> list[VideoResult]:
        return await self._fetch_videos(f"https://www.tiktok.com/search/video?q={quote_plus(query)}", count, proxy)

    async def get_trending(self, region: str | None = None, count: int = 20, proxy: str | None = None) -> list[VideoResult]:
        url = "https://www.tiktok.com/foryou"
        if region:
            url += f"?region={quote_plus(region)}"
        return await self._fetch_videos(url, count, proxy)

    async def _fetch_videos(self, url: str, count: int, proxy: str | None) -> list[VideoResult]:
        async with httpx.AsyncClient(headers=DEFAULT_HEADERS, timeout=self.timeout, proxy=proxy, follow_redirects=True) as client:
            response = await client.get(url)
            response.raise_for_status()
        payloads = extract_hydration_json(response.text)
        videos: list[VideoResult] = []
        seen: set[str] = set()
        for payload in payloads:
            for raw in iter_video_dicts(payload):
                item = normalize_video(raw)
                key = item.id or item.url or item.desc or json.dumps(raw, sort_keys=True)[:120]
                if key in seen:
                    continue
                seen.add(key)
                videos.append(item)
                if len(videos) >= count:
                    return videos
        if not videos:
            raise RuntimeError("Fast guest fetch found no public TikTok hydration data. Retry with --mode browser, `tkt login`, or a proxy.")
        return videos


def extract_hydration_json(html: str) -> list[Any]:
    payloads: list[Any] = []
    for pattern in SCRIPT_PATTERNS:
        for match in pattern.finditer(html):
            text = unescape(match.group(1)).strip()
            if not text:
                continue
            try:
                payloads.append(json.loads(text))
            except json.JSONDecodeError:
                continue
    return payloads


def iter_video_dicts(value: Any):
    if isinstance(value, dict):
        if looks_like_video(value):
            yield value
        for child in value.values():
            yield from iter_video_dicts(child)
    elif isinstance(value, list):
        for child in value:
            yield from iter_video_dicts(child)


def looks_like_video(value: dict[str, Any]) -> bool:
    has_id = bool(value.get("id") or value.get("aweme_id"))
    has_text = bool(value.get("desc") or value.get("title"))
    has_stats = isinstance(value.get("stats"), dict) or isinstance(value.get("statsV2"), dict)
    has_author = isinstance(value.get("author"), dict)
    return has_id and (has_text or has_stats or has_author)
