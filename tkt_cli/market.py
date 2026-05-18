from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass
from typing import Any

from .core.client import VideoResult

TOKEN_RE = re.compile(r"[a-zA-Z][a-zA-Z0-9_']{2,}")
HASHTAG_RE = re.compile(r"#([\w]+)")

STOPWORDS = {
    "the", "and", "for", "you", "your", "this", "that", "with", "from", "are", "was", "were", "have", "has",
    "had", "but", "not", "all", "can", "just", "how", "what", "why", "when", "who", "will", "about", "into",
    "get", "got", "out", "new", "now", "our", "their", "they", "them", "his", "her", "she", "him", "its", "use",
    "using", "make", "made", "more", "most", "like", "follow", "viral", "tiktok", "video", "part", "day",
}

PAIN_WORDS = {
    "problem", "problems", "struggle", "struggling", "hard", "pain", "annoying", "waste", "slow", "manual",
    "boring", "expensive", "broken", "hate", "confusing", "overwhelmed", "stuck", "fail", "fails", "mistake",
    "mistakes", "avoid", "fix", "help", "need", "wish", "without", "instead",
}

BUYER_WORDS = {
    "tool", "tools", "app", "software", "saas", "template", "templates", "automation", "automate", "workflow",
    "system", "dashboard", "tracker", "crm", "notion", "spreadsheet", "ai", "agent", "agents", "business", "founder",
    "startup", "client", "sales", "marketing", "content", "creator", "customers", "leads", "revenue", "money",
}

HOOK_PATTERNS = [
    (re.compile(r"\b(stop|avoid|don't)\b", re.I), "contrarian warning"),
    (re.compile(r"\b(how to|here'?s how|tutorial)\b", re.I), "how-to tutorial"),
    (re.compile(r"\b(i built|building|built this|made this)\b", re.I), "build-in-public demo"),
    (re.compile(r"\b(secret|nobody|hidden|underrated)\b", re.I), "hidden insight"),
    (re.compile(r"\b(before|after|instead of)\b", re.I), "transformation"),
    (re.compile(r"\b(\d+x|\d+%|\$\d+|\d+ days?)\b", re.I), "specific result"),
]


@dataclass(slots=True)
class MarketInsight:
    query: str
    source: str
    videos_analyzed: int
    total_views: int
    median_views: int
    median_engagement_rate: float
    opportunity_score: int
    decision: str
    top_keywords: list[tuple[str, int]]
    top_hashtags: list[tuple[str, int]]
    hook_formats: list[tuple[str, int]]
    content_angles: list[str]
    product_opportunities: list[str]
    validation_plan: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {
            "query": self.query,
            "source": self.source,
            "videos_analyzed": self.videos_analyzed,
            "total_views": self.total_views,
            "median_views": self.median_views,
            "median_engagement_rate": round(self.median_engagement_rate, 4),
            "opportunity_score": self.opportunity_score,
            "decision": self.decision,
            "top_keywords": self.top_keywords,
            "top_hashtags": self.top_hashtags,
            "hook_formats": self.hook_formats,
            "content_angles": self.content_angles,
            "product_opportunities": self.product_opportunities,
            "validation_plan": self.validation_plan,
        }


def analyze_market(videos: list[VideoResult], query: str, source: str) -> MarketInsight:
    texts = [video.desc or "" for video in videos]
    views = [_safe_int(video.play_count) for video in videos]
    engagement_rates = [_engagement_rate(video) for video in videos if _safe_int(video.play_count) > 0]

    keyword_counts = Counter[str]()
    hashtag_counts = Counter[str]()
    hook_counts = Counter[str]()
    pain_hits = 0
    buyer_hits = 0

    for text in texts:
        lowered = text.lower()
        words = [token.lower().strip("'") for token in TOKEN_RE.findall(lowered)]
        keyword_counts.update(word for word in words if word not in STOPWORDS and not word.isdigit())
        hashtag_counts.update(tag.lower() for tag in HASHTAG_RE.findall(text))
        pain_hits += sum(1 for word in words if word in PAIN_WORDS)
        buyer_hits += sum(1 for word in words if word in BUYER_WORDS)
        for pattern, label in HOOK_PATTERNS:
            if pattern.search(text):
                hook_counts[label] += 1

    total_views = sum(views)
    median_views = _median_int(views)
    median_er = _median_float(engagement_rates)
    opportunity_score = _score(videos, median_views, median_er, pain_hits, buyer_hits, hook_counts)
    decision = _decision(opportunity_score)
    top_keywords = keyword_counts.most_common(10)
    top_hashtags = hashtag_counts.most_common(10)
    hook_formats = hook_counts.most_common(5)

    seed_terms = [word for word, _ in top_keywords[:5]] or [query]
    hooks = [label for label, _ in hook_formats[:3]] or ["how-to tutorial", "build-in-public demo"]

    return MarketInsight(
        query=query,
        source=source,
        videos_analyzed=len(videos),
        total_views=total_views,
        median_views=median_views,
        median_engagement_rate=median_er,
        opportunity_score=opportunity_score,
        decision=decision,
        top_keywords=top_keywords,
        top_hashtags=top_hashtags,
        hook_formats=hook_formats,
        content_angles=_content_angles(query, seed_terms, hooks),
        product_opportunities=_product_opportunities(query, seed_terms),
        validation_plan=_validation_plan(query),
    )


def _score(
    videos: list[VideoResult],
    median_views: int,
    median_engagement_rate: float,
    pain_hits: int,
    buyer_hits: int,
    hook_counts: Counter[str],
) -> int:
    if not videos:
        return 0
    volume = min(30, round(math.log10(max(median_views, 1)) * 8))
    engagement = min(25, round(median_engagement_rate * 450))
    pain = min(20, pain_hits * 3)
    buyer = min(15, buyer_hits * 2)
    repeatable_hooks = min(10, sum(hook_counts.values()) * 2)
    return max(0, min(100, volume + engagement + pain + buyer + repeatable_hooks))


def _decision(score: int) -> str:
    if score >= 75:
        return "Build or campaign now"
    if score >= 55:
        return "Create content and validate"
    if score >= 35:
        return "Watchlist and collect more signals"
    return "Ignore for now"


def _content_angles(query: str, terms: list[str], hooks: list[str]) -> list[str]:
    primary = terms[0] if terms else query
    secondary = terms[1] if len(terms) > 1 else "workflow"
    return [
        f"{hooks[0].title()}: show the painful old way to handle {primary}, then the faster product-led way.",
        f"Compare 3 ways creators or founders solve {query}, then position your product as the simplest one.",
        f"Turn a real {secondary} mistake into a short lesson, checklist, or before-after demo.",
        f"Make a teardown: what top videos get right about {query}, and what most builders miss.",
    ]


def _product_opportunities(query: str, terms: list[str]) -> list[str]:
    primary = terms[0] if terms else query
    secondary = terms[1] if len(terms) > 1 else "content"
    return [
        f"Lead magnet: free {primary} checklist or template that captures emails from the trend.",
        f"Micro-tool: one focused calculator, generator, or audit around {query}.",
        f"Productized workflow: turn repeated {secondary} pain into a paid dashboard or automation.",
    ]


def _validation_plan(query: str) -> list[str]:
    return [
        f"Post 3 TikToks testing different hooks for {query} within 48 hours.",
        "Reply to comments with a waitlist or demo link only after people ask for help.",
        "Track saves, comments, profile clicks, and waitlist joins. Ignore vanity views alone.",
        "If two posts cross 5 percent engagement or drive leads, build the smallest paid offer.",
    ]


def _engagement_rate(video: VideoResult) -> float:
    views = _safe_int(video.play_count)
    if views <= 0:
        return 0.0
    engagement = _safe_int(video.like_count) + _safe_int(video.comment_count) + _safe_int(video.share_count)
    return engagement / views


def _safe_int(value: int | None) -> int:
    return int(value or 0)


def _median_int(values: list[int]) -> int:
    if not values:
        return 0
    ordered = sorted(values)
    return int(ordered[len(ordered) // 2])


def _median_float(values: list[float]) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    return float(ordered[len(ordered) // 2])
