import { rpcCall, RPC } from "../rpc";

const BASE_URL = "https://notebooklm.google.com";

export interface Notebook {
  id: string;
  title: string;
  url: string;
  sourceCount: number;
  updatedAt: string | null;
}

export async function listNotebooks(): Promise<Notebook[]> {
  const data = (await rpcCall(RPC.LIST_NOTEBOOKS, [null])) as unknown[][];
  const notebooks: Notebook[] = [];
  if (!Array.isArray(data)) return notebooks;
  const entries = Array.isArray(data[0]) ? (data[0] as unknown[][]) : (data as unknown[][]);
  for (const entry of entries) {
    if (!Array.isArray(entry)) continue;
    const id = String(entry[2] ?? entry[0] ?? "");
    const title = String(entry[1] ?? "Untitled");
    const sourceCount = typeof entry[6] === "number" ? entry[6] : 0;
    const updatedAt = entry[4] ? String(entry[4]) : null;
    if (!id) continue;
    notebooks.push({ id, title, url: `${BASE_URL}/notebook/${id}`, sourceCount, updatedAt });
  }
  return notebooks;
}

export async function createNotebook(title: string): Promise<Notebook> {
  const data = (await rpcCall(RPC.CREATE_NOTEBOOK, [title, null, null, [2], [1]])) as unknown[];
  const id = String((Array.isArray(data) ? data[0] : null) ?? "");
  if (!id) throw new Error("Failed to create notebook: no ID returned");
  return { id, title, url: `${BASE_URL}/notebook/${id}`, sourceCount: 0, updatedAt: new Date().toISOString() };
}

export async function getNotebook(notebookId: string): Promise<Notebook> {
  const data = (await rpcCall(RPC.GET_NOTEBOOK, [notebookId], notebookId)) as unknown[];
  const title = String((Array.isArray(data) ? data[1] : null) ?? "Untitled");
  const sourceCount = Array.isArray(data) && typeof data[6] === "number" ? data[6] : 0;
  return { id: notebookId, title, url: `${BASE_URL}/notebook/${notebookId}`, sourceCount, updatedAt: null };
}

export async function deleteNotebook(notebookId: string): Promise<void> {
  await rpcCall(RPC.DELETE_NOTEBOOK, [notebookId], notebookId);
}
