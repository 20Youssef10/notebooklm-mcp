import { withPage, guardAuth } from "../browser";

const BASE_URL = "https://notebooklm.google.com";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  answer: string;
  citations: string[];
}

// ─── Ask a single question ────────────────────────────────────────────────────

export async function askQuestion(
  notebookId: string,
  question: string,
  timeoutMs = 60_000
): Promise<ChatResponse> {
  return withPage(async (page) => {
    await guardAuth(page, `${BASE_URL}/notebook/${notebookId}`);
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);

    // Find the chat input
    const inputSelector = [
      "textarea[placeholder*='Ask']",
      "textarea[placeholder*='ask']",
      "textarea[placeholder*='question']",
      "[contenteditable='true'][class*='chat']",
      "[contenteditable='true'][aria-label*='Ask']",
      "[data-test-id='chat-input']",
      "form textarea",
    ].join(", ");

    const chatInput = await page.waitForSelector(inputSelector, { timeout: 20_000 });

    // Type the question
    await chatInput.click();
    await chatInput.fill(question);

    // Count existing responses BEFORE sending
    const beforeCount = await page
      .$$eval("[class*='response'], [class*='answer'], [class*='assistant']", (els) => els.length)
      .catch(() => 0);

    // Send: try submit button first, then Enter
    const submitSelector = [
      "button[aria-label*='Send']",
      "button[aria-label*='submit']",
      "button[type='submit']",
      "button:has(mat-icon:has-text('send'))",
      "[data-test-id='send-button']",
    ].join(", ");

    const submitBtn = await page.$(submitSelector);
    if (submitBtn) {
      await submitBtn.click();
    } else {
      await page.keyboard.press("Enter");
    }

    // Wait for a NEW response to appear (poll until count increases)
    const deadline = Date.now() + timeoutMs;
    let answerEl: import("playwright-core").Locator | null = null;

    while (Date.now() < deadline) {
      await page.waitForTimeout(1_500);

      const afterCount = await page
        .$$eval("[class*='response'], [class*='answer'], [class*='assistant']", (els) => els.length)
        .catch(() => 0);

      if (afterCount > beforeCount) {
        // Grab the last response element
        const responses = page.locator("[class*='response'], [class*='answer'], [class*='assistant']");
        answerEl = responses.last();
        break;
      }

      // Also check for a "typing" indicator disappearing
      const isTyping = await page
        .$("[class*='typing'], [class*='loading'], [aria-label*='loading']")
        .then((el) => el !== null)
        .catch(() => false);

      if (!isTyping && afterCount > 0) {
        const responses = page.locator("[class*='response'], [class*='answer'], [class*='assistant']");
        answerEl = responses.last();
        break;
      }
    }

    if (!answerEl) {
      throw new Error(
        `No response received within ${timeoutMs / 1000}s. ` +
          "The notebook may have no sources loaded yet."
      );
    }

    // Extract the answer text
    const answer = await answerEl.innerText().catch(() => "");

    // Extract citation references (numbered superscripts or [N] patterns)
    const citations = await page
      .$$eval(
        "[class*='citation'], [class*='footnote'], sup, [data-citation]",
        (els) => [...new Set(els.map((el) => el.textContent?.trim()).filter(Boolean))] as string[]
      )
      .catch(() => [] as string[]);

    return { answer: answer.trim(), citations };
  });
}

// ─── Multi-turn conversation ──────────────────────────────────────────────────

/**
 * Run multiple questions sequentially in the same browser session.
 * Useful for multi-turn research workflows.
 */
export async function conversation(
  notebookId: string,
  messages: string[]
): Promise<ChatResponse[]> {
  const results: ChatResponse[] = [];

  return withPage(async (page) => {
    await guardAuth(page, `${BASE_URL}/notebook/${notebookId}`);
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);

    for (const question of messages) {
      // Ask
      const inputSelector = [
        "textarea[placeholder*='Ask']",
        "textarea[placeholder*='ask']",
        "[contenteditable='true']",
        "form textarea",
      ].join(", ");

      const chatInput = await page.waitForSelector(inputSelector, { timeout: 15_000 });
      await chatInput.click();
      await chatInput.fill(question);

      const beforeCount = await page
        .$$eval("[class*='response'], [class*='answer']", (els) => els.length)
        .catch(() => 0);

      await page.keyboard.press("Enter");

      // Wait for new response
      for (let i = 0; i < 40; i++) {
        await page.waitForTimeout(1_500);
        const afterCount = await page
          .$$eval("[class*='response'], [class*='answer']", (els) => els.length)
          .catch(() => 0);
        if (afterCount > beforeCount) break;
      }

      const responses = page.locator("[class*='response'], [class*='answer']");
      const last = responses.last();
      const answer = await last.innerText().catch(() => "");

      results.push({ answer: answer.trim(), citations: [] });
    }

    return results;
  });
}
