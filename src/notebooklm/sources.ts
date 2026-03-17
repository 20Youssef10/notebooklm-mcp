import { withPage, guardAuth } from "../browser";

const BASE_URL = "https://notebooklm.google.com";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Source {
  id: string;
  title: string;
  type: "url" | "pdf" | "text" | "youtube" | "drive" | "unknown";
}

// ─── List Sources ─────────────────────────────────────────────────────────────

export async function listSources(notebookId: string): Promise<Source[]> {
  return withPage(async (page) => {
    await guardAuth(page, `${BASE_URL}/notebook/${notebookId}`);
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);

    const sources = await page.evaluate(() => {
      const items: Array<{ id: string; title: string; type: string }> = [];

      const selectors = [
        "[class*='source-item']",
        "[data-source-id]",
        "[class*='chip']",
        "mat-chip",
        "[role='listitem'][class*='source']",
      ];

      let found = false;
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          els.forEach((el, i) => {
            const id =
              el.getAttribute("data-source-id") ??
              el.getAttribute("data-id") ??
              String(i);
            const title =
              el.querySelector("[class*='title'], [class*='name'], span")?.textContent?.trim() ??
              el.textContent?.trim() ??
              "Untitled source";

            // Guess type from icon or label
            const text = el.textContent ?? "";
            let type: string = "unknown";
            if (text.match(/youtube|youtu\.be/i)) type = "youtube";
            else if (text.match(/drive/i)) type = "drive";
            else if (text.match(/\.pdf/i)) type = "pdf";
            else if (text.match(/http|www\./i)) type = "url";
            else if (el.querySelector("[aria-label*='web'], [class*='web']")) type = "url";

            items.push({ id, title, type });
          });
          found = true;
          break;
        }
      }

      if (!found) {
        // Fallback: count via sidebar heading
        const sidebarText = document
          .querySelector("[class*='source'], [class*='sidebar']")
          ?.textContent?.trim();
        if (sidebarText) {
          items.push({ id: "unknown", title: sidebarText, type: "unknown" });
        }
      }

      return items;
    });

    return sources.map((s) => ({
      ...s,
      type: s.type as Source["type"],
    }));
  });
}

// ─── Add URL Source ───────────────────────────────────────────────────────────

export async function addSourceUrl(
  notebookId: string,
  url: string,
  waitForProcessing = true
): Promise<{ success: boolean; message: string }> {
  return withPage(async (page) => {
    await guardAuth(page, `${BASE_URL}/notebook/${notebookId}`);
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);

    // 1. Click "Add source" button
    const addSourceSelector = [
      "button:has-text('Add source')",
      "button:has-text('Add sources')",
      "[aria-label*='Add source']",
      "[data-test-id='add-source']",
    ].join(", ");

    await page.waitForSelector(addSourceSelector, { timeout: 15_000 });
    await page.click(addSourceSelector);

    // 2. Wait for source modal / dialog
    await page.waitForSelector("mat-dialog-container, dialog, [role='dialog']", {
      timeout: 10_000,
    });

    // 3. Click "Website URL" tab / chip
    const urlTabSelector = [
      "button:has-text('Website URL')",
      "button:has-text('Website')",
      "button:has-text('URL')",
      "button:has-text('Web')",
      "[aria-label*='URL']",
      "mat-tab:has-text('Website')",
    ].join(", ");

    const urlTab = await page.waitForSelector(urlTabSelector, { timeout: 8_000 }).catch(() => null);
    if (urlTab) await urlTab.click();

    // 4. Type the URL into the input
    const urlInputSelector = [
      "input[placeholder*='URL']",
      "input[placeholder*='url']",
      "input[placeholder*='link']",
      "input[placeholder*='http']",
      "input[type='url']",
      "textarea[placeholder*='URL']",
      "mat-dialog-container input",
    ].join(", ");

    const input = await page.waitForSelector(urlInputSelector, { timeout: 10_000 });
    await input.click({ clickCount: 3 });
    await input.fill(url);

    // 5. Click "Insert" / "Add" button
    const insertBtnSelector = [
      "button:has-text('Insert')",
      "button:has-text('Add')",
      "button:has-text('Confirm')",
      "button[type='submit']",
    ].join(", ");

    await page.waitForSelector(insertBtnSelector, { timeout: 5_000 });
    await page.click(insertBtnSelector);

    // 6. Optionally wait for processing to complete
    if (waitForProcessing) {
      // Wait up to 45 s for a "processed" / "ready" indicator
      await page
        .waitForSelector(
          [
            "[class*='processed']",
            "[class*='loaded']",
            "[class*='ready']",
            "[aria-label*='loaded']",
          ].join(", "),
          { timeout: 45_000 }
        )
        .catch(() => undefined);
      // Extra buffer
      await page.waitForTimeout(2_000);
    }

    return { success: true, message: `URL source added: ${url}` };
  });
}

// ─── Add Text Source ──────────────────────────────────────────────────────────

export async function addSourceText(
  notebookId: string,
  content: string,
  title = "Pasted text"
): Promise<{ success: boolean; message: string }> {
  return withPage(async (page) => {
    await guardAuth(page, `${BASE_URL}/notebook/${notebookId}`);
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);

    // 1. Click "Add source"
    const addSourceSelector = [
      "button:has-text('Add source')",
      "button:has-text('Add sources')",
    ].join(", ");

    await page.waitForSelector(addSourceSelector, { timeout: 15_000 });
    await page.click(addSourceSelector);

    await page.waitForSelector("mat-dialog-container, dialog, [role='dialog']", {
      timeout: 10_000,
    });

    // 2. Click "Copied text" / "Paste text" tab
    const textTabSelector = [
      "button:has-text('Copied text')",
      "button:has-text('Paste text')",
      "button:has-text('Text')",
      "mat-tab:has-text('Copied text')",
    ].join(", ");

    const textTab = await page.waitForSelector(textTabSelector, { timeout: 8_000 }).catch(() => null);
    if (textTab) await textTab.click();

    // 3. Fill title (optional field)
    const titleInput = await page
      .$("input[placeholder*='title'], input[placeholder*='Title']")
      .catch(() => null);
    if (titleInput) {
      await titleInput.click({ clickCount: 3 });
      await titleInput.fill(title);
    }

    // 4. Fill content textarea
    const textareaSelector = [
      "textarea[placeholder*='content']",
      "textarea[placeholder*='text']",
      "textarea[placeholder*='paste']",
      "mat-dialog-container textarea",
    ].join(", ");

    const textarea = await page.waitForSelector(textareaSelector, { timeout: 8_000 });
    await textarea.fill(content);

    // 5. Insert
    const insertBtnSelector = [
      "button:has-text('Insert')",
      "button:has-text('Add')",
      "button[type='submit']",
    ].join(", ");

    await page.waitForSelector(insertBtnSelector, { timeout: 5_000 });
    await page.click(insertBtnSelector);

    await page.waitForTimeout(2_000);
    return { success: true, message: `Text source "${title}" added.` };
  });
}

// ─── Add YouTube Source ───────────────────────────────────────────────────────

export async function addSourceYouTube(
  notebookId: string,
  youtubeUrl: string
): Promise<{ success: boolean; message: string }> {
  // YouTube URLs are added the same way as website URLs
  return addSourceUrl(notebookId, youtubeUrl, true);
}

// ─── Remove Source ────────────────────────────────────────────────────────────

export async function removeSource(
  notebookId: string,
  sourceTitleOrId: string
): Promise<{ success: boolean; message: string }> {
  return withPage(async (page) => {
    await guardAuth(page, `${BASE_URL}/notebook/${notebookId}`);
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);

    // Find the source item that matches
    const removed = await page.evaluate((query: string) => {
      const items = document.querySelectorAll(
        "[class*='source-item'], [data-source-id], mat-chip"
      );
      for (const item of Array.from(items)) {
        const text = item.textContent ?? "";
        const id = item.getAttribute("data-source-id") ?? "";
        if (text.includes(query) || id.includes(query)) {
          // Click the delete / remove button inside
          const removeBtn =
            item.querySelector("[aria-label*='remove'], [aria-label*='delete'], button") ??
            null;
          if (removeBtn) {
            (removeBtn as HTMLElement).click();
            return true;
          }
        }
      }
      return false;
    }, sourceTitleOrId);

    if (!removed) {
      throw new Error(`Source matching "${sourceTitleOrId}" not found in notebook.`);
    }

    // Confirm deletion dialog if it appears
    const confirmSelector = "button:has-text('Remove'), button:has-text('Delete')";
    await page
      .waitForSelector(confirmSelector, { timeout: 3_000 })
      .then((btn) => btn.click())
      .catch(() => undefined);

    await page.waitForTimeout(1_500);
    return { success: true, message: `Source "${sourceTitleOrId}" removed.` };
  });
}
