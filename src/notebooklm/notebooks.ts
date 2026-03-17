import { withPage, guardAuth } from "../browser";

const BASE_URL = "https://notebooklm.google.com";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Notebook {
  id: string;
  title: string;
  url: string;
  sourceCount: number;
  updatedAt: string | null;
}

// ─── List Notebooks ───────────────────────────────────────────────────────────

export async function listNotebooks(): Promise<Notebook[]> {
  return withPage(async (page) => {
    await guardAuth(page, BASE_URL);

    // Wait for notebook cards to render (Angular / SPA)
    await page
      .waitForSelector("a[href*='/notebook/'], [data-test-id='notebook-card']", {
        timeout: 20_000,
      })
      .catch(() => undefined);

    const notebooks = await page.evaluate(() => {
      const results: Array<{
        id: string;
        title: string;
        url: string;
        sourceCount: number;
        updatedAt: string | null;
      }> = [];

      // Collect all anchors pointing to a notebook URL
      document.querySelectorAll<HTMLAnchorElement>("a[href*='/notebook/']").forEach((a) => {
        const match = a.href.match(/\/notebook\/([^/?#]+)/);
        if (!match) return;
        const id = match[1];
        if (results.find((r) => r.id === id)) return; // deduplicate

        // Walk up to find the card container
        const card =
          a.closest("[class*='notebook']") ??
          a.closest("mat-card, [class*='card'], li, article") ??
          a;

        const titleEl =
          card.querySelector("h2, h3, [class*='title'], [class*='name']") ?? a;
        const title = titleEl.textContent?.trim() || "Untitled";

        // Try to find source count (e.g. "3 sources")
        const meta = card.textContent ?? "";
        const srcMatch = meta.match(/(\d+)\s+source/i);
        const sourceCount = srcMatch ? parseInt(srcMatch[1], 10) : 0;

        // Try to find date string
        const dateEl = card.querySelector("time, [class*='date'], [class*='time']");
        const updatedAt = dateEl?.textContent?.trim() ?? null;

        results.push({ id, title, url: a.href, sourceCount, updatedAt });
      });

      return results;
    });

    return notebooks;
  });
}

// ─── Create Notebook ──────────────────────────────────────────────────────────

export async function createNotebook(title: string): Promise<Notebook> {
  return withPage(async (page) => {
    await guardAuth(page, BASE_URL);

    // Click "New notebook" button (multiple possible selectors)
    const newBtnSelector = [
      "button:has-text('New notebook')",
      "button:has-text('Create notebook')",
      "[aria-label*='New notebook']",
      "[data-test-id='create-notebook']",
      "button.new-notebook",
    ].join(", ");

    await page.waitForSelector(newBtnSelector, { timeout: 15_000 });
    await page.click(newBtnSelector);

    // Wait for dialog / input field
    const titleInputSelector = [
      "input[placeholder*='Notebook title']",
      "input[placeholder*='title']",
      "input[aria-label*='title']",
      "mat-dialog-container input",
      "dialog input",
    ].join(", ");

    const titleInput = await page.waitForSelector(titleInputSelector, { timeout: 10_000 });

    // Clear any existing text then type the title
    await titleInput.click({ clickCount: 3 });
    await titleInput.type(title, { delay: 60 });

    // Confirm with Enter or a "Create" button
    const confirmBtnSelector = [
      "button:has-text('Create')",
      "button:has-text('Done')",
      "button[type='submit']",
      "[mat-raised-button]:has-text('Create')",
    ].join(", ");

    const confirmBtn = await page
      .waitForSelector(confirmBtnSelector, { timeout: 5_000 })
      .catch(() => null);

    if (confirmBtn) {
      await confirmBtn.click();
    } else {
      await page.keyboard.press("Enter");
    }

    // Wait for navigation to the new notebook page
    await page.waitForURL(/\/notebook\//, { timeout: 20_000 });

    const newUrl = page.url();
    const idMatch = newUrl.match(/\/notebook\/([^/?#]+)/);
    const id = idMatch?.[1] ?? "unknown";

    return {
      id,
      title,
      url: newUrl,
      sourceCount: 0,
      updatedAt: new Date().toISOString(),
    };
  });
}

// ─── Get Notebook Info ────────────────────────────────────────────────────────

export async function getNotebook(notebookId: string): Promise<Notebook> {
  const url = `${BASE_URL}/notebook/${notebookId}`;

  return withPage(async (page) => {
    await guardAuth(page, url);

    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);

    const info = await page.evaluate(() => {
      const titleEl =
        document.querySelector<HTMLElement>("[class*='notebook-title'], h1, h2") ??
        null;
      const title = titleEl?.textContent?.trim() ?? document.title;

      // Count source chips / items
      const sourcesCount = document.querySelectorAll(
        "[class*='source-item'], [data-source-id], [class*='chip']"
      ).length;

      return { title, sourceCount: sourcesCount };
    });

    return {
      id: notebookId,
      title: info.title,
      url,
      sourceCount: info.sourceCount,
      updatedAt: null,
    };
  });
}

// ─── Delete Notebook ──────────────────────────────────────────────────────────

export async function deleteNotebook(notebookId: string): Promise<void> {
  return withPage(async (page) => {
    await guardAuth(page, BASE_URL);

    // Find the notebook card and open its context menu
    const cardSelector = `a[href*='/notebook/${notebookId}']`;
    await page.waitForSelector(cardSelector, { timeout: 15_000 });

    // Right-click or click the kebab menu
    const card = await page.$(cardSelector);
    if (!card) throw new Error(`Notebook ${notebookId} not found`);

    // Hover the card anchor to reveal the kebab / options button
    await card.hover();

    const menuBtnSelector = [
      "[aria-label*='more'], [aria-label*='options'], [aria-label*='menu']",
      "button[mat-icon-button]",
      "button:has(mat-icon)",
    ].join(", ");

    const menuBtn = await page.waitForSelector(menuBtnSelector, { timeout: 5_000 });
    await menuBtn.click();

    // Click "Delete" in the dropdown
    const deleteBtnSelector = [
      "[role='menuitem']:has-text('Delete')",
      "button:has-text('Delete')",
      "mat-menu-item:has-text('Delete')",
    ].join(", ");

    await page.waitForSelector(deleteBtnSelector, { timeout: 5_000 });
    await page.click(deleteBtnSelector);

    // Confirm the delete dialog
    const confirmDeleteSelector = [
      "button:has-text('Delete')",
      "button:has-text('Confirm')",
      "button[cdkfocusinitial]",
    ].join(", ");

    await page
      .waitForSelector(confirmDeleteSelector, { timeout: 5_000 })
      .then((btn) => btn.click())
      .catch(() => page.keyboard.press("Enter"));

    await page.waitForTimeout(2_000);
  });
}
