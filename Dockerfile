FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 \
    libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 \
    libx11-xcb1 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 xdg-utils \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md ./
COPY tkt_cli ./tkt_cli
RUN pip install --no-cache-dir . && playwright install chromium

ENTRYPOINT ["tkt"]
CMD ["--help"]
