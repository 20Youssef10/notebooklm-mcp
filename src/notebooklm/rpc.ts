/**
 * NotebookLM Auth
 *
 * Key insight: Google batchexecute returns the required XSRF token in the
 * HTTP 400 error body when `at=` is wrong or missing.
 * We exploit this: send a probe request, extract the token from the error,
 * then cache it for all subsequent calls.
 *
 * Pattern: probe → parse xsrf from 400 → retry with real token ✅
 */
import { createHash } from "crypto";

export interface AuthTokens {
  cookieHeader: string;
  csrfToken:    string;  // XSRF token (at= param)
  sapisidHash:  string;  // Authorization header
  sessionId:    string;
}

let cache: AuthTokens | null = null;

// ─── SAPISIDHASH (Authorization header) ──────────────────────────────────────
function buildSAPISIDHASH(sapisid: string): string {
  const now = Math.floor(Date.now() / 1000);
  const hash = createHash("sha1")
    .update(`${now} ${sapisid} https://notebooklm.google.com`)
    .digest("hex");
  return `SAPISIDHASH ${now}_${hash}`;
}

// ─── Extract XSRF from a 400 error body ──────────────────────────────────────
function extractXsrfFromError(body: string): string | null {
  // Error body contains: ["xsrf","TOKEN_VALUE",...]
  const m = body.match(/"xsrf"\s*,\s*"([^"]+)"/);
  return m ? m[1] : null;
}

// ─── Extract XSRF from page HTML ─────────────────────────────────────────────
function extractXsrfFromHtml(html: string): string | null {
  const patterns = [
    /"SNlM0e":"([^"]+)"/,
    /SNlM0e":"([^"]+)"/,
    /'SNlM0e':"([^"]+)"/,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return m[1];
  }
  return null;
}

// ─── Extract f.sid from HTML ──────────────────────────────────────────────────
function extractSidFromHtml(html: string): string {
  const m = html.match(/"FdrFJe"\s*:\s*"([^"]+)"/) ||
            html.match(/\["FdrFJe","([^"]+)"\]/);
  return m ? m[1] : "";
}

// ─── Main: build auth tokens ──────────────────────────────────────────────────
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

  if (!sapisid) throw new Error("SAPISID cookie not found — session may have expired.");

  const sapisidHash = buildSAPISIDHASH(sapisid);
  const commonHeaders = {
    Cookie: cookieHeader,
    Authorization: sapisidHash,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
    "X-Goog-AuthUser": "0",
    Origin: "https://notebooklm.google.com",
    Referer: "https://notebooklm.google.com/",
  };

  // ── Step 1: Try to get XSRF + sid from the homepage HTML ─────────────────
  let xsrf = "";
  let sid  = "";

  try {
    const pageRes = await fetch("https://notebooklm.google.com", {
      headers: { ...commonHeaders, Accept: "text/html" },
      redirect: "follow",
    });
    const html = await pageRes.text();
    xsrf = extractXsrfFromHtml(html) ?? "";
    sid  = extractSidFromHtml(html);
  } catch {
    // Network error — fall through to probe method
  }

  // ── Step 2: If still no XSRF, send a probe batchexecute and read the 400 ──
  if (!xsrf) {
    const RPC_URL = new URL("https://notebooklm.google.com/_/LabsTailwindUi/data/batchexecute");
    RPC_URL.searchParams.set("rpcids", "wXbhsf");
    RPC_URL.searchParams.set("source-path", "/");
    RPC_URL.searchParams.set("bl", "boq_labs-tailwind-ui_20250101.00_p0");
    RPC_URL.searchParams.set("hl", "en");
    RPC_URL.searchParams.set("rt", "c");

    const freq = JSON.stringify([[["wXbhsf", JSON.stringify([null]), null, "generic"]]]);
    const body = `f.req=${encodeURIComponent(freq)}&at=PROBE&`;

    const probeRes = await fetch(RPC_URL.toString(), {
      method: "POST",
      headers: { ...commonHeaders, "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body,
    });

    const probeBody = await probeRes.text();

    // Extract XSRF from error body
    const probeXsrf = extractXsrfFromError(probeBody);
    if (probeXsrf) {
      xsrf = probeXsrf;
    } else {
      throw new Error(
        `Could not obtain XSRF token.\nProbe response (${probeRes.status}): ${probeBody.slice(0, 300)}\n` +
        "Session may have expired — please refresh NOTEBOOKLM_STORAGE_STATE."
      );
    }
  }

  cache = { cookieHeader, csrfToken: xsrf, sapisidHash, sessionId: sid };
  return cache;
}

/** Call after an unexpected 400 so the next call re-fetches the token */
export function invalidateCache(): void { cache = null; }
