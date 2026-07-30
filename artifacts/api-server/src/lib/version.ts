import { execSync } from "child_process";

function readGitSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

/** Short git commit SHA captured once at server startup. */
export const GIT_SHA = readGitSha();
