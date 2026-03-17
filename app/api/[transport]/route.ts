import { createMcpHandler } from "mcp-handler";
import { z } from "zod";

// NotebookLM modules
import { listNotebooks, createNotebook, getNotebook, deleteNotebook } from "@/src/notebooklm/notebooks";
import {
  listSources,
  addSourceUrl,
  addSourceText,
  addSourceYouTube,
  removeSource,
} from "@/src/notebooklm/sources";
import { askQuestion, conversation } from "@/src/notebooklm/chat";
import {
  generateAudio,
  generateQuiz,
  generateFlashcards,
  generateMindMap,
  generateSlideshow,
  generateStudyGuide,
  generateBriefingDoc,
} from "@/src/notebooklm/artifacts";

// ─── Helper ───────────────────────────────────────────────────────────────────

function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function err(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text" as const, text: `❌ Error: ${message}` }],
    isError: true,
  };
}

// ─── MCP Handler ─────────────────────────────────────────────────────────────

const handler = createMcpHandler(
  (server) => {
    // ──────────────────────────────────────────────────────
    // NOTEBOOK TOOLS
    // ──────────────────────────────────────────────────────

    server.tool(
      "notebooklm_list_notebooks",
      "List all Google NotebookLM notebooks in the account. Returns notebook IDs, titles, source counts, and URLs.",
      {},
      async () => {
        try {
          const notebooks = await listNotebooks();
          if (notebooks.length === 0) {
            return ok({ message: "No notebooks found.", notebooks: [] });
          }
          return ok({ count: notebooks.length, notebooks });
        } catch (e) {
          return err(e);
        }
      }
    );

    server.tool(
      "notebooklm_create_notebook",
      "Create a new Google NotebookLM notebook with the given title.",
      {
        title: z.string().min(1).max(200).describe("Title for the new notebook"),
      },
      async ({ title }) => {
        try {
          const notebook = await createNotebook(title);
          return ok({ message: `Notebook created successfully.`, notebook });
        } catch (e) {
          return err(e);
        }
      }
    );

    server.tool(
      "notebooklm_get_notebook",
      "Get details about a specific NotebookLM notebook by its ID.",
      {
        notebook_id: z
          .string()
          .min(1)
          .describe("The notebook ID (from the URL: notebooklm.google.com/notebook/{id})"),
      },
      async ({ notebook_id }) => {
        try {
          const notebook = await getNotebook(notebook_id);
          return ok(notebook);
        } catch (e) {
          return err(e);
        }
      }
    );

    server.tool(
      "notebooklm_delete_notebook",
      "Permanently delete a NotebookLM notebook. This action cannot be undone.",
      {
        notebook_id: z.string().min(1).describe("The notebook ID to delete"),
      },
      async ({ notebook_id }) => {
        try {
          await deleteNotebook(notebook_id);
          return ok({ message: `Notebook ${notebook_id} deleted successfully.` });
        } catch (e) {
          return err(e);
        }
      }
    );

    // ──────────────────────────────────────────────────────
    // SOURCE TOOLS
    // ──────────────────────────────────────────────────────

    server.tool(
      "notebooklm_list_sources",
      "List all sources (URLs, PDFs, YouTube videos, etc.) in a notebook.",
      {
        notebook_id: z.string().min(1).describe("The notebook ID"),
      },
      async ({ notebook_id }) => {
        try {
          const sources = await listSources(notebook_id);
          return ok({ count: sources.length, sources });
        } catch (e) {
          return err(e);
        }
      }
    );

    server.tool(
      "notebooklm_add_source_url",
      "Add a website URL or web page as a source to a NotebookLM notebook.",
      {
        notebook_id: z.string().min(1).describe("The notebook ID"),
        url: z.string().url().describe("The website URL to add as a source"),
      },
      async ({ notebook_id, url }) => {
        try {
          const result = await addSourceUrl(notebook_id, url);
          return ok(result);
        } catch (e) {
          return err(e);
        }
      }
    );

    server.tool(
      "notebooklm_add_source_youtube",
      "Add a YouTube video as a source to a NotebookLM notebook.",
      {
        notebook_id: z.string().min(1).describe("The notebook ID"),
        youtube_url: z
          .string()
          .url()
          .describe("The YouTube video URL (e.g. https://youtube.com/watch?v=...)"),
      },
      async ({ notebook_id, youtube_url }) => {
        try {
          const result = await addSourceYouTube(notebook_id, youtube_url);
          return ok(result);
        } catch (e) {
          return err(e);
        }
      }
    );

    server.tool(
      "notebooklm_add_source_text",
      "Add plain text or markdown content as a source to a NotebookLM notebook.",
      {
        notebook_id: z.string().min(1).describe("The notebook ID"),
        content: z
          .string()
          .min(10)
          .max(500_000)
          .describe("The text content to add as a source"),
        title: z
          .string()
          .default("Pasted text")
          .describe("A descriptive title for this text source"),
      },
      async ({ notebook_id, content, title }) => {
        try {
          const result = await addSourceText(notebook_id, content, title);
          return ok(result);
        } catch (e) {
          return err(e);
        }
      }
    );

    server.tool(
      "notebooklm_remove_source",
      "Remove a source from a NotebookLM notebook by its title or ID.",
      {
        notebook_id: z.string().min(1).describe("The notebook ID"),
        source_title_or_id: z
          .string()
          .min(1)
          .describe("The source title or ID to remove (partial match is supported)"),
      },
      async ({ notebook_id, source_title_or_id }) => {
        try {
          const result = await removeSource(notebook_id, source_title_or_id);
          return ok(result);
        } catch (e) {
          return err(e);
        }
      }
    );

    // ──────────────────────────────────────────────────────
    // CHAT / QUERY TOOLS
    // ──────────────────────────────────────────────────────

    server.tool(
      "notebooklm_ask",
      "Ask a question to a NotebookLM notebook and get a grounded answer based on the notebook's sources.",
      {
        notebook_id: z.string().min(1).describe("The notebook ID"),
        question: z
          .string()
          .min(3)
          .max(2000)
          .describe("The question to ask the notebook"),
        timeout_seconds: z
          .number()
          .int()
          .min(10)
          .max(120)
          .default(60)
          .describe("Seconds to wait for a response before timing out"),
      },
      async ({ notebook_id, question, timeout_seconds }) => {
        try {
          const response = await askQuestion(notebook_id, question, timeout_seconds * 1000);
          return ok(response);
        } catch (e) {
          return err(e);
        }
      }
    );

    server.tool(
      "notebooklm_conversation",
      "Ask multiple questions sequentially in the same NotebookLM notebook session. Useful for multi-turn research.",
      {
        notebook_id: z.string().min(1).describe("The notebook ID"),
        questions: z
          .array(z.string().min(3))
          .min(1)
          .max(10)
          .describe("List of questions to ask in order"),
      },
      async ({ notebook_id, questions }) => {
        try {
          const responses = await conversation(notebook_id, questions);
          const pairs = questions.map((q, i) => ({
            question: q,
            answer: responses[i]?.answer ?? "No response",
            citations: responses[i]?.citations ?? [],
          }));
          return ok({ turns: pairs });
        } catch (e) {
          return err(e);
        }
      }
    );

    // ──────────────────────────────────────────────────────
    // ARTIFACT GENERATION TOOLS
    // ──────────────────────────────────────────────────────

    server.tool(
      "notebooklm_generate_audio",
      "Generate an Audio Overview (podcast-style conversation) from a NotebookLM notebook. Returns immediately — generation takes 2–5 minutes in the background.",
      {
        notebook_id: z.string().min(1).describe("The notebook ID"),
        instructions: z
          .string()
          .max(500)
          .default("")
          .describe("Optional instructions for customizing the audio (e.g. 'Focus on key concepts for beginners')"),
      },
      async ({ notebook_id, instructions }) => {
        try {
          const status = await generateAudio(notebook_id, instructions);
          return ok(status);
        } catch (e) {
          return err(e);
        }
      }
    );

    server.tool(
      "notebooklm_generate_quiz",
      "Generate a quiz from a NotebookLM notebook's sources.",
      {
        notebook_id: z.string().min(1).describe("The notebook ID"),
        difficulty: z
          .enum(["normal", "hard"])
          .default("normal")
          .describe("Quiz difficulty level"),
      },
      async ({ notebook_id, difficulty }) => {
        try {
          const status = await generateQuiz(notebook_id, difficulty);
          return ok(status);
        } catch (e) {
          return err(e);
        }
      }
    );

    server.tool(
      "notebooklm_generate_flashcards",
      "Generate study flashcards from a NotebookLM notebook.",
      {
        notebook_id: z.string().min(1).describe("The notebook ID"),
      },
      async ({ notebook_id }) => {
        try {
          const status = await generateFlashcards(notebook_id);
          return ok(status);
        } catch (e) {
          return err(e);
        }
      }
    );

    server.tool(
      "notebooklm_generate_mindmap",
      "Generate a mind map from a NotebookLM notebook's sources.",
      {
        notebook_id: z.string().min(1).describe("The notebook ID"),
      },
      async ({ notebook_id }) => {
        try {
          const status = await generateMindMap(notebook_id);
          return ok(status);
        } catch (e) {
          return err(e);
        }
      }
    );

    server.tool(
      "notebooklm_generate_slideshow",
      "Generate a slide deck / presentation from a NotebookLM notebook.",
      {
        notebook_id: z.string().min(1).describe("The notebook ID"),
      },
      async ({ notebook_id }) => {
        try {
          const status = await generateSlideshow(notebook_id);
          return ok(status);
        } catch (e) {
          return err(e);
        }
      }
    );

    server.tool(
      "notebooklm_generate_study_guide",
      "Generate a study guide from a NotebookLM notebook.",
      {
        notebook_id: z.string().min(1).describe("The notebook ID"),
      },
      async ({ notebook_id }) => {
        try {
          const status = await generateStudyGuide(notebook_id);
          return ok(status);
        } catch (e) {
          return err(e);
        }
      }
    );

    server.tool(
      "notebooklm_generate_briefing",
      "Generate a briefing document that summarizes the key points from all sources in a NotebookLM notebook.",
      {
        notebook_id: z.string().min(1).describe("The notebook ID"),
      },
      async ({ notebook_id }) => {
        try {
          const status = await generateBriefingDoc(notebook_id);
          return ok(status);
        } catch (e) {
          return err(e);
        }
      }
    );

    // ──────────────────────────────────────────────────────
    // UTILITY TOOLS
    // ──────────────────────────────────────────────────────

    server.tool(
      "notebooklm_health_check",
      "Check if the NotebookLM MCP server env vars are set and the Google session is valid by listing notebooks.",
      {},
      async () => {
        try {
          const raw = process.env.NOTEBOOKLM_STORAGE_STATE;
          if (!raw) throw new Error("NOTEBOOKLM_STORAGE_STATE is not set.");
          const browserlessToken = process.env.BROWSERLESS_TOKEN;
          if (!browserlessToken) throw new Error("BROWSERLESS_TOKEN is not set.");

          // Parse cookies
          const storageState = JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
          const cookieCount = storageState.cookies?.length ?? 0;

          // Try listing notebooks to validate the session
          const notebooks = await listNotebooks();

          return ok({
            status: "healthy",
            session: { cookies: cookieCount, valid: true },
            browserless: { configured: true },
            notebooks: { count: notebooks.length },
          });
        } catch (e) {
          return err(e);
        }
      }
    );
  },
  {},
  {
    basePath: "/api",
    maxDuration: 60,
    verboseLogs: process.env.NODE_ENV === "development",
  }
);

export { handler as GET, handler as POST };
