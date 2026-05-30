export const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

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
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const delay = Math.max(50, Math.round(baseMs + z * stddev));
  await Bun.sleep(delay);
}

// CRC32 lookup table
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of data) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// X-Bogus: reverse-engineered signing required by TikTok web API
// Without this most endpoints return empty itemList despite HTTP 200
const XB = "Dkdpgh4ZKNfvae18IfublwjxROmg";

export function xBogus(queryString: string, userAgent: string = UA): string {
  const enc = new TextEncoder();
  const uaCrc = crc32(enc.encode(userAgent));
  const qsCrc = crc32(enc.encode(queryString));
  const ts = Math.floor(Date.now() / 1000);

  const p = new Uint8Array(24);
  p[0] = 0x02; p[1] = 0x04; p[2] = 0x10; p[3] = 0x05;
  p[4] = 0x07;
  p[5] = (uaCrc >>> 24) & 0xff; p[6] = (uaCrc >>> 16) & 0xff;
  p[7] = (uaCrc >>> 8) & 0xff;  p[8] = uaCrc & 0xff;
  p[9]  = (qsCrc >>> 24) & 0xff; p[10] = (qsCrc >>> 16) & 0xff;
  p[11] = (qsCrc >>> 8) & 0xff;  p[12] = qsCrc & 0xff;
  p[13] = (ts >>> 24) & 0xff; p[14] = (ts >>> 16) & 0xff;
  p[15] = (ts >>> 8) & 0xff;  p[16] = ts & 0xff;

  const bodyCrc = crc32(p.slice(0, 17));
  p[17] = (bodyCrc >>> 24) & 0xff; p[18] = (bodyCrc >>> 16) & 0xff;
  p[19] = (bodyCrc >>> 8) & 0xff;  p[20] = bodyCrc & 0xff;

  // encode 21 bytes → base28 using XB alphabet (3 bytes → 4 chars)
  let out = "";
  for (let i = 0; i < 21; i += 3) {
    const b0 = p[i], b1 = p[i + 1], b2 = p[i + 2];
    out += XB[(b0 >> 2) & 0x1f];
    out += XB[((b0 & 0x03) << 3) | (b1 >> 5)];
    out += XB[b1 & 0x1f];
    out += XB[(b2 >> 3) & 0x1f];
  }
  return out;
}
