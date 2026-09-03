import "dotenv/config";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const PAGE_URL = process.env.PAGE_URL ?? "";
const OUTPUT_DIR = process.env.SCREENSHOT_DIR ?? "screenshots/original";

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
];

function validateUrl(raw: string): string {
  if (!raw) {
    throw new Error("Missing PAGE_URL environment variable");
  }
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error(`PAGE_URL must use http(s), got protocol "${parsed.protocol}"`);
    }
    return parsed.toString();
  } catch {
    throw new Error(`Invalid PAGE_URL: "${raw}"`);
  }
}

async function main(): Promise<void> {
  const url = validateUrl(PAGE_URL);
  const outputDir = path.resolve(OUTPUT_DIR);

  await mkdir(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      });

      const page = await context.newPage();

      console.log(`[capture] ${viewport.name}: ${viewport.width}x${viewport.height}`);

      try {
        await page.goto(url, {
          waitUntil: "networkidle",
          timeout: 120000,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[capture] ${viewport.name}: navigation failed — ${message}`);
        await context.close();
        throw new Error(
          `[capture] ${viewport.name}: failed to navigate to ${url}: ${message}`,
          { cause: error }
        );
      }

      try {
        await page.screenshot({
          path: `${outputDir}/${viewport.name}/full.png`,
          fullPage: true,
          timeout: 120000,
        });
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`[capture] all screenshots saved to ${outputDir}`);
}

main().catch((error) => {
  if (error instanceof Error) {
    console.error(`[capture] ${error.message}`);
    if (error.cause) {
      console.error(`[capture] cause: ${String(error.cause)}`);
    }
  } else {
    console.error("[capture] unexpected error:", error);
  }
  process.exit(1);
});
