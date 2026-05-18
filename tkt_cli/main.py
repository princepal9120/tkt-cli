from __future__ import annotations

import asyncio
import csv
import getpass
import json
from enum import Enum
from pathlib import Path
from typing import Callable

import typer
from rich.console import Console
from rich.table import Table

from . import __version__
from .config import TktConfig, clear_config, load_config, load_proxies, save_config
from .core.client import TikTokBlockedError, TikTokTrendClient, VideoResult
from .core.fast_client import FastTikTokClient
from .market import MarketInsight, analyze_market

app = typer.Typer(help="TikTok trend discovery from your terminal.", no_args_is_help=True)
console = Console()


class OutputFormat(str, Enum):
    table = "table"
    json = "json"


class FetchMode(str, Enum):
    auto = "auto"
    fast = "fast"
    browser = "browser"


class ExportKind(str, Enum):
    trending = "trending"
    hashtag = "hashtag"
    user = "user"
    search = "search"


class ExportFormat(str, Enum):
    json = "json"
    csv = "csv"


class MarketSource(str, Enum):
    search = "search"
    hashtag = "hashtag"
    trending = "trending"


def version_callback(value: bool) -> None:
    if value:
        console.print(f"tkt-cli {__version__}")
        raise typer.Exit()


@app.callback()
def callback(
    version: bool = typer.Option(False, "--version", callback=version_callback, is_eager=True, help="Show version."),
) -> None:
    return None


@app.command()
def login(
    ms_token: str | None = typer.Option(None, "--ms-token", help="TikTok ms_token cookie value. If omitted, you will be prompted."),
    region: str | None = typer.Option(None, "--region", help="Default region hint, for example IN or US."),
) -> None:
    """Store your TikTok browser ms_token in ~/.tkt/config.json."""
    console.print("Open TikTok in your browser, inspect cookies for tiktok.com, then copy the `ms_token` value.")
    token = ms_token or getpass.getpass("Paste ms_token: ").strip()
    if not token:
        raise typer.BadParameter("ms_token cannot be empty")
    save_config(TktConfig(ms_token=token, region=region))
    console.print("[green]Saved TikTok session token to ~/.tkt/config.json[/green]")


@app.command()
def status() -> None:
    """Show whether tkt is authenticated."""
    config = load_config()
    if config.is_authenticated:
        suffix = config.ms_token[-6:] if config.ms_token else ""
        console.print(f"[green]Authenticated[/green] ms_token=***{suffix}")
        if config.region:
            console.print(f"Default region: {config.region}")
    else:
        console.print("[yellow]Guest mode[/yellow]. Public TikTok requests will be attempted without login.")
        console.print("Run `tkt login` only if TikTok blocks guest requests or you need better reliability.")


@app.command()
def logout() -> None:
    """Remove stored TikTok auth config."""
    clear_config()
    console.print("[green]Logged out. Removed ~/.tkt/config.json[/green]")


@app.command()
def trending(
    region: str | None = typer.Option(None, "--region", help="Region hint, for example IN or US."),
    count: int = typer.Option(20, "--count", "-n", min=1, max=200),
    output: OutputFormat = typer.Option(OutputFormat.table, "--format", help="Output format."),
    proxy: str | None = typer.Option(None, "--proxy", help="Proxy URL. If omitted, first ~/.tkt/proxies.txt entry is used when present."),
    mode: FetchMode = typer.Option(FetchMode.auto, "--mode", help="auto tries fast static fetch first, then browser fallback."),
) -> None:
    """Fetch trending TikTok videos."""
    _run_and_render(lambda client, px: client.get_trending(region=region, count=count, proxy=px), output, proxy, mode)


@app.command()
def hashtag(
    tag: str = typer.Argument(..., help="Hashtag without or with #."),
    count: int = typer.Option(20, "--count", "-n", min=1, max=200),
    output: OutputFormat = typer.Option(OutputFormat.table, "--format"),
    proxy: str | None = typer.Option(None, "--proxy"),
    mode: FetchMode = typer.Option(FetchMode.auto, "--mode"),
) -> None:
    """Fetch recent/top videos for a hashtag."""
    _run_and_render(lambda client, px: client.get_hashtag(tag, count=count, proxy=px), output, proxy, mode)


@app.command()
def user(
    username: str = typer.Argument(..., help="TikTok username without or with @."),
    count: int = typer.Option(20, "--count", "-n", min=1, max=200),
    output: OutputFormat = typer.Option(OutputFormat.table, "--format"),
    proxy: str | None = typer.Option(None, "--proxy"),
    mode: FetchMode = typer.Option(FetchMode.auto, "--mode"),
) -> None:
    """Fetch videos for a TikTok user."""
    _run_and_render(lambda client, px: client.get_user(username, count=count, proxy=px), output, proxy, mode)


@app.command("search")
def search_cmd(
    query: str = typer.Argument(..., help="Search query."),
    count: int = typer.Option(20, "--count", "-n", min=1, max=200),
    output: OutputFormat = typer.Option(OutputFormat.table, "--format"),
    proxy: str | None = typer.Option(None, "--proxy"),
    mode: FetchMode = typer.Option(FetchMode.auto, "--mode"),
) -> None:
    """Search TikTok videos."""
    _run_and_render(lambda client, px: client.search(query, count=count, proxy=px), output, proxy, mode)


@app.command()
def export(
    kind: ExportKind = typer.Argument(..., help="One of: trending, hashtag, user, search."),
    value: str | None = typer.Argument(None, help="Tag, username, or query. Not needed for trending."),
    out: Path = typer.Option(..., "--out", "-o", help="Output file path."),
    count: int = typer.Option(50, "--count", "-n", min=1, max=500),
    region: str | None = typer.Option(None, "--region"),
    export_format: ExportFormat = typer.Option(ExportFormat.json, "--format"),
    proxy: str | None = typer.Option(None, "--proxy"),
    mode: FetchMode = typer.Option(FetchMode.auto, "--mode"),
) -> None:
    """Export TikTok trend data to JSON or CSV."""
    async def fetch(client: TikTokTrendClient | FastTikTokClient, px: str | None) -> list[VideoResult]:
        if kind == ExportKind.trending:
            return await client.get_trending(region=region, count=count, proxy=px)
        if not value:
            raise typer.BadParameter("value is required for hashtag, user, and search exports")
        if kind == ExportKind.hashtag:
            return await client.get_hashtag(value, count=count, proxy=px)
        if kind == ExportKind.user:
            return await client.get_user(value, count=count, proxy=px)
        return await client.search(value, count=count, proxy=px)

    results = _run(fetch, proxy, mode)
    out.parent.mkdir(parents=True, exist_ok=True)
    rows = [item.to_dict() for item in results]
    if export_format == ExportFormat.json:
        out.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n")
    else:
        fieldnames = ["id", "desc", "author", "create_time", "play_count", "like_count", "comment_count", "share_count", "url"]
        with out.open("w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for row in rows:
                writer.writerow({key: row.get(key) for key in fieldnames})
    console.print(f"[green]Exported {len(rows)} rows to {out}[/green]")


@app.command()
def market(
    query: str = typer.Argument(..., help="Niche, product category, or customer pain to analyze."),
    source: MarketSource = typer.Option(MarketSource.search, "--source", help="Research source: search, hashtag, or trending."),
    count: int = typer.Option(30, "--count", "-n", min=5, max=200),
    region: str | None = typer.Option(None, "--region", help="Region hint for trending source, for example IN or US."),
    output: OutputFormat = typer.Option(OutputFormat.table, "--format"),
    proxy: str | None = typer.Option(None, "--proxy"),
    mode: FetchMode = typer.Option(FetchMode.auto, "--mode"),
) -> None:
    """Analyze TikTok trends and turn them into indie-hacker marketing actions."""
    async def fetch(client: TikTokTrendClient | FastTikTokClient, px: str | None) -> list[VideoResult]:
        if source == MarketSource.hashtag:
            return await client.get_hashtag(query, count=count, proxy=px)
        if source == MarketSource.trending:
            return await client.get_trending(region=region, count=count, proxy=px)
        return await client.search(query, count=count, proxy=px)

    results = _run(fetch, proxy, mode)
    insight = analyze_market(results, query=query, source=source.value)
    if output == OutputFormat.json:
        console.print_json(json.dumps(insight.to_dict(), ensure_ascii=False))
    else:
        render_market(insight)


def _resolve_proxy(proxy: str | None) -> str | None:
    if proxy:
        return proxy
    proxies = load_proxies()
    if proxies:
        console.print("[yellow]Using first proxy from ~/.tkt/proxies.txt[/yellow]")
        return proxies[0]
    return None


def _client() -> TikTokTrendClient:
    config = load_config()
    return TikTokTrendClient(ms_token=config.ms_token)


def _run(fetcher: Callable[[TikTokTrendClient | FastTikTokClient, str | None], object], proxy: str | None, mode: FetchMode) -> list[VideoResult]:
    async def run_fetch() -> list[VideoResult]:
        resolved_proxy = _resolve_proxy(proxy)
        if mode == FetchMode.fast:
            return await fetcher(FastTikTokClient(), resolved_proxy)  # type: ignore[return-value]
        if mode == FetchMode.browser:
            return await fetcher(_client(), resolved_proxy)  # type: ignore[return-value]
        try:
            return await fetcher(FastTikTokClient(), resolved_proxy)  # type: ignore[return-value]
        except Exception as fast_error:  # noqa: BLE001
            console.print(f"[yellow]Fast mode missed: {fast_error}[/yellow]")
            console.print("[yellow]Falling back to browser mode.[/yellow]")
            return await fetcher(_client(), resolved_proxy)  # type: ignore[return-value]

    try:
        return asyncio.run(run_fetch())
    except TikTokBlockedError as exc:
        console.print(f"[red]{exc}[/red]")
        raise typer.Exit(2) from exc
    except Exception as exc:  # noqa: BLE001
        console.print(f"[red]{exc}[/red]")
        raise typer.Exit(1) from exc


def _run_and_render(fetcher: Callable[[TikTokTrendClient | FastTikTokClient, str | None], object], output: OutputFormat, proxy: str | None, mode: FetchMode) -> None:
    results = _run(fetcher, proxy, mode)
    if output == OutputFormat.json:
        console.print_json(json.dumps([item.to_dict() for item in results], ensure_ascii=False))
    else:
        render_table(results)


def render_table(results: list[VideoResult]) -> None:
    table = Table(title="TikTok trends")
    table.add_column("#", justify="right")
    table.add_column("Author")
    table.add_column("Views", justify="right")
    table.add_column("Likes", justify="right")
    table.add_column("Comments", justify="right")
    table.add_column("Description")
    table.add_column("URL")
    for idx, item in enumerate(results, start=1):
        table.add_row(
            str(idx),
            item.author or "",
            _fmt(item.play_count),
            _fmt(item.like_count),
            _fmt(item.comment_count),
            _clip(item.desc or "", 80),
            item.url or "",
        )
    console.print(table)


def render_market(insight: MarketInsight) -> None:
    summary = Table(title=f"Market intelligence: {insight.query}", show_header=False)
    summary.add_column("Metric", style="bold")
    summary.add_column("Value")
    summary.add_row("Source", insight.source)
    summary.add_row("Videos analyzed", str(insight.videos_analyzed))
    summary.add_row("Total views", _fmt(insight.total_views))
    summary.add_row("Median views", _fmt(insight.median_views))
    summary.add_row("Median engagement", f"{insight.median_engagement_rate:.2%}")
    summary.add_row("Opportunity score", f"{insight.opportunity_score}/100")
    summary.add_row("Decision", insight.decision)
    console.print(summary)

    signals = Table(title="Signals")
    signals.add_column("Keywords")
    signals.add_column("Hashtags")
    signals.add_column("Hooks")
    for idx in range(max(len(insight.top_keywords), len(insight.top_hashtags), len(insight.hook_formats), 1)):
        keyword = _pair(insight.top_keywords, idx)
        hashtag = _pair(insight.top_hashtags, idx, prefix="#")
        hook = _pair(insight.hook_formats, idx)
        signals.add_row(keyword, hashtag, hook)
    console.print(signals)

    _render_list("Content angles", insight.content_angles)
    _render_list("Product opportunities", insight.product_opportunities)
    _render_list("Validation plan", insight.validation_plan)


def _render_list(title: str, rows: list[str]) -> None:
    table = Table(title=title, show_header=False)
    table.add_column("#", justify="right")
    table.add_column("Action")
    for idx, row in enumerate(rows, start=1):
        table.add_row(str(idx), row)
    console.print(table)


def _pair(rows: list[tuple[str, int]], idx: int, prefix: str = "") -> str:
    if idx >= len(rows):
        return ""
    label, count = rows[idx]
    return f"{prefix}{label} ({count})"


def _fmt(value: int | None) -> str:
    if value is None:
        return ""
    return f"{value:,}"


def _clip(value: str, length: int) -> str:
    return value if len(value) <= length else value[: length - 1] + "…"


if __name__ == "__main__":
    app()
