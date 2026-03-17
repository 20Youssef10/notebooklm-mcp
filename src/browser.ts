import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PlaywrightCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
}

export interface StorageState {
  cookies: PlaywrightCookie[];
  origins: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Decode the base64-encoded JSON storage state from the env var. */
export function loadStorageState(): StorageState {
  const raw = process.env.NOTEBOOKLM_STORAGE_STATE;
  if (!raw) {
    throw new Error(
      "Missing env var: NOTEBOOKLM_STORAGE_STATE\n" +
        "Run `npm run get-cookies` to extract your Google session cookies."
    );
  }
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf-8")) as StorageState;
  } catch {
    throw new Error(
      "Invalid NOTEBOOKLM_STORAGE_STATE value. Make sure it is valid base64-encoded JSON."
    );
  }
}

/** Build the Browserless.io WebSocket endpoint URL. */
function buildWsEndpoint(): string {
  const token = process.env.BROWSERLESS_TOKEN;
  if (!token) throw new Error("Missing env var: BROWSERLESS_TOKEN");

  const region = process.env.BROWSERLESS_REGION ?? "sfo";
  // stealth=true helps avoid Google bot-detection
  return `wss://production-${region}.browserless.io?token=${token}&stealth=true&blockAds=true`;
}

// ─── Core browser utility ─────────────────────────────────────────────────────

/**
 * Opens a Browserless.io browser session pre-loaded with the stored Google
 * cookies, runs `fn` with a ready-to-use Page, and then cleans up.
 *
 * Usage:
 *   const result = await withPage(async (page) => { ... return value; });
 */
export async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  const storageState = loadStorageState();
  const wsEndpoint = buildWsEndpoint();

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  try {
    browser = await chromium.connectOverCDP(wsEndpoint);

    context = await browser.newContext({
      storageState,
      viewport: { width: 1280, height: 900 },
      // Realistic desktop UA to avoid bot detection
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/124.0.0.0 Safari/537.36",
      locale: "en-US",
      timezoneId: "America/New_York",
      // Faster navigation – skip media that NotebookLM doesn't need
      javaScriptEnabled: true,
    });

    const page = await context.newPage();

    // Abort heavy media to speed up page loads
    await page.route("**/*.{mp4,webm,ogg,mp3,wav,flac,woff2,ttf,eot}", (route) =>
      route.abort()
    );

    return await fn(page);
  } finally {
    if (context) await context.close().catch(() => undefined);
    if (browser) await browser.close().catch(() => undefined);
  }
}

// ─── Auth guard ───────────────────────────────────────────────────────────────

/**
 * Navigate to a URL and check we are NOT redirected to a Google login page.
 * Throws a descriptive error if the session has expired.
 */
export async function guardAuth(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

  const current = page.url();
  if (
    current.includes("accounts.google.com") ||
    current.includes("signin") ||
    current.includes("login")
  ) {
    throw new Error(
      "NotebookLM session has expired. Run `npm run get-cookies` again " +
        "and update NOTEBOOKLM_STORAGE_STATE in your Vercel environment variables."
    );
  }
}
