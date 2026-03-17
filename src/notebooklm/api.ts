/**
 * NotebookLM API
 * All operations via Google's internal batchexecute RPC endpoint.
 */
import type { AuthTokens } from "./rpc";
import { invalidateCache } from "./rpc";

const BASE = "https://notebooklm.google.com";
const RPC_URL = `${BASE}/_/LabsTailwindUi/data/batchexecute`;

// ─── RPC method IDs ───────────────────────────────────────────────────────────
const M = {
  LIST_NOTEBOOKS:   "wXbhsf",
  CREATE_NOTEBOOK:  "YEiWtc",
  DELETE_NOTEBOOK:  "FMnFhe",
  RENAME_NOTEBOOK:  "QKXPgb",
  GET_NOTEBOOK:     "RnFq6b",
  LIST_SOURCES:     "uvDFyd",
  ADD_SOURCE:       "qkBFPd",
  ADD_TEXT_SOURCE:  "BbmKT",
  DELETE_SOURCE:    "mOjoCb",
  GET_SUMMARY:      "Sl5Ew",
  GENERATE_GUIDE:   "BdFbFe",
  GENERATE_AUDIO:   "PbDOdb",
  GENERATE_OUTLINE: "pFBgff",
  LIST_ARTIFACTS:   "wQBFkf",
} as const;

// ─── Core fetch ───────────────────────────────────────────────────────────────
async function doFetch(auth: AuthTokens, methodId: string, params: unknown[], notebookId?: string) {
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

/**
 * Execute a batchexecute RPC call.
 * If we get HTTP 400 (stale XSRF), invalidate the cache and retry once
 * using the fresh XSRF token that Google embeds in the error body.
 */
async function call(
  auth: AuthTokens,
  methodId: string,
  params: unknown[],
  notebookId?: string
): Promise<unknown> {
  let res = await doFetch(auth, methodId, params, notebookId);

  if (res.status === 400) {
    const errBody = await res.text();

    // Extract the fresh XSRF token Google put in the error body
    const xsrfMatch = errBody.match(/"xsrf"\s*,\s*"([^"]+)"/);
    if (xsrfMatch) {
      // Patch auth with the correct token and retry
      const freshAuth: AuthTokens = { ...auth, csrfToken: xsrfMatch[1] };
      invalidateCache(); // clear global cache so next call re-probes
      res = await doFetch(freshAuth, methodId, params, notebookId);
      if (!res.ok) {
        throw new Error(`RPC ${methodId} → HTTP ${res.status} (after xsrf retry): ${(await res.text()).slice(0, 300)}`);
      }
      return parseResponse(await res.text());
    }

    throw new Error(`RPC ${methodId} → HTTP 400: ${errBody.slice(0, 300)}`);
  }

  if (!res.ok) {
    throw new Error(`RPC ${methodId} → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  return parseResponse(await res.text());
}

function parseResponse(text: string): unknown {
  const clean = text.replace(/^\)]\}'\n/, "");
  try {
    const outer = JSON.parse(clean) as unknown[][];
    for (const row of outer) {
      if (Array.isArray(row) && typeof row[1] === "string") {
        try { return JSON.parse(row[1]); } catch { return row[1]; }
      }
    }
    return outer;
  } catch {
    return text;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Notebook { id: string; title: string; url: string; sourceCount: number }
export interface Source   { id: string; title: string; type: string }
export interface Artifact { id: string; type: string; status: string }

// ─── Notebook ops ─────────────────────────────────────────────────────────────
export async function listNotebooks(auth: AuthTokens): Promise<Notebook[]> {
  const data = await call(auth, M.LIST_NOTEBOOKS, [null]) as unknown[][];
  if (!Array.isArray(data)) return [];
  const rows = Array.isArray(data[0]) ? data[0] as unknown[][] : data as unknown[][];
  return rows.filter(Array.isArray).map((r) => ({
    id:          String(r[2] ?? r[0] ?? ""),
    title:       String(r[1] ?? "Untitled"),
    url:         `${BASE}/notebook/${String(r[2] ?? r[0] ?? "")}`,
    sourceCount: typeof r[6] === "number" ? r[6] : 0,
  })).filter((n) => n.id);
}

export async function createNotebook(auth: AuthTokens, title: string): Promise<Notebook> {
  const data = await call(auth, M.CREATE_NOTEBOOK, [title, null, null, [2], [1]]) as unknown[];
  const id = String(Array.isArray(data) ? data[0] ?? "" : "");
  if (!id) throw new Error("Create notebook: no ID returned");
  return { id, title, url: `${BASE}/notebook/${id}`, sourceCount: 0 };
}

export async function getNotebook(auth: AuthTokens, notebookId: string): Promise<Notebook> {
  const data = await call(auth, M.GET_NOTEBOOK, [notebookId], notebookId) as unknown[];
  return {
    id:          notebookId,
    title:       String(Array.isArray(data) ? data[1] ?? "Untitled" : "Untitled"),
    url:         `${BASE}/notebook/${notebookId}`,
    sourceCount: Array.isArray(data) && typeof data[6] === "number" ? data[6] : 0,
  };
}

export async function deleteNotebook(auth: AuthTokens, notebookId: string): Promise<void> {
  await call(auth, M.DELETE_NOTEBOOK, [notebookId], notebookId);
}

export async function renameNotebook(auth: AuthTokens, notebookId: string, newTitle: string): Promise<void> {
  await call(auth, M.RENAME_NOTEBOOK, [notebookId, newTitle], notebookId);
}

// ─── Source ops ───────────────────────────────────────────────────────────────
export async function listSources(auth: AuthTokens, notebookId: string): Promise<Source[]> {
  const data = await call(auth, M.LIST_SOURCES, [notebookId], notebookId) as unknown[][];
  if (!Array.isArray(data)) return [];
  const rows = Array.isArray(data[0]) ? data[0] as unknown[][] : data as unknown[][];
  return rows.filter(Array.isArray).map((r, i) => ({
    id:    String(r[0] ?? i),
    title: String(r[1] ?? "Source"),
    type:  String(r[2] ?? "unknown"),
  }));
}

export async function addSourceUrl(auth: AuthTokens, notebookId: string, url: string): Promise<{ success: boolean; message: string }> {
  const isYouTube = /youtube\.com|youtu\.be/.test(url);
  await call(auth, M.ADD_SOURCE, [notebookId, [[isYouTube ? 6 : 1, url]]], notebookId);
  return { success: true, message: `Added ${isYouTube ? "YouTube" : "URL"} source: ${url}` };
}

export async function addSourceText(auth: AuthTokens, notebookId: string, content: string, title = "Pasted text"): Promise<{ success: boolean; message: string }> {
  await call(auth, M.ADD_TEXT_SOURCE, [notebookId, [[3, content, title]]], notebookId);
  return { success: true, message: `Text source "${title}" added.` };
}

export async function deleteSource(auth: AuthTokens, notebookId: string, sourceId: string): Promise<{ success: boolean; message: string }> {
  await call(auth, M.DELETE_SOURCE, [notebookId, sourceId], notebookId);
  return { success: true, message: `Source ${sourceId} deleted.` };
}

// ─── Summary ──────────────────────────────────────────────────────────────────
export async function getNotebookSummary(auth: AuthTokens, notebookId: string): Promise<string> {
  const data = await call(auth, M.GET_SUMMARY, [notebookId], notebookId) as unknown[];
  return Array.isArray(data) ? String(data[0] ?? "No summary available.") : "No summary available.";
}

// ─── Artifact generation ─────────────────────────────────────────────────────
const GUIDE = { study_guide: 1, briefing_doc: 2, quiz: 3, flashcards: 4 } as const;

async function guide(auth: AuthTokens, notebookId: string, type: keyof typeof GUIDE, label: string) {
  const data = await call(auth, M.GENERATE_GUIDE, [notebookId, GUIDE[type], null, {}], notebookId) as unknown[];
  const taskId = Array.isArray(data) ? String(data[0] ?? "") : "";
  return { type: label, status: "started", taskId, notebookId, message: `${label} generation started${taskId ? ` (task: ${taskId})` : ""}.` };
}

export async function generateStudyGuide(auth: AuthTokens, notebookId: string)  { return guide(auth, notebookId, "study_guide",  "Study Guide"); }
export async function generateBriefingDoc(auth: AuthTokens, notebookId: string) { return guide(auth, notebookId, "briefing_doc", "Briefing Doc"); }
export async function generateQuiz(auth: AuthTokens, notebookId: string)        { return guide(auth, notebookId, "quiz",         "Quiz"); }
export async function generateFlashcards(auth: AuthTokens, notebookId: string)  { return guide(auth, notebookId, "flashcards",   "Flashcards"); }

export async function generateMindMap(auth: AuthTokens, notebookId: string) {
  const data = await call(auth, M.GENERATE_OUTLINE, [notebookId], notebookId) as unknown[];
  const taskId = Array.isArray(data) ? String(data[0] ?? "") : "";
  return { type: "Mind Map", status: "started", taskId, notebookId, message: `Mind map generation started${taskId ? ` (task: ${taskId})` : ""}.` };
}

export async function generateSlideshow(auth: AuthTokens, notebookId: string) {
  const data = await call(auth, M.GENERATE_OUTLINE, [notebookId, 2], notebookId) as unknown[];
  const taskId = Array.isArray(data) ? String(data[0] ?? "") : "";
  return { type: "Slideshow", status: "started", taskId, notebookId, message: `Slideshow generation started${taskId ? ` (task: ${taskId})` : ""}.` };
}

export async function generateAudio(auth: AuthTokens, notebookId: string, instructions = "") {
  const data = await call(auth, M.GENERATE_AUDIO, [notebookId, null, instructions || null, null, [1]], notebookId) as unknown[];
  const taskId = Array.isArray(data) ? String(data[0] ?? "") : "";
  return { type: "Audio", status: "started", taskId, notebookId, message: `Audio podcast started${taskId ? ` (task: ${taskId})` : ""}. Takes 2-5 min — check NotebookLM to download.` };
}

export async function listArtifacts(auth: AuthTokens, notebookId: string): Promise<Artifact[]> {
  const data = await call(auth, M.LIST_ARTIFACTS, [notebookId], notebookId) as unknown[][];
  if (!Array.isArray(data)) return [];
  const rows = Array.isArray(data[0]) ? data[0] as unknown[][] : data as unknown[][];
  return rows.filter(Array.isArray).map((r, i) => ({
    id:     String(r[0] ?? i),
    type:   String(r[1] ?? "unknown"),
    status: String(r[2] ?? "unknown"),
  }));
}
