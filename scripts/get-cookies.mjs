#!/usr/bin/env node
/**
 * NotebookLM Cookie Extractor
 * ─────────────────────────────────────────────────────────────────────────────
 * Run this LOCALLY (not on Vercel) to extract your Google session cookies
 * and generate the NOTEBOOKLM_STORAGE_STATE environment variable value.
 *
 * Usage:
 *   npm install playwright --save-dev
 *   npx playwright install chromium
 *   npm run get-cookies
 *
 * After running, copy the printed base64 string into:
 *   - .env.local (for local testing)
 *   - Vercel dashboard → Settings → Environment Variables → NOTEBOOKLM_STORAGE_STATE
 */

import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const STORAGE_STATE_PATH = join(process.cwd(), ".notebooklm-state.json");
const NOTEBOOKLM_URL = "https://notebooklm.google.com";

async function main() {
  console.log("\n🔐 NotebookLM Cookie Extractor\n");
  console.log("This will open a browser window so you can sign in to your Google account.");
  console.log("Your credentials are NEVER sent anywhere — the browser runs locally.\n");

  // Launch a visible (headed) browser so the user can interact
  const browser = await chromium.launch({
    headless: false,
    args: ["--start-maximized"],
  });

  const context = await browser.newContext({
    viewport: null, // full window
  });
  const page = await context.newPage();

  // Go to NotebookLM
  await page.goto(NOTEBOOKLM_URL, { waitUntil: "domcontentloaded" });

  console.log("✅ Browser opened. Please:");
  console.log("   1. Sign in with your Google account in the browser window");
  console.log("   2. Make sure you can see your NotebookLM notebooks");
  console.log("   3. Come back here and press ENTER\n");

  // Wait for user confirmation via stdin
  await new Promise((resolve) => {
    process.stdin.setEncoding("utf8");
    process.stdin.once("data", resolve);
    console.log("Press ENTER when you are signed in and can see your notebooks...");
  });

  // Verify the user is actually on NotebookLM (not on a login page)
  const currentUrl = page.url();
  if (currentUrl.includes("accounts.google.com")) {
    console.error("\n❌ It looks like you are still on the login page.");
    console.error("   Please complete the sign-in and run this script again.");
    await browser.close();
    process.exit(1);
  }

  // Save cookies and local storage state
  await context.storageState({ path: STORAGE_STATE_PATH });
  await browser.close();

  console.log("\n✅ Session saved!");

  // Read and encode as base64
  const raw = readFileSync(STORAGE_STATE_PATH, "utf-8");
  const parsed = JSON.parse(raw);
  const encoded = Buffer.from(JSON.stringify(parsed)).toString("base64");

  // Write to .env.local for convenience
  const envLocalPath = join(process.cwd(), ".env.local");
  let envContent = existsSync(envLocalPath) ? readFileSync(envLocalPath, "utf-8") : "";

  if (envContent.includes("NOTEBOOKLM_STORAGE_STATE=")) {
    // Replace existing value
    envContent = envContent.replace(
      /NOTEBOOKLM_STORAGE_STATE=.*/,
      `NOTEBOOKLM_STORAGE_STATE=${encoded}`
    );
  } else {
    envContent += `\nNOTEBOOKLM_STORAGE_STATE=${encoded}\n`;
  }

  writeFileSync(envLocalPath, envContent);

  console.log("\n📋 Your storage state has been saved to .env.local");
  console.log("\n⚠️  IMPORTANT — Copy this value to Vercel:");
  console.log("────────────────────────────────────────────────────────");
  console.log(`NOTEBOOKLM_STORAGE_STATE=${encoded}`);
  console.log("────────────────────────────────────────────────────────");
  console.log("\nSteps to add to Vercel:");
  console.log("  1. Go to https://vercel.com/dashboard");
  console.log("  2. Select your project → Settings → Environment Variables");
  console.log('  3. Add Name: "NOTEBOOKLM_STORAGE_STATE"');
  console.log("  4. Paste the value above");
  console.log("  5. Set environment: Production (and Preview if needed)");
  console.log("  6. Re-deploy your project\n");

  const cookieCount = parsed.cookies?.length ?? 0;
  console.log(`ℹ️  Session contains ${cookieCount} cookies.`);
  console.log("ℹ️  Sessions typically last 30–90 days. Re-run this script if auth fails.\n");
}

main().catch((err) => {
  console.error("\n❌ Fatal error:", err.message);
  process.exit(1);
});
