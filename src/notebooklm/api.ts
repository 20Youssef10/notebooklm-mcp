/**
 * NotebookLM API — using verified RPC method IDs from notebooklm-py
 * Source: github.com/teng-lin/notebooklm-py/blob/main/docs/rpc-reference.md
 */
import type { AuthTokens } from "./rpc";
import { invalidateCache } from "./rpc";

const BASE    = "https://notebooklm.google.com";
const RPC_URL = `${BASE}/_/LabsTailwindUi/data/batchexecute`;

// ─── Verified RPC method IDs ──────────────────────────────────────────────────
const M = {
  // Notebooks
  LIST_NOTEBOOKS:   "wXbhsf",
  CREATE_NOTEBOOK:  "CCqFvf",   // was YEiWtc ← WRONG
  GET_NOTEBOOK:     "rLM1Ne",   // was RnFq6b ← WRONG
  RENAME_NOTEBOOK:  "s0tc2d",   // was QKPgb   ← WRONG
  DELETE_NOTEBOOK:  "WWINqb",   // was FMnFhe  ← WRONG
  // Sources
  ADD_SOURCE:       "izAoDd",   // was qkBFPd  ← WRONG
  DELETE_SOURCE:    "tGMBJ",    // was mOjoCb  ← WRONG
  GET_SOURCE:       "hizoJc",
  // Summary
  SUMMARIZE:        "VfAZjd",
  // Artifacts
  CREATE_ARTIFACT:  "R7cb6c",
  LIST_ARTIFACTS:   "gArtLc",   // was wQBFkf  ← WRONG
  DELETE_ARTIFACT:  "V5N4be",
  // Mind map
  GENERATE_MIND_MAP:"yyryJe",
  // Notes/conversation
  GET_NOTES_MAPS:   "cFji9",
  GET_CONVERSATION: "hPTbtc",
} as const;

// Artifact type codes (from ArtifactTypeCode enum)
const AT = {
  AUDIO:      1,
  REPORT:     2,  // study guide, briefing, blog post...
  VIDEO:      3,
  QUIZ:       4,  // also flashcards
  MIND_MAP:   5,
  INFOGRAPHIC:7,
  SLIDE_DECK: 8,
  DATA_TABLE: 9,
} as const;

// ─── Core HTTP ────────────────────────────────────────────────────────────────
async function doFetch(auth: AuthTokens, methodId: string, params: unknown[], notebookId?: string): Promise<Response> {
  const url = new URL(RPC_URL);
  url.searchParams.set("rpcids", methodId);
  url.searchParams.set("source-path", notebookId ? `/notebook/${notebookId}` : "/");
  url.searchParams.set("bl", "boq_labs-tailwind-ui_20250101.00_p0");
  url.searchParams.set("hl", "en");
  url.searchParams.set("rt", "c");
  if (auth.sessionId) url.searchParams.set("f.sid", auth.sessionId);

  const freq = JSON.stringify([[[methodId, JSON.stringify(params), null, "generic"]]]);
  const body = `f.req=${encodeURIComponent(freq)}&at=${encodeURIComponent(auth.csrfToken)}&`;

  return fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      Cookie: auth.cookieHeader,
      Authorization: auth.sapisidHash,
      Referer: `${BASE}/`,
      Origin: BASE,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
      "X-Goog-AuthUser": "0",
    },
    body,
  });
}

async function call(auth: AuthTokens, methodId: string, params: unknown[], notebookId?: string): Promise<unknown> {
  let res = await doFetch(auth, methodId, params, notebookId);

  // On 400: Google embeds the fresh XSRF in the error body — retry with it
  if (res.status === 400) {
    const errBody = await res.text();
    const xsrfMatch = errBody.match(/"xsrf"\s*,\s*"([^"]+)"/);
    if (xsrfMatch) {
      invalidateCache();
      const freshAuth = { ...auth, csrfToken: xsrfMatch[1] };
      res = await doFetch(freshAuth, methodId, params, notebookId);
      if (!res.ok) throw new Error(`RPC ${methodId} → HTTP ${res.status} (after xsrf retry): ${(await res.text()).slice(0,300)}`);
      return parseResp(await res.text());
    }
    throw new Error(`RPC ${methodId} → HTTP 400: ${errBody.slice(0,400)}`);
  }

  if (!res.ok) throw new Error(`RPC ${methodId} → HTTP ${res.status}: ${(await res.text()).slice(0,200)}`);
  return parseResp(await res.text());
}

function parseResp(text: string): unknown {
  // batchexecute response format (chunked transfer encoding):
  // )]}'\n
  // 319\n                   ← chunk byte size (SKIP)
  // [["wrb.fr","METHOD","DATA_JSON",...],...] ← actual JSON
  // 25\n
  // [["e",4,...]]
  //
  // Strategy: find ALL lines that start with "[" and try to parse them.
  // Pick the one that contains a "wrb.fr" row.

  const lines = text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("[")) continue;
    try {
      const outer = JSON.parse(trimmed) as unknown[][];
      if (!Array.isArray(outer)) continue;
      for (const row of outer) {
        if (!Array.isArray(row)) continue;
        // ["wrb.fr", methodId, dataJsonString, ...]
        if (row[0] === "wrb.fr" && typeof row[2] === "string") {
          try { return JSON.parse(row[2]); } catch { return row[2]; }
        }
      }
    } catch { continue; }
  }
  // Fallback: return raw text so error message includes it
  return text;
}

/** Public diagnostic */
export async function callRaw(auth: AuthTokens, methodId: string, params: unknown[]): Promise<unknown> {
  return call(auth, methodId, params);
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Notebook { id: string; title: string; url: string; sourceCount: number }
export interface Source   { id: string; title: string; type: string; status: string }
export interface Artifact { id: string; type: string; status: string; title: string }

// ─── Notebooks ────────────────────────────────────────────────────────────────
export async function listNotebooks(auth: AuthTokens): Promise<Notebook[]> {
  const data = await call(auth, M.LIST_NOTEBOOKS, [null]);

  // Log first 600 chars for debugging
  console.log("[listNotebooks] raw:", JSON.stringify(data).slice(0, 600));

  if (!Array.isArray(data)) return [];

  // LIST_NOTEBOOKS returns an array of notebook entries at data[0]
  // Each entry (from CREATE_NOTEBOOK shape): [title, null, id, null, null, meta, null, ..., null, sources_array]
  //   data[0] = title (string)
  //   data[2] = notebook ID (UUID string)
  //   data[11] = [[sourceId1], [sourceId2], ...] — length = source count
  const entries: unknown[][] = [];
  if (Array.isArray(data[0]) && Array.isArray(data[0][0])) {
    // data[0] is the list of notebooks
    entries.push(...(data[0] as unknown[][]));
  } else if (Array.isArray(data[0])) {
    // data itself might be the list
    entries.push(...(data as unknown[][]));
  }

  console.log("[listNotebooks] entries count:", entries.length);

  return entries.filter(Array.isArray).map((r) => {
    const id    = typeof r[2] === "string" && r[2].length > 5 ? r[2] : "";
    const title = typeof r[0] === "string" ? r[0] : "Untitled";
    // sources are at r[11]: [[id1],[id2],...] or r[6] as number
    const srcArr = Array.isArray(r[11]) ? r[11] : [];
    const sourceCount = srcArr.length > 0 ? srcArr.length : (typeof r[6] === "number" ? r[6] : 0);
    if (!id) return null;
    return { id, title, url: `${BASE}/notebook/${id}`, sourceCount };
  }).filter(Boolean) as Notebook[];
}

export async function createNotebook(auth: AuthTokens, title: string): Promise<Notebook> {
  // Response: ["AI Development Notes", null, "c541cf08-bdc9-...", null, null, [...]]
  // ID is at index 2 of the parsed inner array
  const data = await call(auth, M.CREATE_NOTEBOOK, [title, null, null, [2], [1]]) as unknown[];
  const raw = JSON.stringify(data);

  let id = "";
  if (Array.isArray(data)) {
    // data[2] is the notebook ID (UUID format)
    if (typeof data[2] === "string" && data[2].length > 5) {
      id = data[2];
    } else {
      // Fallback: find first UUID-like string
      for (const v of data) {
        if (typeof v === "string" && /^[0-9a-f-]{8,}$/i.test(v)) { id = v; break; }
      }
    }
  }

  if (!id) throw new Error("createNotebook: no ID in response. Raw: " + raw.slice(0, 400));
  return { id, title, url: `${BASE}/notebook/${id}`, sourceCount: 0 };
}

export async function getNotebook(auth: AuthTokens, notebookId: string): Promise<Notebook> {
  const data = await call(auth, M.GET_NOTEBOOK, [notebookId], notebookId) as unknown[];
  return {
    id:          notebookId,
    title:       String(Array.isArray(data) ? (data[1] ?? "Untitled") : "Untitled"),
    url:         `${BASE}/notebook/${notebookId}`,
    sourceCount: Array.isArray(data) && typeof data[6] === "number" ? data[6] : 0,
  };
}

export async function deleteNotebook(auth: AuthTokens, notebookId: string): Promise<void> {
  await call(auth, M.DELETE_NOTEBOOK, [[notebookId]], notebookId);
}

export async function renameNotebook(auth: AuthTokens, notebookId: string, newTitle: string): Promise<void> {
  await call(auth, M.RENAME_NOTEBOOK, [notebookId, newTitle], notebookId);
}

// ─── Sources ──────────────────────────────────────────────────────────────────
export async function listSources(auth: AuthTokens, notebookId: string): Promise<Source[]> {
  const data = await call(auth, M.GET_NOTEBOOK, [notebookId], notebookId) as unknown[][];
  if (!Array.isArray(data)) return [];
  // Sources are at data[1] in GET_NOTEBOOK response
  const srcList = Array.isArray(data[1]) ? data[1] as unknown[][] : [];
  return srcList.filter(Array.isArray).map((s, i) => ({
    id:     String(s[0] ?? i),
    title:  String(s[1] ?? "Source"),
    type:   String(s[2] ?? "unknown"),
    status: String(s[3]?.[1] ?? "unknown"),
  }));
}

export async function addSourceUrl(auth: AuthTokens, notebookId: string, url: string): Promise<{ success: boolean; message: string }> {
  const isYT = /youtube\.com|youtu\.be/.test(url);
  const srcType = isYT ? 6 : 1;

  // Try different param structures — the exact nesting matters
  // Attempt 1: [notebookId, [[type, url]]]
  // Attempt 2: [notebookId, [type, url]]
  // Attempt 3: [[notebookId, [[type, url]]]]
  const variants: unknown[][] = [
    [notebookId, [[srcType, url]]],
    [notebookId, [srcType, url]],
    [notebookId, [[srcType, url, null]]],
    [notebookId, [[srcType, url, null, null]]],
  ];

  let lastErr = "";
  for (const params of variants) {
    try {
      const data = await call(auth, M.ADD_SOURCE, params, notebookId);
      console.log("[addSourceUrl] success with params:", JSON.stringify(params), "raw:", JSON.stringify(data).slice(0, 200));
      return { success: true, message: `Added ${isYT ? "YouTube" : "URL"}: ${url}` };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      console.log("[addSourceUrl] failed params:", JSON.stringify(params), "error:", lastErr.slice(0, 100));
      if (!lastErr.includes("400")) throw e; // non-400 = real error
    }
  }
  throw new Error(`addSourceUrl failed all variants. Last: ${lastErr}`);
}

export async function addSourceText(auth: AuthTokens, notebookId: string, content: string, title = "Pasted text"): Promise<{ success: boolean; message: string }> {
  const data = await call(auth, M.ADD_SOURCE, [notebookId, [[3, content, title]]], notebookId);
  console.log("[addSourceText] raw:", JSON.stringify(data).slice(0, 200));
  return { success: true, message: `Text source "${title}" added.` };
}

export async function deleteSource(auth: AuthTokens, notebookId: string, sourceId: string): Promise<{ success: boolean; message: string }> {
  await call(auth, M.DELETE_SOURCE, [notebookId, [sourceId]], notebookId);
  return { success: true, message: `Source ${sourceId} deleted.` };
}

// ─── Summary ──────────────────────────────────────────────────────────────────
export async function getNotebookSummary(auth: AuthTokens, notebookId: string): Promise<string> {
  const data = await call(auth, M.SUMMARIZE, [notebookId, [2]], notebookId) as unknown[][];
  return Array.isArray(data) && Array.isArray(data[0]) ? String(data[0][0] ?? "No summary.") : "No summary.";
}

// ─── Artifact generation ─────────────────────────────────────────────────────
async function createArtifact(auth: AuthTokens, notebookId: string, typeCode: number, label: string, extra: unknown[] = []) {
  // CREATE_ARTIFACT params: [notebook_id, artifact_type_code, ...extra]
  const data = await call(auth, M.CREATE_ARTIFACT, [notebookId, typeCode, ...extra], notebookId) as unknown[];
  const artifactId = Array.isArray(data) ? String(data[0] ?? "") : "";
  return {
    type: label,
    status: "started",
    artifactId: artifactId || undefined,
    notebookId,
    message: `${label} generation started${artifactId ? ` (id: ${artifactId})` : ""}. Check NotebookLM to view when ready.`,
  };
}

export async function generateAudio(auth: AuthTokens, notebookId: string, instructions = "") {
  // Audio params extra: [format, length, instructions_or_null]
  return createArtifact(auth, notebookId, AT.AUDIO, "Audio Podcast",
    [1, 2, instructions || null]); // format=DEEP_DIVE, length=DEFAULT
}

export async function generateQuiz(auth: AuthTokens, notebookId: string) {
  return createArtifact(auth, notebookId, AT.QUIZ, "Quiz", [2, 2]); // STANDARD qty, MEDIUM difficulty
}

export async function generateFlashcards(auth: AuthTokens, notebookId: string) {
  return createArtifact(auth, notebookId, AT.QUIZ, "Flashcards", [2, 2]);
}

export async function generateStudyGuide(auth: AuthTokens, notebookId: string) {
  return createArtifact(auth, notebookId, AT.REPORT, "Study Guide", ["study_guide"]);
}

export async function generateBriefingDoc(auth: AuthTokens, notebookId: string) {
  return createArtifact(auth, notebookId, AT.REPORT, "Briefing Doc", ["briefing_doc"]);
}

export async function generateMindMap(auth: AuthTokens, notebookId: string) {
  const data = await call(auth, M.GENERATE_MIND_MAP, [notebookId], notebookId) as unknown[];
  const id = Array.isArray(data) ? String(data[0] ?? "") : "";
  return { type: "Mind Map", status: "started", artifactId: id || undefined, notebookId,
    message: `Mind map generation started${id ? ` (id: ${id})` : ""}.` };
}

export async function generateSlideshow(auth: AuthTokens, notebookId: string) {
  return createArtifact(auth, notebookId, AT.SLIDE_DECK, "Slide Deck", [1, 1]); // DETAILED_DECK, DEFAULT length
}

// ─── List artifacts ───────────────────────────────────────────────────────────
export async function listArtifacts(auth: AuthTokens, notebookId: string): Promise<Artifact[]> {
  const data = await call(auth, M.LIST_ARTIFACTS, [notebookId], notebookId) as unknown[][];
  if (!Array.isArray(data)) return [];
  const rows = Array.isArray(data[0]) ? data[0] as unknown[][] : data as unknown[][];
  return rows.filter(Array.isArray).map((r, i) => ({
    id:     String(r[0] ?? i),
    type:   String(r[2] ?? "unknown"),
    status: String(r[4] ?? "unknown"),
    title:  String(r[1] ?? ""),
  }));
}
