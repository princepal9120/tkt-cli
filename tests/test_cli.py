from typer.testing import CliRunner

from tkt_cli.main import app, render_table
from tkt_cli.core.client import VideoResult

runner = CliRunner()


def test_help_works():
    result = runner.invoke(app, ["--help"])
    assert result.exit_code == 0
    assert "TikTok trend discovery" in result.output


def test_status_without_config(monkeypatch, tmp_path):
    import tkt_cli.config as config
    import tkt_cli.main as main

    path = tmp_path / "config.json"
    monkeypatch.setattr(config, "CONFIG_PATH", path)
    monkeypatch.setattr(main, "load_config", lambda: config.load_config(path))
    result = runner.invoke(app, ["status"])
    assert result.exit_code == 0
    assert "Guest mode" in result.output


def test_render_table_smoke():
    render_table([
        VideoResult(
            id="1",
            desc="hello world",
            author="creator",
            create_time=None,
            play_count=1000,
            like_count=100,
            comment_count=10,
            share_count=2,
            url="https://example.com",
            raw={},
        )
    ])


def test_market_command_json(monkeypatch):
    import tkt_cli.main as main

    monkeypatch.setattr(
        main,
        "_run",
        lambda fetcher, proxy, mode: [
            VideoResult(
                id="1",
                desc="How to automate content marketing for indie founders #saas",
                author="creator",
                create_time=None,
                play_count=1000,
                like_count=120,
                comment_count=15,
                share_count=5,
                url="https://example.com",
                raw={},
            )
        ],
    )

    result = runner.invoke(app, ["market", "ai marketing", "--format", "json"])

    assert result.exit_code == 0
    assert '"query": "ai marketing"' in result.output
    assert '"opportunity_score"' in result.output
