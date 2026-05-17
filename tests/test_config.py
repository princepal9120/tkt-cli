from pathlib import Path

from tkt_cli.config import TktConfig, clear_config, load_config, save_config


def test_config_roundtrip(tmp_path: Path):
    path = tmp_path / "config.json"
    save_config(TktConfig(ms_token="abc123", region="IN"), path)
    loaded = load_config(path)
    assert loaded.ms_token == "abc123"
    assert loaded.region == "IN"
    assert loaded.is_authenticated


def test_clear_config(tmp_path: Path):
    path = tmp_path / "config.json"
    save_config(TktConfig(ms_token="abc123"), path)
    clear_config(path)
    assert not path.exists()
