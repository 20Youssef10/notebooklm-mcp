export default function Home() {
  return (
    <main style={{ fontFamily: "monospace", padding: "2rem", maxWidth: 640 }}>
      <h1>NotebookLM MCP Server</h1>
      <p>
        This is a remote{" "}
        <a href="https://modelcontextprotocol.io">Model Context Protocol</a> server
        for Google NotebookLM.
      </p>
      <h2>MCP Endpoint</h2>
      <code
        style={{
          display: "block",
          background: "#111",
          color: "#0f0",
          padding: "1rem",
          borderRadius: 6,
        }}
      >
        {typeof window !== "undefined" ? window.location.origin : ""}/api/mcp
      </code>
      <h2>Available Tools (16)</h2>
      <ul>
        <li>notebooklm_list_notebooks</li>
        <li>notebooklm_create_notebook</li>
        <li>notebooklm_get_notebook</li>
        <li>notebooklm_delete_notebook</li>
        <li>notebooklm_list_sources</li>
        <li>notebooklm_add_source_url</li>
        <li>notebooklm_add_source_youtube</li>
        <li>notebooklm_add_source_text</li>
        <li>notebooklm_remove_source</li>
        <li>notebooklm_ask</li>
        <li>notebooklm_conversation</li>
        <li>notebooklm_generate_audio</li>
        <li>notebooklm_generate_quiz</li>
        <li>notebooklm_generate_flashcards</li>
        <li>notebooklm_generate_mindmap</li>
        <li>notebooklm_generate_slideshow</li>
        <li>notebooklm_generate_study_guide</li>
        <li>notebooklm_generate_briefing</li>
        <li>notebooklm_health_check</li>
      </ul>
    </main>
  );
}
