// Chrome 133 consistent fingerprint for TikTok anti-bot bypass
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

export const CHROME_HEADERS: Record<string, string> = {
  "User-Agent": UA,
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "sec-ch-ua": '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  "Referer": "https://www.tiktok.com/",
  "Origin": "https://www.tiktok.com",
};

// Gaussian jitter: mean=baseMs, stddev=baseMs*0.3, min=50ms
export async function jitter(baseMs = 400): Promise<void> {
  const stddev = baseMs * 0.3;
  // Box-Muller
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const delay = Math.max(50, Math.round(baseMs + z * stddev));
  await Bun.sleep(delay);
}
