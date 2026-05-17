from __future__ import annotations

import asyncio
import random
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

try:  # TikTokApi changes exception paths between versions.
    from TikTokApi import TikTokApi
except Exception:  # pragma: no cover
    TikTokApi = None  # type: ignore[assignment]

try:
    from TikTokApi.exceptions import EmptyResponseException
except Exception:  # pragma: no cover
    class EmptyResponseException(Exception):
        pass


class TikTokBlockedError(RuntimeError):
    """Raised when TikTok returns an empty/blocked response."""


@dataclass(slots=True)
class VideoResult:
    id: str | None
    desc: str | None
    author: str | None
    create_time: int | None
    play_count: int | None
    like_count: int | None
    comment_count: int | None
    share_count: int | None
    url: str | None
    raw: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "desc": self.desc,
            "author": self.author,
            "create_time": self.create_time,
            "play_count": self.play_count,
            "like_count": self.like_count,
            "comment_count": self.comment_count,
            "share_count": self.share_count,
            "url": self.url,
            "raw": self.raw,
        }


def normalize_video(raw: dict[str, Any]) -> VideoResult:
    stats = raw.get("stats") or raw.get("statsV2") or {}
    author = raw.get("author") or {}
    author_name = author.get("uniqueId") or author.get("nickname") if isinstance(author, dict) else None
    video_id = str(raw.get("id") or raw.get("aweme_id") or "") or None
    url = raw.get("webVideoUrl") or raw.get("url")
    if not url and author_name and video_id:
        url = f"https://www.tiktok.com/@{author_name}/video/{video_id}"
    return VideoResult(
        id=video_id,
        desc=raw.get("desc") or raw.get("title"),
        author=author_name,
        create_time=raw.get("createTime") or raw.get("create_time"),
        play_count=_int(stats.get("playCount") or stats.get("play_count")),
        like_count=_int(stats.get("diggCount") or stats.get("likeCount") or stats.get("digg_count")),
        comment_count=_int(stats.get("commentCount") or stats.get("comment_count")),
        share_count=_int(stats.get("shareCount") or stats.get("share_count")),
        url=url,
        raw=raw,
    )


def _int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


class TikTokTrendClient:
    def __init__(self, ms_token: str | None, retries: int = 3, base_delay: float = 1.0) -> None:
        self.ms_token = ms_token
        self.retries = retries
        self.base_delay = base_delay

    async def _with_api(self, proxy: str | None, fn: Callable[[Any], Awaitable[list[dict[str, Any]]]]) -> list[VideoResult]:
        if TikTokApi is None:
            raise RuntimeError("TikTokApi is not installed. Run `pip install -e .[dev]` or install tkt-cli dependencies.")
        async def call() -> list[dict[str, Any]]:
            async with TikTokApi() as api:  # type: ignore[misc]
                session_kwargs: dict[str, Any] = {"num_sessions": 1, "sleep_after": 3}
                if self.ms_token:
                    session_kwargs["ms_tokens"] = [self.ms_token]
                if proxy:
                    session_kwargs["proxy"] = proxy
                await api.create_sessions(**session_kwargs)
                return await fn(api)

        rows = await self._retry(call)
        return [normalize_video(row) for row in rows]

    async def _retry(self, fn: Callable[[], Awaitable[list[dict[str, Any]]]]) -> list[dict[str, Any]]:
        last_error: Exception | None = None
        for attempt in range(1, self.retries + 1):
            try:
                return await fn()
            except EmptyResponseException as exc:
                raise TikTokBlockedError("TikTok returned an empty response. Guest mode may be blocked. Try `tkt login` with ms_token, a fresh token, or a proxy.") from exc
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                if attempt >= self.retries:
                    break
                delay = self.base_delay * (2 ** (attempt - 1)) + random.uniform(0, 0.3)
                await asyncio.sleep(delay)
        raise RuntimeError(f"TikTok request failed after {self.retries} attempts: {last_error}") from last_error

    async def get_trending(self, region: str | None = None, count: int = 20, proxy: str | None = None) -> list[VideoResult]:
        async def fetch(api: Any) -> list[dict[str, Any]]:
            videos = []
            trending = api.trending.videos(count=count) if hasattr(api, "trending") else api.video.trending(count=count)
            async for video in trending:
                data = video.as_dict if hasattr(video, "as_dict") else dict(video)
                if region:
                    data.setdefault("requested_region", region)
                videos.append(data)
            return videos
        return await self._with_api(proxy, fetch)

    async def get_hashtag(self, tag: str, count: int = 20, proxy: str | None = None) -> list[VideoResult]:
        tag = tag.lstrip("#")
        async def fetch(api: Any) -> list[dict[str, Any]]:
            videos = []
            async for video in api.hashtag(name=tag).videos(count=count):
                videos.append(video.as_dict if hasattr(video, "as_dict") else dict(video))
            return videos
        return await self._with_api(proxy, fetch)

    async def get_user(self, username: str, count: int = 20, proxy: str | None = None) -> list[VideoResult]:
        username = username.lstrip("@")
        async def fetch(api: Any) -> list[dict[str, Any]]:
            videos = []
            async for video in api.user(username=username).videos(count=count):
                videos.append(video.as_dict if hasattr(video, "as_dict") else dict(video))
            return videos
        return await self._with_api(proxy, fetch)

    async def search(self, query: str, count: int = 20, proxy: str | None = None) -> list[VideoResult]:
        async def fetch(api: Any) -> list[dict[str, Any]]:
            videos = []
            search_obj = api.search.videos(query, count=count)
            async for video in search_obj:
                videos.append(video.as_dict if hasattr(video, "as_dict") else dict(video))
            return videos
        return await self._with_api(proxy, fetch)
