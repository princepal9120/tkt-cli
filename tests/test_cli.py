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
