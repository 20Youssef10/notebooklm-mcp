/**
 * NotebookLM API
 * All params verified from notebooklm-py source code:
 * /usr/local/lib/python3.12/dist-packages/notebooklm/_notebooks.py
 * /usr/local/lib/python3.12/dist-packages/notebooklm/_sources.py
 */
import type { AuthTokens } from "./rpc";
import { invalidateCache } from "./rpc";

const BASE    = "https://notebooklm.google.com";
const RPC_URL = `${BASE}/_/LabsTailwindUi/data/batchexecute`;

// Verified method IDs from notebooklm-py rpc/types.py
const M = {
  LIST_NOTEBOOKS:    "wXbhsf",
  CREATE_NOTEBOOK:   "CCqFvf",
  GET_NOTEBOOK:      "rLM1Ne",
  RENAME_NOTEBOOK:   "s0tc2d",
  DELETE_NOTEBOOK:   "WWINqb",
  ADD_SOURCE:        "izAoDd",
  ADD_SOURCE_FILE:   "o4cbdc",
  DELETE_SOURCE:     "tGMBJ",
  GET_SOURCE:        "hizoJc",
  SUMMARIZE:         "VfAZjd",
  CREATE_ARTIFACT:   "R7cb6c",
  LIST_ARTIFACTS:    "gArtLc",
  GENERATE_MIND_MAP: "yyryJe",
  GET_CONVERSATION:  "hPTbtc",
} as const;

const AT = { AUDIO:1, REPORT:2, VIDEO:3, QUIZ:4, SLIDE_DECK:8 } as const;

// ─── HTTP core ────────────────────────────────────────────────────────────────
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

  if (res.status === 400) {
    const errBody = await res.text();
    const xsrfMatch = errBody.match(/"xsrf"\s*,\s*"([^"]+)"/);
    if (xsrfMatch) {
      invalidateCache();
      const freshAuth = { ...auth, csrfToken: xsrfMatch[1] };
      res = await doFetch(freshAuth, methodId, params, notebookId);
      if (!res.ok) throw new Error(`RPC ${methodId} → HTTP ${res.status} (xsrf retry): ${(await res.text()).slice(0,300)}`);
      return parseResp(await res.text());
    }
    throw new Error(`RPC ${methodId} → HTTP 400: ${errBody.slice(0,400)}`);
  }

  if (!res.ok) throw new Error(`RPC ${methodId} → HTTP ${res.status}: ${(await res.text()).slice(0,200)}`);
  return parseResp(await res.text());
}

function parseResp(text: string): unknown {
  // Chunked: skip lines that are just numbers (chunk sizes), parse lines starting with "["
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("[")) continue;
    try {
      const outer = JSON.parse(t) as unknown[][];
      for (const row of outer) {
        if (Array.isArray(row) && row[0] === "wrb.fr" && typeof row[2] === "string") {
          try { return JSON.parse(row[2]); } catch { return row[2]; }
        }
      }
    } catch { continue; }
  }
  return text;
}

export async function callRaw(auth: AuthTokens, methodId: string, params: unknown[]): Promise<unknown> {
  return call(auth, methodId, params);
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Notebook { id: string; title: string; url: string; sourceCount: number }
export interface Source   { id: string; title: string; url: string | null; status: string }
export interface Artifact { id: string; type: string; status: string; title: string }

// ─── Notebooks ────────────────────────────────────────────────────────────────

export async function listNotebooks(auth: AuthTokens): Promise<Notebook[]> {
  // Verified params from _notebooks.py list(): [None, 1, None, [2]]
  const data = await call(auth, M.LIST_NOTEBOOKS, [null, 1, null, [2]]);
  if (!Array.isArray(data)) return [];

  // Response: [[nb1, nb2, ...], ...]   where nb = [title, sources, id, ...]
  const raw = data[0];
  const entries: unknown[][] = Array.isArray(raw) && Array.isArray((raw as unknown[][])[0])
    ? raw as unknown[][]
    : data as unknown[][];

  return entries.filter(Array.isArray).flatMap((r) => {
    // r[0]=title, r[1]=sources_array_or_null, r[2]=id
    const title = typeof r[0] === "string" ? r[0] : "Untitled";
    const id    = typeof r[2] === "string" && r[2].includes("-") ? r[2] : "";
    const sourceCount = Array.isArray(r[1]) ? (r[1] as unknown[]).length : 0;
    if (!id) return [];
    return [{ id, title, url: `${BASE}/notebook/${id}`, sourceCount }];
  });
}

export async function createNotebook(auth: AuthTokens, title: string): Promise<Notebook> {
  // Verified params from _notebooks.py create(): [title, None, None, [2], [1]]
  const data = await call(auth, M.CREATE_NOTEBOOK, [title, null, null, [2], [1]]) as unknown[];
  // Response shape matches a notebook entry: [title, null, id, ...]
  const id = typeof data[2] === "string" ? data[2] : "";
  if (!id) throw new Error(`createNotebook: no ID in response. Raw: ${JSON.stringify(data).slice(0,300)}`);
  return { id, title, url: `${BASE}/notebook/${id}`, sourceCount: 0 };
}

export async function getNotebook(auth: AuthTokens, notebookId: string): Promise<Notebook> {
  // Verified params from _notebooks.py get(): [notebookId, None, [2], None, 0]
  const data = await call(auth, M.GET_NOTEBOOK, [notebookId, null, [2], null, 0], notebookId) as unknown[][];
  // get() returns [nb_info, ...] where nb_info is the notebook array
  const nb = Array.isArray(data[0]) ? data[0] as unknown[] : data as unknown[];
  const title = typeof nb[0] === "string" ? nb[0] : "Untitled";
  const sourceCount = Array.isArray(nb[1]) ? (nb[1] as unknown[]).length : 0;
  return { id: notebookId, title, url: `${BASE}/notebook/${notebookId}`, sourceCount };
}

export async function deleteNotebook(auth: AuthTokens, notebookId: string): Promise<void> {
  // Verified params from _notebooks.py delete(): [[notebookId], [2]]
  await call(auth, M.DELETE_NOTEBOOK, [[notebookId], [2]], notebookId);
}

export async function renameNotebook(auth: AuthTokens, notebookId: string, newTitle: string): Promise<void> {
  // Verified params from _notebooks.py rename(): [notebookId, [[None, None, None, [None, newTitle]]]]
  await call(auth, M.RENAME_NOTEBOOK, [notebookId, [[null, null, null, [null, newTitle]]]], notebookId);
}

// ─── Sources ──────────────────────────────────────────────────────────────────

export async function listSources(auth: AuthTokens, notebookId: string): Promise<Source[]> {
  // Uses GET_NOTEBOOK then reads nb_info[1] for sources
  // Verified from _sources.py list(): params = [notebook_id, None, [2], None, 0]
  const data = await call(auth, M.GET_NOTEBOOK, [notebookId, null, [2], null, 0], notebookId) as unknown[][];
  if (!Array.isArray(data)) return [];
  const nbInfo = Array.isArray(data[0]) ? data[0] as unknown[] : data as unknown[];
  const srcList = Array.isArray(nbInfo[1]) ? nbInfo[1] as unknown[][] : [];

  return srcList.filter(Array.isArray).map((s, i) => {
    // Verified from _sources.py: src_id = src[0][0] if src[0] is list
    const id    = Array.isArray(s[0]) ? String((s[0] as unknown[])[0] ?? i) : String(s[0] ?? i);
    const title = typeof s[1] === "string" ? s[1] : "Source";
    // URL at src[2][7][0]
    let url: string | null = null;
    if (Array.isArray(s[2]) && Array.isArray((s[2] as unknown[])[7])) {
      const urlArr = (s[2] as unknown[])[7] as unknown[];
      url = typeof urlArr[0] === "string" ? urlArr[0] : null;
    }
    // Status at src[3][1]
    const statusCode = Array.isArray(s[3]) ? (s[3] as unknown[])[1] : null;
    const status = statusCode === 2 ? "ready" : statusCode === 1 ? "processing" : "unknown";
    return { id, title, url, status };
  });
}

export async function addSourceUrl(auth: AuthTokens, notebookId: string, url: string): Promise<{ success: boolean; message: string }> {
  const isYT = /youtube\.com|youtu\.be/.test(url);

  const params = isYT
    // Verified from _sources.py _add_youtube_source():
    // [[[None,None,None,None,None,None,None,[url],None,None,1]], notebookId, [2], [1,...]]
    ? [
        [[null, null, null, null, null, null, null, [url], null, null, 1]],
        notebookId,
        [2],
        [1, null, null, null, null, null, null, null, null, null, [1]],
      ]
    // Verified from _sources.py _add_url_source():
    // [[[None,None,[url],None,None,None,None,None]], notebookId, [2], None, None]
    : [
        [[null, null, [url], null, null, null, null, null]],
        notebookId,
        [2],
        null,
        null,
      ];

  await call(auth, M.ADD_SOURCE, params, notebookId);
  return { success: true, message: `Added ${isYT ? "YouTube" : "URL"}: ${url}` };
}

export async function addSourceText(auth: AuthTokens, notebookId: string, content: string, title = "Pasted text"): Promise<{ success: boolean; message: string }> {
  // Verified from _sources.py add_text():
  // [[[None, [title, content], None, None, None, None, None, None]], notebookId, [2], None, None]
  await call(auth, M.ADD_SOURCE, [
    [[null, [title, content], null, null, null, null, null, null]],
    notebookId,
    [2],
    null,
    null,
  ], notebookId);
  return { success: true, message: `Text source "${title}" added.` };
}

export async function deleteSource(auth: AuthTokens, notebookId: string, sourceId: string): Promise<{ success: boolean; message: string }> {
  // Verified from _sources.py delete(): params = [[[source_id]]]
  await call(auth, M.DELETE_SOURCE, [[[sourceId]]], notebookId);
  return { success: true, message: `Source ${sourceId} deleted.` };
}

// ─── Summary ──────────────────────────────────────────────────────────────────
export async function getNotebookSummary(auth: AuthTokens, notebookId: string): Promise<string> {
  const data = await call(auth, M.SUMMARIZE, [notebookId, [2]], notebookId) as unknown[][];
  return Array.isArray(data) && Array.isArray(data[0]) ? String((data[0] as unknown[])[0] ?? "No summary.") : "No summary.";
}

// ─── Artifacts ────────────────────────────────────────────────────────────────
async function artifact(auth: AuthTokens, notebookId: string, typeCode: number, label: string, extra: unknown[] = []) {
  const data = await call(auth, M.CREATE_ARTIFACT, [notebookId, typeCode, ...extra], notebookId) as unknown[];
  const artifactId = Array.isArray(data) ? String(data[0] ?? "") : "";
  return { type: label, status: "started", artifactId: artifactId || undefined, notebookId,
    message: `${label} generation started${artifactId ? ` (id: ${artifactId})` : ""}. Open NotebookLM to view when ready.` };
}

export async function generateAudio(auth: AuthTokens, notebookId: string, instructions = "") {
  return artifact(auth, notebookId, AT.AUDIO, "Audio Podcast", [1, 2, instructions || null]);
}
export async function generateQuiz(auth: AuthTokens, notebookId: string) {
  return artifact(auth, notebookId, AT.QUIZ, "Quiz", [2, 2]);
}
export async function generateFlashcards(auth: AuthTokens, notebookId: string) {
  return artifact(auth, notebookId, AT.QUIZ, "Flashcards", [2, 2]);
}
export async function generateStudyGuide(auth: AuthTokens, notebookId: string) {
  return artifact(auth, notebookId, AT.REPORT, "Study Guide", ["study_guide"]);
}
export async function generateBriefingDoc(auth: AuthTokens, notebookId: string) {
  return artifact(auth, notebookId, AT.REPORT, "Briefing Doc", ["briefing_doc"]);
}
export async function generateMindMap(auth: AuthTokens, notebookId: string) {
  const data = await call(auth, M.GENERATE_MIND_MAP, [notebookId], notebookId) as unknown[];
  const id = Array.isArray(data) ? String(data[0] ?? "") : "";
  return { type: "Mind Map", status: "started", artifactId: id||undefined, notebookId,
    message: `Mind map generation started${id ? ` (id: ${id})` : ""}.` };
}
export async function generateSlideshow(auth: AuthTokens, notebookId: string) {
  return artifact(auth, notebookId, AT.SLIDE_DECK, "Slide Deck", [1, 1]);
}

export async function listArtifacts(auth: AuthTokens, notebookId: string): Promise<Artifact[]> {
  const data = await call(auth, M.LIST_ARTIFACTS, [notebookId], notebookId) as unknown[][];
  if (!Array.isArray(data)) return [];
  const rows = Array.isArray(data[0]) ? data[0] as unknown[][] : data as unknown[][];
  return rows.filter(Array.isArray).map((r, i) => ({
    id: String(r[0] ?? i), type: String(r[2] ?? "unknown"),
    status: String(r[4] ?? "unknown"), title: String(r[1] ?? ""),
  }));
}
