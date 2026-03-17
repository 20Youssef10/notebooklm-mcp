/**
 * Browser utility — used ONLY to extract the CSRF token from NotebookLM
 * on cold start. All actual API operations use direct HTTP (src/rpc.ts).
 */
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

export interface StorageState {
  cookies: Array<{
    name: string; value: string; domain: string; path: string;
    expires: number; httpOnly: boolean; secure: boolean;
    sameSite: "Strict" | "Lax" | "None";
  }>;
  origins: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>;
}

export function loadStorageState(): StorageState {
  const raw = process.env.NOTEBOOKLM_STORAGE_STATE;
  if (!raw) throw new Error("Missing env var: NOTEBOOKLM_STORAGE_STATE");
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf-8")) as StorageState;
  } catch {
    throw new Error("Invalid NOTEBOOKLM_STORAGE_STATE — must be base64-encoded JSON.");
  }
}

function buildWsEndpoint(): string {
  const token = process.env.BROWSERLESS_TOKEN;
  if (!token) throw new Error("Missing env var: BROWSERLESS_TOKEN");
  const region = process.env.BROWSERLESS_REGION ?? "sfo";
  return `wss://production-${region}.browserless.io?token=${token}&stealth=true&blockAds=true`;
}

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
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      locale: "en-US",
    });
    const page = await context.newPage();
    return await fn(page);
  } finally {
    if (context) await context.close().catch(() => undefined);
    if (browser) await browser.close().catch(() => undefined);
  }
}
