import { rpcCall, RPC } from "../rpc";

export interface Source {
  id: string;
  title: string;
  type: "url" | "pdf" | "text" | "youtube" | "drive" | "unknown";
}

export async function listSources(notebookId: string): Promise<Source[]> {
  const data = (await rpcCall(RPC.LIST_SOURCES, [notebookId], notebookId)) as unknown[][];
  if (!Array.isArray(data)) return [];
  const entries = Array.isArray(data[0]) ? (data[0] as unknown[][]) : (data as unknown[][]);
  return entries.map((e, i) => {
    if (!Array.isArray(e)) return null;
    const id = String(e[0] ?? i);
    const title = String(e[1] ?? "Untitled source");
    const rawType = String(e[2] ?? "");
    let type: Source["type"] = "unknown";
    if (rawType.includes("youtube") || rawType.includes("VIDEO")) type = "youtube";
    else if (rawType.includes("PDF")) type = "pdf";
    else if (rawType.includes("URL") || rawType.includes("WEB")) type = "url";
    else if (rawType.includes("TEXT")) type = "text";
    else if (rawType.includes("DRIVE")) type = "drive";
    return { id, title, type };
  }).filter(Boolean) as Source[];
}

export async function addSourceUrl(
  notebookId: string,
  url: string
): Promise<{ success: boolean; message: string }> {
  // params: [notebookId, [[url_type, url_value]]]
  // url_type 1 = website URL
  await rpcCall(RPC.ADD_SOURCE_URL, [notebookId, [[1, url]]], notebookId);
  return { success: true, message: `URL source added: ${url}` };
}

export async function addSourceYouTube(
  notebookId: string,
  youtubeUrl: string
): Promise<{ success: boolean; message: string }> {
  // youtube is type 6 in the API
  await rpcCall(RPC.ADD_SOURCE_URL, [notebookId, [[6, youtubeUrl]]], notebookId);
  return { success: true, message: `YouTube source added: ${youtubeUrl}` };
}

export async function addSourceText(
  notebookId: string,
  content: string,
  title = "Pasted text"
): Promise<{ success: boolean; message: string }> {
  // Text source type 3, params: [notebookId, [[3, content, title]]]
  await rpcCall(RPC.ADD_SOURCE_TEXT, [notebookId, [[3, content, title]]], notebookId);
  return { success: true, message: `Text source "${title}" added.` };
}

export async function removeSource(
  notebookId: string,
  sourceId: string
): Promise<{ success: boolean; message: string }> {
  await rpcCall(RPC.DELETE_SOURCE, [notebookId, sourceId], notebookId);
  return { success: true, message: `Source ${sourceId} removed.` };
}
