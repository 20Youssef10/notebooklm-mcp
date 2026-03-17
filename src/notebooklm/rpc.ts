/**
 * NotebookLM Auth
 * 1. Fetches notebooklm.google.com with stored cookies (plain HTTP, no browser)
 * 2. Extracts the XSRF token embedded in the page HTML
 * 3. Builds SAPISIDHASH for the Authorization header
 */
import { createHash } from "crypto";

export interface AuthTokens {
  cookieHeader: string;
  csrfToken:    string;   // XSRF token from page HTML (used as at= param)
  sapisidHash:  string;   // Authorization header value
  sessionId:    string;
}

// Cache per cold-start (invalidated if token fetch fails)
let cache: AuthTokens | null = null;

function buildSAPISIDHASH(sapisid: string, origin: string): string {
  const now = Math.floor(Date.now() / 1000);
  const hash = createHash("sha1")
    .update(`${now} ${sapisid} ${origin}`)
    .digest("hex");
  return `SAPISIDHASH ${now}_${hash}`;
}

async function fetchXsrfToken(cookieHeader: string): Promise<{ xsrf: string; sid: string }> {
  const origin = "https://notebooklm.google.com";

  const res = await fetch(origin, {
    method: "GET",
    headers: {
      Cookie: cookieHeader,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });

  const html = await res.text();

  // Google embeds the XSRF token in various ways — try all patterns
  const patterns = [
    /"SNlM0e":"([^"]+)"/,
    /SNlM0e":"([^"]+)"/,
    /"xsrf","([^"]+)"/,
    /"at":"([^"]+)"/,
    /\["xsrf","([^"]+)"/,
    /'SNlM0e':"([^"]+)"/,
  ];

  let xsrf = "";
  for (const pat of patterns) {
    const m = html.match(pat);
    if (m) { xsrf = m[1]; break; }
  }

  // Also try extracting from WIZ_global_data blob
  if (!xsrf) {
    const wizMatch = html.match(/WIZ_global_data\s*=\s*(\{.{0,2000}?\})\s*;/s);
    if (wizMatch) {
      const snlMatch = wizMatch[1].match(/"SNlM0e"\s*:\s*"([^"]+)"/);
      if (snlMatch) xsrf = snlMatch[1];
    }
  }

  // Extract f.sid (session ID used in batchexecute URL)
  const sidMatch = html.match(/"FdrFJe"\s*:\s*"([^"]+)"/) ||
                   html.match(/\["FdrFJe","([^"]+)"\]/);
  const sid = sidMatch ? sidMatch[1] : "";

  if (!xsrf) {
    // Log a snippet for debugging
    const snippet = html.slice(0, 3000);
    throw new Error(
      `Could not extract XSRF token from NotebookLM page.\n` +
      `HTTP status: ${res.status}\n` +
      `Page snippet (first 500 chars): ${snippet.slice(0, 500)}\n` +
      `This usually means the Google session has expired. Please refresh NOTEBOOKLM_STORAGE_STATE.`
    );
  }

  return { xsrf, sid };
}

export async function buildAuthTokens(forceRefresh = false): Promise<AuthTokens> {
  if (cache && !forceRefresh) return cache;

  const raw = process.env.NOTEBOOKLM_STORAGE_STATE;
  if (!raw) throw new Error("Missing env var: NOTEBOOKLM_STORAGE_STATE");

  const state = JSON.parse(Buffer.from(raw, "base64").toString("utf-8")) as {
    cookies: Array<{ name: string; value: string }>;
  };

  const cookieHeader = state.cookies.map((c) => `${c.name}=${c.value}`).join("; ");

  const sapisid =
    state.cookies.find((c) => c.name === "__Secure-3PAPISID")?.value ||
    state.cookies.find((c) => c.name === "SAPISID")?.value || "";

  if (!sapisid) throw new Error("SAPISID cookie not found. Please refresh your session.");

  const origin = "https://notebooklm.google.com";
  const sapisidHash = buildSAPISIDHASH(sapisid, origin);

  // Fetch XSRF token from the live page (plain HTTP)
  const { xsrf, sid } = await fetchXsrfToken(cookieHeader);

  cache = { cookieHeader, csrfToken: xsrf, sapisidHash, sessionId: sid };
  return cache;
}

export function invalidateCache(): void { cache = null; }
