import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Firecrawl, type Document } from "firecrawl";

const TARGET_URL = process.env.TARGET_URL ?? "https://awua-catalogo.vercel.app/";

const apiKey = process.env.FIRECRAWL_API_KEY;

if (!apiKey) {
  throw new Error("Missing FIRECRAWL_API_KEY");
}

const app = new Firecrawl({
  apiKey,
  timeoutMs: Number(process.env.FIRECRAWL_TIMEOUT_MS ?? 120000),
  maxRetries: Number(process.env.FIRECRAWL_MAX_RETRIES ?? 3),
  backoffFactor: Number(process.env.FIRECRAWL_BACKOFF_FACTOR ?? 1.5)
});

const OUTPUT_PATH =
  process.env.OUTPUT_PATH ?? "artifacts/raw/firecrawl/result.json";

function validateUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid TARGET_URL: "${raw}"`);
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`TARGET_URL must use http(s), got protocol "${url.protocol}"`);
  }

  return url.toString();
}

function stringifySafely(value: unknown): string {
  const seen = new WeakSet();
  return JSON.stringify(
    value,
    (_key, item) => {
      if (typeof item === "bigint") {
        return item.toString();
      }
      if (typeof item === "object" && item !== null) {
        if (seen.has(item)) {
          return "[Circular]";
        }
        seen.add(item);
      }
      return item;
    },
    2
  );
}

async function main(): Promise<void> {
  const url = validateUrl(TARGET_URL);
  const outputDir = path.dirname(OUTPUT_PATH);

  await mkdir(outputDir, { recursive: true });

  console.log(`[scrape] target: ${url}`);

  console.time("scrape");
  let result: Document;
  try {
    result = await app.scrape(url, {
      formats: ["markdown", "html", "rawHtml", "links", "images"],
      onlyMainContent: false,
      waitFor: 5000,
      timeout: 120000
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[scrape] failed: ${message}`);
    throw new Error(`Firecrawl scrape failed for ${url}: ${message}`, {
      cause: error
    });
  }
  console.timeEnd("scrape");

  if (!result.markdown && !result.html && !result.rawHtml) {
    console.warn(
      `[scrape] warning: scrape returned no text/html content. metadata: ${
        JSON.stringify(result.metadata ?? null)
      }`
    );
  }

  console.time("save");
  try {
    await writeFile(OUTPUT_PATH, stringifySafely(result), "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to write result to ${OUTPUT_PATH}: ${message}`, {
      cause: error
    });
  }
  console.timeEnd("save");

  console.log(`[scrape] result saved to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  if (error instanceof Error) {
    console.error(`[scrape] ${error.message}`);
    if (error.cause) {
      console.error(`[scrape] cause: ${String(error.cause)}`);
    }
  } else {
    console.error("[scrape] unexpected error:", error);
  }
  process.exit(1);
});
