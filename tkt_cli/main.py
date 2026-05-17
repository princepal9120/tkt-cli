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

app = typer.Typer(help="TikTok trend discovery from your terminal.", no_args_is_help=True)
console = Console()


class OutputFormat(str, Enum):
    table = "table"
    json = "json"


class ExportKind(str, Enum):
    trending = "trending"
    hashtag = "hashtag"
    user = "user"
    search = "search"


class ExportFormat(str, Enum):
    json = "json"
    csv = "csv"


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
        console.print("[yellow]Not authenticated[/yellow]. Run `tkt login`.")


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
) -> None:
    """Fetch trending TikTok videos."""
    _run_and_render(lambda client, px: client.get_trending(region=region, count=count, proxy=px), output, proxy)


@app.command()
def hashtag(
    tag: str = typer.Argument(..., help="Hashtag without or with #."),
    count: int = typer.Option(20, "--count", "-n", min=1, max=200),
    output: OutputFormat = typer.Option(OutputFormat.table, "--format"),
    proxy: str | None = typer.Option(None, "--proxy"),
) -> None:
    """Fetch recent/top videos for a hashtag."""
    _run_and_render(lambda client, px: client.get_hashtag(tag, count=count, proxy=px), output, proxy)


@app.command()
def user(
    username: str = typer.Argument(..., help="TikTok username without or with @."),
    count: int = typer.Option(20, "--count", "-n", min=1, max=200),
    output: OutputFormat = typer.Option(OutputFormat.table, "--format"),
    proxy: str | None = typer.Option(None, "--proxy"),
) -> None:
    """Fetch videos for a TikTok user."""
    _run_and_render(lambda client, px: client.get_user(username, count=count, proxy=px), output, proxy)


@app.command("search")
def search_cmd(
    query: str = typer.Argument(..., help="Search query."),
    count: int = typer.Option(20, "--count", "-n", min=1, max=200),
    output: OutputFormat = typer.Option(OutputFormat.table, "--format"),
    proxy: str | None = typer.Option(None, "--proxy"),
) -> None:
    """Search TikTok videos."""
    _run_and_render(lambda client, px: client.search(query, count=count, proxy=px), output, proxy)


@app.command()
def export(
    kind: ExportKind = typer.Argument(..., help="One of: trending, hashtag, user, search."),
    value: str | None = typer.Argument(None, help="Tag, username, or query. Not needed for trending."),
    out: Path = typer.Option(..., "--out", "-o", help="Output file path."),
    count: int = typer.Option(50, "--count", "-n", min=1, max=500),
    region: str | None = typer.Option(None, "--region"),
    export_format: ExportFormat = typer.Option(ExportFormat.json, "--format"),
    proxy: str | None = typer.Option(None, "--proxy"),
) -> None:
    """Export TikTok trend data to JSON or CSV."""
    async def fetch(client: TikTokTrendClient, px: str | None) -> list[VideoResult]:
        if kind == ExportKind.trending:
            return await client.get_trending(region=region, count=count, proxy=px)
        if not value:
            raise typer.BadParameter("value is required for hashtag, user, and search exports")
        if kind == ExportKind.hashtag:
            return await client.get_hashtag(value, count=count, proxy=px)
        if kind == ExportKind.user:
            return await client.get_user(value, count=count, proxy=px)
        return await client.search(value, count=count, proxy=px)

    results = _run(fetch, proxy)
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


def _run(fetcher: Callable[[TikTokTrendClient, str | None], object], proxy: str | None) -> list[VideoResult]:
    try:
        result = asyncio.run(fetcher(_client(), _resolve_proxy(proxy)))
        return result  # type: ignore[return-value]
    except TikTokBlockedError as exc:
        console.print(f"[red]{exc}[/red]")
        raise typer.Exit(2) from exc
    except RuntimeError as exc:
        console.print(f"[red]{exc}[/red]")
        raise typer.Exit(1) from exc


def _run_and_render(fetcher: Callable[[TikTokTrendClient, str | None], object], output: OutputFormat, proxy: str | None) -> None:
    results = _run(fetcher, proxy)
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


def _fmt(value: int | None) -> str:
    if value is None:
        return ""
    return f"{value:,}"


def _clip(value: str, length: int) -> str:
    return value if len(value) <= length else value[: length - 1] + "…"


if __name__ == "__main__":
    app()
