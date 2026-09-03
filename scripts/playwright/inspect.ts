import { chromium, type Response } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const PAGE_URL = process.env.PAGE_URL ?? "https://awua-catalogo.vercel.app/";

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

  await mkdir(path.resolve("artifacts/raw/playwright"), {
    recursive: true
  });

  const browser = await chromium.launch({
    headless: true
  });

  const networkRequests: Array<{
    method: string;
    url: string;
    status: number;
  }> = [];

  try {
    const page = await browser.newPage({
      viewport: {
        width: 1440,
        height: 900
      }
    });

    const handleResponse = (response: Response) => {
      const request = response.request();

      if (
        request.resourceType() === "xhr" ||
        request.resourceType() === "fetch"
      ) {
        console.log(response.status(), response.url());

        networkRequests.push({
          method: request.method(),
          url: response.url(),
          status: response.status()
        });
      }
    };

    page.on("response", handleResponse);

    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 120000
    });

    await page.waitForTimeout(3000);

    const data = await page.evaluate(() => ({
      title: document.title,

      url: location.href,

      bodyText: document.body.innerText,

      html: document.documentElement.outerHTML,

      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },

      elements: Array.from(
        document.querySelectorAll(
          "header, nav, main, section, article, footer, button, a, img, form, input"
        )
      ).map((element) => ({
        tag: element.tagName.toLowerCase(),
        text: element.textContent?.trim() ?? "",
        id: element.id,
        className:
          typeof element.className === "string"
            ? element.className
            : "",
        href:
          element instanceof HTMLAnchorElement
            ? element.href
            : null,
        src:
          element instanceof HTMLImageElement
            ? element.src
            : null
      }))
    }));

    page.removeListener("response", handleResponse);

    await writeFile(
      path.resolve("artifacts/raw/playwright/dom.json"),
      JSON.stringify(data, null, 2),
      "utf8"
    );

    await writeFile(
      path.resolve("artifacts/normalized/network.json"),
      JSON.stringify(networkRequests, null, 2)
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  if (error instanceof Error) {
    console.error(`[inspect] ${error.message}`);
    if (error.cause) {
      console.error(`[inspect] cause: ${String(error.cause)}`);
    }
  } else {
    console.error("[inspect] unexpected error:", error);
  }
  process.exit(1);
});