/**
 * NotebookLM RPC Auth
 * Builds auth tokens from stored cookies — NO browser/Browserless required.
 * Uses SAPISIDHASH (standard Google API auth) instead of CSRF token.
 */
import { createHash } from "crypto";

export interface AuthTokens {
  cookieHeader: string;
  csrfToken: string;
  sessionId: string;
  sapisidHash: string;
}

function buildSAPISIDHASH(sapisid: string): string {
  const origin = "https://notebooklm.google.com";
  const now = Math.floor(Date.now() / 1000);
  const hash = createHash("sha1")
    .update(`${now} ${sapisid} ${origin}`)
    .digest("hex");
  return `SAPISIDHASH ${now}_${hash}`;
}

export async function buildAuthTokens(): Promise<AuthTokens> {
  const raw = process.env.NOTEBOOKLM_STORAGE_STATE;
  if (!raw) throw new Error("Missing env var: NOTEBOOKLM_STORAGE_STATE");

  const state = JSON.parse(Buffer.from(raw, "base64").toString("utf-8")) as {
    cookies: Array<{ name: string; value: string }>;
  };

  const cookieHeader = state.cookies.map((c) => `${c.name}=${c.value}`).join("; ");

  const sapisid =
    state.cookies.find((c) => c.name === "__Secure-3PAPISID")?.value ||
    state.cookies.find((c) => c.name === "SAPISID")?.value ||
    "";

  if (!sapisid) throw new Error("Could not find SAPISID cookie. Please refresh your session.");

  const sapisidHash = buildSAPISIDHASH(sapisid);

  // Extract SID for use as session identifier
  const sid = state.cookies.find((c) => c.name === "SID")?.value ?? "";

  return { cookieHeader, csrfToken: sapisidHash, sessionId: sid, sapisidHash };
}
