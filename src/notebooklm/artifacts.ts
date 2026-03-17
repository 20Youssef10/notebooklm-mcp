import { withPage, guardAuth } from "../browser";

const BASE_URL = "https://notebooklm.google.com";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ArtifactType =
  | "audio"
  | "quiz"
  | "flashcards"
  | "mindmap"
  | "slideshow"
  | "study_guide"
  | "briefing_doc"
  | "table_of_contents";

export interface ArtifactStatus {
  type: ArtifactType;
  status: "started" | "generating" | "ready" | "error";
  message: string;
  notebookId: string;
}

// ─── Generic Studio/Generate helper ──────────────────────────────────────────

/**
 * Click a "Generate" button whose label matches one of the given texts.
 * Returns true if the button was found and clicked.
 */
async function clickGenerateButton(
  page: import("playwright-core").Page,
  labelPatterns: string[]
): Promise<boolean> {
  const selector = labelPatterns
    .flatMap((p) => [
      `button:has-text('${p}')`,
      `[aria-label*='${p}']`,
      `mat-menu-item:has-text('${p}')`,
      `[role='menuitem']:has-text('${p}')`,
    ])
    .join(", ");

  const btn = await page.waitForSelector(selector, { timeout: 12_000 }).catch(() => null);
  if (!btn) return false;

  await btn.click();
  return true;
}

/**
 * Click the "Studio" / "Generate" panel button to open the generation menu.
 */
async function openStudioMenu(page: import("playwright-core").Page): Promise<void> {
  const studioSelector = [
    "button:has-text('Studio')",
    "button:has-text('Generate')",
    "[aria-label*='Studio']",
    "[aria-label*='Generate']",
    "[data-test-id='studio-button']",
    "button:has(mat-icon:has-text('add_circle'))",
  ].join(", ");

  const studioBtn = await page.waitForSelector(studioSelector, { timeout: 15_000 });
  await studioBtn.click();

  // Small pause so the menu/panel animates in
  await page.waitForTimeout(800);
}

// ─── Audio (Podcast) ──────────────────────────────────────────────────────────

export async function generateAudio(
  notebookId: string,
  instructions = ""
): Promise<ArtifactStatus> {
  return withPage(async (page) => {
    await guardAuth(page, `${BASE_URL}/notebook/${notebookId}`);
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);

    await openStudioMenu(page);

    // Click "Audio Overview" generate button
    const found = await clickGenerateButton(page, ["Audio Overview", "Audio", "Podcast"]);
    if (!found) {
      throw new Error('Could not find "Audio Overview" button. The NotebookLM UI may have changed.');
    }

    // If there is an instructions input, fill it
    if (instructions) {
      const instrInput = await page
        .$("textarea[placeholder*='instruction'], textarea[placeholder*='custom']")
        .catch(() => null);
      if (instrInput) {
        await instrInput.fill(instructions);
      }
    }

    // Click the final "Generate" / "Create" button in the confirmation modal
    const confirmFound = await clickGenerateButton(page, ["Generate", "Create", "Start"]);
    if (!confirmFound) {
      // The first click might have already started generation
      await page.waitForTimeout(1_000);
    }

    return {
      type: "audio",
      status: "started",
      message:
        "Audio podcast generation started. It typically takes 2–5 minutes. " +
        "Open the notebook in NotebookLM to download when ready.",
      notebookId,
    };
  });
}

// ─── Quiz ─────────────────────────────────────────────────────────────────────

export async function generateQuiz(
  notebookId: string,
  difficulty: "normal" | "hard" = "normal"
): Promise<ArtifactStatus> {
  return withPage(async (page) => {
    await guardAuth(page, `${BASE_URL}/notebook/${notebookId}`);
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);

    await openStudioMenu(page);

    const found = await clickGenerateButton(page, ["Quiz", "Practice Quiz"]);
    if (!found) throw new Error('Could not find "Quiz" button.');

    // Set difficulty if there is an option
    if (difficulty === "hard") {
      const hardBtn = await page
        .$("button:has-text('Hard'), mat-option:has-text('Hard')")
        .catch(() => null);
      if (hardBtn) await hardBtn.click();
    }

    await clickGenerateButton(page, ["Generate", "Create", "Start"]).catch(() => undefined);

    // Wait a moment to collect quiz content (quizzes generate faster than audio)
    await page.waitForTimeout(8_000);

    // Try to extract quiz text if available inline
    const quizContent = await page
      .evaluate(() => {
        const quizEl =
          document.querySelector("[class*='quiz'], [data-test-id='quiz']") ?? null;
        return quizEl?.textContent?.trim() ?? null;
      })
      .catch(() => null);

    return {
      type: "quiz",
      status: quizContent ? "ready" : "started",
      message: quizContent
        ? `Quiz generated:\n\n${quizContent}`
        : "Quiz generation started. Open the notebook in NotebookLM to view it.",
      notebookId,
    };
  });
}

// ─── Flashcards ───────────────────────────────────────────────────────────────

export async function generateFlashcards(notebookId: string): Promise<ArtifactStatus> {
  return withPage(async (page) => {
    await guardAuth(page, `${BASE_URL}/notebook/${notebookId}`);
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);

    await openStudioMenu(page);

    const found = await clickGenerateButton(page, ["Flashcards", "Flash cards"]);
    if (!found) throw new Error('Could not find "Flashcards" button.');

    await clickGenerateButton(page, ["Generate", "Create"]).catch(() => undefined);
    await page.waitForTimeout(8_000);

    const content = await page
      .evaluate(() =>
        document
          .querySelector("[class*='flashcard'], [data-test-id='flashcards']")
          ?.textContent?.trim() ?? null
      )
      .catch(() => null);

    return {
      type: "flashcards",
      status: content ? "ready" : "started",
      message: content
        ? `Flashcards generated:\n\n${content}`
        : "Flashcard generation started. Open the notebook in NotebookLM to view them.",
      notebookId,
    };
  });
}

// ─── Mind Map ─────────────────────────────────────────────────────────────────

export async function generateMindMap(notebookId: string): Promise<ArtifactStatus> {
  return withPage(async (page) => {
    await guardAuth(page, `${BASE_URL}/notebook/${notebookId}`);
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);

    await openStudioMenu(page);

    const found = await clickGenerateButton(page, ["Mind map", "Mind Map", "MindMap"]);
    if (!found) throw new Error('Could not find "Mind map" button.');

    await clickGenerateButton(page, ["Generate", "Create"]).catch(() => undefined);
    await page.waitForTimeout(5_000);

    return {
      type: "mindmap",
      status: "started",
      message:
        "Mind map generation started. Open the notebook in NotebookLM to view and export it.",
      notebookId,
    };
  });
}

// ─── Slide Deck ───────────────────────────────────────────────────────────────

export async function generateSlideshow(notebookId: string): Promise<ArtifactStatus> {
  return withPage(async (page) => {
    await guardAuth(page, `${BASE_URL}/notebook/${notebookId}`);
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);

    await openStudioMenu(page);

    const found = await clickGenerateButton(page, [
      "Slides",
      "Slide deck",
      "Slideshow",
      "Presentation",
    ]);
    if (!found) throw new Error('Could not find "Slides" button.');

    await clickGenerateButton(page, ["Generate", "Create"]).catch(() => undefined);
    await page.waitForTimeout(5_000);

    return {
      type: "slideshow",
      status: "started",
      message:
        "Slideshow generation started. Open the notebook in NotebookLM to view and export it.",
      notebookId,
    };
  });
}

// ─── Study Guide ──────────────────────────────────────────────────────────────

export async function generateStudyGuide(notebookId: string): Promise<ArtifactStatus> {
  return withPage(async (page) => {
    await guardAuth(page, `${BASE_URL}/notebook/${notebookId}`);
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);

    await openStudioMenu(page);

    const found = await clickGenerateButton(page, ["Study guide", "Study Guide"]);
    if (!found) throw new Error('Could not find "Study guide" button.');

    await clickGenerateButton(page, ["Generate", "Create"]).catch(() => undefined);
    await page.waitForTimeout(8_000);

    const content = await page
      .evaluate(() =>
        document
          .querySelector("[class*='study-guide'], [data-test-id='study-guide']")
          ?.textContent?.trim() ?? null
      )
      .catch(() => null);

    return {
      type: "study_guide",
      status: content ? "ready" : "started",
      message: content
        ? `Study guide:\n\n${content}`
        : "Study guide generation started. Open the notebook to view it.",
      notebookId,
    };
  });
}

// ─── Briefing Document ───────────────────────────────────────────────────────

export async function generateBriefingDoc(notebookId: string): Promise<ArtifactStatus> {
  return withPage(async (page) => {
    await guardAuth(page, `${BASE_URL}/notebook/${notebookId}`);
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);

    await openStudioMenu(page);

    const found = await clickGenerateButton(page, [
      "Briefing doc",
      "Briefing",
      "Briefing document",
    ]);
    if (!found) throw new Error('Could not find "Briefing doc" button.');

    await clickGenerateButton(page, ["Generate", "Create"]).catch(() => undefined);
    await page.waitForTimeout(8_000);

    const content = await page
      .evaluate(() =>
        document
          .querySelector("[class*='briefing'], [data-test-id='briefing']")
          ?.textContent?.trim() ?? null
      )
      .catch(() => null);

    return {
      type: "briefing_doc",
      status: content ? "ready" : "started",
      message: content
        ? `Briefing document:\n\n${content}`
        : "Briefing document generation started. Open the notebook to view it.",
      notebookId,
    };
  });
}
