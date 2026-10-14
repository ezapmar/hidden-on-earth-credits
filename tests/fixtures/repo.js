/* Paths into the repository. Built from strings, not `new URL`, because under jsdom the global
   URL is jsdom's, and Node's fs refuses it. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const repoPath = (...parts) => path.join(REPO, ...parts);
export const readRepoJSON = (...parts) => JSON.parse(readFileSync(repoPath(...parts), "utf8"));
export const readRepoText = (...parts) => readFileSync(repoPath(...parts), "utf8");
