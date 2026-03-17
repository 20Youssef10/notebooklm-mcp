/**
 * Chat uses a streaming RPC endpoint separate from batchexecute.
 * POST /_/LabsTailwindUi/data/google.internal.labs.tailwind.orchestration.v1.LabsTailwindOrchestrationService/GenerateFreeFormStreamed
 */
import { getAuthTokens } from "../rpc";

const CHAT_URL =
  "https://notebooklm.google.com/_/LabsTailwindUi/data/google.internal.labs.tailwind.orchestration.v1.LabsTailwindOrchestrationService/GenerateFreeFormStreamed";

export interface ChatResponse {
  answer: string;
  citations: string[];
}

export async function askQuestion(
  notebookId: string,
  question: string
): Promise<ChatResponse> {
  const auth = await getAuthTokens();

  // Build the streaming request payload
  const payload = JSON.stringify([
    question,
    null,
    notebookId,
    null,
    null,
    null,
    null,
    null,
    [1],
  ]);

  const body = `f.req=${encodeURIComponent(JSON.stringify([[payload]]))}`;

  const response = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      Cookie: auth.cookies,
      Referer: `https://notebooklm.google.com/notebook/${notebookId}`,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
    },
    body: `${body}&at=${encodeURIComponent(auth.csrfToken)}&`,
  });

  if (!response.ok) {
    throw new Error(`Chat request failed: HTTP ${response.status}`);
  }

  const text = await response.text();

  // Parse streaming response — find the last complete JSON chunk with text
  const lines = text.split("\n").filter((l) => l.startsWith("["));
  let answer = "";
  const citations: string[] = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as unknown[][];
      // Walk through looking for text content
      const walk = (obj: unknown): void => {
        if (typeof obj === "string" && obj.length > 20 && !obj.startsWith("http")) {
          if (obj.length > answer.length) answer = obj;
        }
        if (Array.isArray(obj)) obj.forEach(walk);
      };
      walk(parsed);
    } catch {
      continue;
    }
  }

  if (!answer) {
    // Fallback: return raw text excerpt
    answer = text.slice(0, 500).replace(/[^\w\s.,?!-]/g, "").trim();
  }

  return { answer, citations };
}

export async function conversation(
  notebookId: string,
  questions: string[]
): Promise<ChatResponse[]> {
  const results: ChatResponse[] = [];
  for (const q of questions) {
    const r = await askQuestion(notebookId, q);
    results.push(r);
    // Small delay between questions to avoid rate limiting
    await new Promise((res) => setTimeout(res, 1500));
  }
  return results;
}
