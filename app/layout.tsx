import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NotebookLM MCP Server",
  description: "MCP server for Google NotebookLM via Browserless.io",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
