from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

APP_DIR = Path(os.environ.get("TKT_HOME", Path.home() / ".tkt")).expanduser()
CONFIG_PATH = APP_DIR / "config.json"
PROXIES_PATH = APP_DIR / "proxies.txt"


@dataclass(slots=True)
class TktConfig:
    ms_token: str | None = None
    region: str | None = None

    @property
    def is_authenticated(self) -> bool:
        return bool(self.ms_token)


def ensure_app_dir() -> Path:
    APP_DIR.mkdir(parents=True, exist_ok=True)
    return APP_DIR


def load_config(path: Path = CONFIG_PATH) -> TktConfig:
    if not path.exists():
        return TktConfig()
    try:
        raw: dict[str, Any] = json.loads(path.read_text())
    except json.JSONDecodeError:
        return TktConfig()
    return TktConfig(ms_token=raw.get("ms_token"), region=raw.get("region"))


def save_config(config: TktConfig, path: Path = CONFIG_PATH) -> None:
    ensure_app_dir()
    data = {"ms_token": config.ms_token, "region": config.region}
    path.write_text(json.dumps(data, indent=2) + "\n")
    try:
        path.chmod(0o600)
    except OSError:
        pass


def clear_config(path: Path = CONFIG_PATH) -> None:
    if path.exists():
        path.unlink()


def load_proxies(path: Path = PROXIES_PATH) -> list[str]:
    if not path.exists():
        return []
    return [line.strip() for line in path.read_text().splitlines() if line.strip() and not line.startswith("#")]
