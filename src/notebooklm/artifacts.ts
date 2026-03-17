import { rpcCall, RPC } from "../rpc";

export type ArtifactType = "audio" | "quiz" | "flashcards" | "mindmap" | "slideshow" | "study_guide" | "briefing_doc";

export interface ArtifactStatus {
  type: ArtifactType;
  status: "started" | "ready" | "error";
  message: string;
  notebookId: string;
  taskId?: string;
}

// Guide type codes (from notebooklm-py rpc-reference)
const GUIDE_TYPES = {
  study_guide:  1,
  briefing_doc: 2,
  quiz:         3,
  flashcards:   4,
  outline:      5,
} as const;

async function generateGuide(
  notebookId: string,
  guideType: number,
  artifactType: ArtifactType,
  options: Record<string, unknown> = {}
): Promise<ArtifactStatus> {
  const data = (await rpcCall(
    RPC.GENERATE_GUIDE,
    [notebookId, guideType, null, options],
    notebookId
  )) as unknown[];

  const taskId = Array.isArray(data) ? String(data[0] ?? "") : "";

  return {
    type: artifactType,
    status: "started",
    taskId,
    message: `${artifactType} generation started. Task ID: ${taskId}`,
    notebookId,
  };
}

export async function generateAudio(
  notebookId: string,
  instructions = ""
): Promise<ArtifactStatus> {
  const params: unknown[] = [notebookId, null, instructions || null, null, [1]];
  const data = (await rpcCall(RPC.GENERATE_AUDIO, params, notebookId)) as unknown[];
  const taskId = Array.isArray(data) ? String(data[0] ?? "") : "";
  return {
    type: "audio",
    status: "started",
    taskId,
    message:
      `Audio podcast generation started (task: ${taskId}). ` +
      "It typically takes 2–5 minutes. Open NotebookLM to download when ready.",
    notebookId,
  };
}

export async function generateQuiz(
  notebookId: string,
  difficulty: "normal" | "hard" = "normal"
): Promise<ArtifactStatus> {
  return generateGuide(notebookId, GUIDE_TYPES.quiz, "quiz", { difficulty });
}

export async function generateFlashcards(notebookId: string): Promise<ArtifactStatus> {
  return generateGuide(notebookId, GUIDE_TYPES.flashcards, "flashcards");
}

export async function generateMindMap(notebookId: string): Promise<ArtifactStatus> {
  // Mind map uses a separate RPC (GENERATE_OUTLINE)
  const data = (await rpcCall(RPC.GENERATE_OUTLINE, [notebookId], notebookId)) as unknown[];
  const taskId = Array.isArray(data) ? String(data[0] ?? "") : "";
  return {
    type: "mindmap",
    status: "started",
    taskId,
    message: `Mind map generation started (task: ${taskId}). Open NotebookLM to view it.`,
    notebookId,
  };
}

export async function generateSlideshow(notebookId: string): Promise<ArtifactStatus> {
  return generateGuide(notebookId, GUIDE_TYPES.outline, "slideshow");
}

export async function generateStudyGuide(notebookId: string): Promise<ArtifactStatus> {
  return generateGuide(notebookId, GUIDE_TYPES.study_guide, "study_guide");
}

export async function generateBriefingDoc(notebookId: string): Promise<ArtifactStatus> {
  return generateGuide(notebookId, GUIDE_TYPES.briefing_doc, "briefing_doc");
}
