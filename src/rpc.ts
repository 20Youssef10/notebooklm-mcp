/**
 * Google NotebookLM Internal RPC Client
 *
 * Uses the same batchexecute protocol as notebooklm-py.
 * Playwright/Browserless is ONLY used to extract the initial CSRF token.
 * All actual operations use direct HTTP calls — faster & more reliable.
 *
 * Method IDs from: https://github.com/teng-lin/notebooklm-py/blob/main/docs/rpc-reference.md
 */

import { withPage } from "./browser";

const BASE_URL = "https://notebooklm.google.com";
const RPC_URL = "https://notebooklm.google.com/_/LabsTailwindUi/data/batchexecute";

// ─── RPC Method IDs (from notebooklm-py) ─────────────────────────────────────
export const RPC = {
  LIST_NOTEBOOKS:   "wXbhsf",
  CREATE_NOTEBOOK:  "YEiWtc",
  DELETE_NOTEBOOK:  "FMnFhe",
  GET_NOTEBOOK:     "RnFq6b",
  LIST_SOURCES:     "uvDFyd",
  ADD_SOURCE_URL:   "qkBFPd",
  ADD_SOURCE_TEXT:  "BbmKT",
  DELETE_SOURCE:    "mOjoCb",
  GENERATE_GUIDE:   "BdFbFe",  // study guide / briefing / quiz / flashcards
  GENERATE_AUDIO:   "PbDOdb",
  GENERATE_OUTLINE: "pFBgff",
  CHAT_HISTORY:     "hPTbtc",
} as const;

// ─── Auth state (cached per function invocation) ─────────────────────────────

interface AuthTokens {
  cookies: string;   // Cookie header string
  csrfToken: string; // CSRF / session token (AT= param)
  sid: string;       // Session ID (sid= URL param)
}

let cachedTokens: AuthTokens | null = null;

/**
 * Load cookies from env var and extract CSRF token by loading the homepage
 * once per cold start.
 */
export async function getAuthTokens(): Promise<AuthTokens> {
  if (cachedTokens) return cachedTokens;

  const storageStateRaw = process.env.NOTEBOOKLM_STORAGE_STATE;
  if (!storageStateRaw) {
    throw new Error("Missing env var: NOTEBOOKLM_STORAGE_STATE");
  }

  const storageState = JSON.parse(
    Buffer.from(storageStateRaw, "base64").toString("utf-8")
  );

  // Build Cookie header string from stored cookies
  const cookieHeader = (storageState.cookies as Array<{name:string; value:string}>)
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  // Use Playwright to load the page and extract CSRF token + sid
  // This is the ONLY browser call we make
  const { csrfToken, sid } = await withPage(async (page) => {
    await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30_000 });

    // Extract CSRF token from page source (it's embedded in a script tag)
    const csrf = await page.evaluate(() => {
      // Method 1: Look for SNlM0e or CSRF token in page scripts
      const scripts = Array.from(document.scripts);
      for (const script of scripts) {
        const content = script.textContent ?? "";
        // Google embeds CSRF as 'SNlM0e' or in WIZ_global_data
        const match =
          content.match(/"SNlM0e":"([^"]+)"/) ||
          content.match(/SNlM0e\s*=\s*'([^']+)'/) ||
          content.match(/"cfb2h":"([^"]+)"/);
        if (match) return match[1];
      }
      // Method 2: From meta tag
      const meta = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]');
      if (meta) return meta.content;
      return null;
    });

    // Extract session ID from the current URL's sid param or from scripts
    const sessionId = await page.evaluate(() => {
      const url = new URL(window.location.href);
      const sidFromUrl = url.searchParams.get("sid");
      if (sidFromUrl) return sidFromUrl;

      // Try extracting from WIZ data in page scripts
      for (const script of Array.from(document.scripts)) {
        const content = script.textContent ?? "";
        const match = content.match(/"FdrFJe"\s*:\s*"([^"]+)"/);
        if (match) return match[1];
      }
      return "";
    });

    return { csrfToken: csrf ?? "", sid: sessionId };
  });

  cachedTokens = { cookies: cookieHeader, csrfToken, sid };
  return cachedTokens;
}

// ─── Core RPC call ────────────────────────────────────────────────────────────

/**
 * Execute a batchexecute RPC call against NotebookLM.
 */
export async function rpcCall(
  methodId: string,
  params: unknown[],
  notebookId?: string
): Promise<unknown> {
  const auth = await getAuthTokens();

  // Build the batchexecute payload
  const innerPayload = JSON.stringify(params);
  const rpcRequest = [[[methodId, innerPayload, null, "generic"]]];
  const fReq = `f.req=${encodeURIComponent(JSON.stringify(rpcRequest))}`;

  // Build URL with session params
  const url = new URL(RPC_URL);
  url.searchParams.set("rpcids", methodId);
  url.searchParams.set("source-path", notebookId ? `/notebook/${notebookId}` : "/");
  url.searchParams.set("f.sid", auth.sid);
  url.searchParams.set("bl", "boq_labs-tailwind-ui_20250101.00_p0");
  url.searchParams.set("hl", "en");
  url.searchParams.set("soc-app", "1");
  url.searchParams.set("soc-platform", "1");
  url.searchParams.set("soc-device", "1");
  url.searchParams.set("rt", "c");

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      Cookie: auth.cookies,
      "X-Goog-BatchExecute-BgRequest": "1",
      Referer: BASE_URL,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
      ...(auth.csrfToken ? { "X-Goog-AuthUser": "0" } : {}),
    },
    body: `${fReq}&at=${encodeURIComponent(auth.csrfToken)}&`,
  });

  if (!response.ok) {
    throw new Error(`RPC ${methodId} failed: HTTP ${response.status}`);
  }

  const text = await response.text();

  // Parse batchexecute response (starts with ")]}'\n")
  return parseBatchExecuteResponse(text, methodId);
}

// ─── Response parser ──────────────────────────────────────────────────────────

function parseBatchExecuteResponse(text: string, methodId: string): unknown {
  // Strip the security prefix
  const clean = text.replace(/^\)]}'\n/, "").trim();

  try {
    const outer = JSON.parse(clean) as unknown[][];
    // batchexecute returns array of arrays; find our method's response
    for (const envelope of outer) {
      if (!Array.isArray(envelope)) continue;
      const [, innerJson] = envelope as [unknown, string, ...unknown[]];
      if (typeof innerJson === "string") {
        try {
          return JSON.parse(innerJson);
        } catch {
          return innerJson;
        }
      }
    }
    return outer;
  } catch {
    // Sometimes the response contains multiple JSON lines
    const lines = clean.split("\n").filter((l) => l.startsWith("["));
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as unknown[][];
        for (const envelope of parsed) {
          if (!Array.isArray(envelope)) continue;
          const [, innerJson] = envelope as [unknown, string, ...unknown[]];
          if (typeof innerJson === "string") {
            try {
              return JSON.parse(innerJson);
            } catch {
              return innerJson;
            }
          }
        }
      } catch {
        continue;
      }
    }
    throw new Error(`Failed to parse RPC response for ${methodId}: ${text.slice(0, 200)}`);
  }
}

// ─── Invalidate cache (for auth refresh) ─────────────────────────────────────

export function invalidateAuthCache(): void {
  cachedTokens = null;
}
