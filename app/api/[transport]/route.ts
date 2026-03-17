import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { buildAuthTokens } from "@/src/notebooklm/rpc";
import {
  listNotebooks, createNotebook, getNotebook, deleteNotebook, renameNotebook,
  listSources, addSourceUrl, addSourceText, deleteSource, getNotebookSummary,
  generateAudio, generateQuiz, generateStudyGuide, generateBriefingDoc,
  generateFlashcards, generateMindMap, generateSlideshow, listArtifacts,
} from "@/src/notebooklm/api";

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function err(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return { content: [{ type: "text" as const, text: `❌ Error: ${msg}` }], isError: true };
}

const handler = createMcpHandler(
  (server) => {
    server.tool("notebooklm_list_notebooks", "List all Google NotebookLM notebooks.", {}, async () => {
      try { const auth = await buildAuthTokens(); return ok({ notebooks: await listNotebooks(auth) }); } catch (e) { return err(e); }
    });

    server.tool("notebooklm_create_notebook", "Create a new NotebookLM notebook.",
      { title: z.string().min(1).describe("Notebook title") },
      async (params: { title: string }) => {
        try { const auth = await buildAuthTokens(); return ok({ notebook: await createNotebook(auth, params.title) }); } catch (e) { return err(e); }
      }
    );

    server.tool("notebooklm_get_notebook", "Get a NotebookLM notebook by ID.",
      { notebook_id: z.string().min(1).describe("Notebook ID") },
      async (params: { notebook_id: string }) => {
        try { const auth = await buildAuthTokens(); return ok(await getNotebook(auth, params.notebook_id)); } catch (e) { return err(e); }
      }
    );

    server.tool("notebooklm_delete_notebook", "Delete a NotebookLM notebook permanently.",
      { notebook_id: z.string().min(1).describe("Notebook ID") },
      async (params: { notebook_id: string }) => {
        try { const auth = await buildAuthTokens(); await deleteNotebook(auth, params.notebook_id); return ok({ message: "Deleted." }); } catch (e) { return err(e); }
      }
    );

    server.tool("notebooklm_rename_notebook", "Rename a NotebookLM notebook.",
      { notebook_id: z.string().min(1), new_title: z.string().min(1) },
      async (params: { notebook_id: string; new_title: string }) => {
        try { const auth = await buildAuthTokens(); await renameNotebook(auth, params.notebook_id, params.new_title); return ok({ message: `Renamed to "${params.new_title}".` }); } catch (e) { return err(e); }
      }
    );

    server.tool("notebooklm_list_sources", "List all sources in a notebook.",
      { notebook_id: z.string().min(1) },
      async (params: { notebook_id: string }) => {
        try { const auth = await buildAuthTokens(); return ok({ sources: await listSources(auth, params.notebook_id) }); } catch (e) { return err(e); }
      }
    );

    server.tool("notebooklm_add_source_url", "Add a URL or YouTube video as a notebook source.",
      { notebook_id: z.string().min(1), url: z.string().url() },
      async (params: { notebook_id: string; url: string }) => {
        try { const auth = await buildAuthTokens(); return ok(await addSourceUrl(auth, params.notebook_id, params.url)); } catch (e) { return err(e); }
      }
    );

    server.tool("notebooklm_add_source_text", "Add plain text as a notebook source.",
      { notebook_id: z.string().min(1), content: z.string().min(10), title: z.string().default("Pasted text") },
      async (params: { notebook_id: string; content: string; title: string }) => {
        try { const auth = await buildAuthTokens(); return ok(await addSourceText(auth, params.notebook_id, params.content, params.title)); } catch (e) { return err(e); }
      }
    );

    server.tool("notebooklm_delete_source", "Delete a source from a notebook.",
      { notebook_id: z.string().min(1), source_id: z.string().min(1) },
      async (params: { notebook_id: string; source_id: string }) => {
        try { const auth = await buildAuthTokens(); return ok(await deleteSource(auth, params.notebook_id, params.source_id)); } catch (e) { return err(e); }
      }
    );

    server.tool("notebooklm_get_summary", "Get AI-generated summary of a notebook.",
      { notebook_id: z.string().min(1) },
      async (params: { notebook_id: string }) => {
        try { const auth = await buildAuthTokens(); return ok({ summary: await getNotebookSummary(auth, params.notebook_id), url: `https://notebooklm.google.com/notebook/${params.notebook_id}` }); } catch (e) { return err(e); }
      }
    );

    server.tool("notebooklm_generate_audio", "Generate an Audio Overview podcast from a notebook.",
      { notebook_id: z.string().min(1), instructions: z.string().default("") },
      async (params: { notebook_id: string; instructions: string }) => {
        try { const auth = await buildAuthTokens(); return ok(await generateAudio(auth, params.notebook_id, params.instructions)); } catch (e) { return err(e); }
      }
    );

    server.tool("notebooklm_generate_quiz", "Generate a quiz from a notebook.",
      { notebook_id: z.string().min(1) },
      async (params: { notebook_id: string }) => {
        try { const auth = await buildAuthTokens(); return ok(await generateQuiz(auth, params.notebook_id)); } catch (e) { return err(e); }
      }
    );

    server.tool("notebooklm_generate_study_guide", "Generate a study guide from a notebook.",
      { notebook_id: z.string().min(1) },
      async (params: { notebook_id: string }) => {
        try { const auth = await buildAuthTokens(); return ok(await generateStudyGuide(auth, params.notebook_id)); } catch (e) { return err(e); }
      }
    );

    server.tool("notebooklm_generate_briefing", "Generate a briefing document from a notebook.",
      { notebook_id: z.string().min(1) },
      async (params: { notebook_id: string }) => {
        try { const auth = await buildAuthTokens(); return ok(await generateBriefingDoc(auth, params.notebook_id)); } catch (e) { return err(e); }
      }
    );

    server.tool("notebooklm_generate_flashcards", "Generate flashcards from a notebook.",
      { notebook_id: z.string().min(1) },
      async (params: { notebook_id: string }) => {
        try { const auth = await buildAuthTokens(); return ok(await generateFlashcards(auth, params.notebook_id)); } catch (e) { return err(e); }
      }
    );

    server.tool("notebooklm_generate_mindmap", "Generate a mind map from a notebook.",
      { notebook_id: z.string().min(1) },
      async (params: { notebook_id: string }) => {
        try { const auth = await buildAuthTokens(); return ok(await generateMindMap(auth, params.notebook_id)); } catch (e) { return err(e); }
      }
    );

    server.tool("notebooklm_generate_slideshow", "Generate a slide deck from a notebook.",
      { notebook_id: z.string().min(1) },
      async (params: { notebook_id: string }) => {
        try { const auth = await buildAuthTokens(); return ok(await generateSlideshow(auth, params.notebook_id)); } catch (e) { return err(e); }
      }
    );

    server.tool("notebooklm_list_artifacts", "List all generated artifacts in a notebook.",
      { notebook_id: z.string().min(1) },
      async (params: { notebook_id: string }) => {
        try { const auth = await buildAuthTokens(); return ok({ artifacts: await listArtifacts(auth, params.notebook_id) }); } catch (e) { return err(e); }
      }
    );

    server.tool("notebooklm_probe_rpc", "Diagnostic: test a raw RPC call and return the response. Used to discover correct params.",
      {
        method_id: z.string().describe("RPC method ID e.g. YEiWtc"),
        params_json: z.string().describe("JSON array of params e.g. [\"My Title\"]"),
      },
      async (p: { method_id: string; params_json: string }) => {
        try {
          const { buildAuthTokens } = await import("@/src/notebooklm/rpc");
          const { callRaw } = await import("@/src/notebooklm/api");
          const auth = await buildAuthTokens();
          const params = JSON.parse(p.params_json) as unknown[];
          const result = await callRaw(auth, p.method_id, params);
          return ok({ raw: result });
        } catch (e) { return err(e); }
      }
    );

    server.tool("notebooklm_health_check", "Verify authentication and API connectivity.", {}, async () => {
      try {
        const auth = await buildAuthTokens();
        const notebooks = await listNotebooks(auth);
        return ok({
          status: "healthy",
          cookieCount: auth.cookieHeader.split(";").length,
          hasSapisidHash: auth.sapisidHash.length > 0,
          notebookCount: notebooks.length,
          approach: "Direct Google batchexecute RPC — no browser needed",
        });
      } catch (e) { return err(e); }
    });
  },
  {},
  { basePath: "/api", maxDuration: 60 }
);

export { handler as GET, handler as POST };
