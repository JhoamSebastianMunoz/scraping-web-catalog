import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { Firecrawl } from "firecrawl";

const TARGET_URL = process.env.TARGET_URL ;
