/**
 * Global teardown: force-push the test repo's staging and main branches
 * back to the known-good baseline SHA. This undoes any commits the E2E
 * tests made during the run.
 */

import { TEST_REPO_URL, TEST_GIT_TOKEN, TEST_BASELINE_SHA } from "./helpers";

function parseRepoUrl(url: string): { owner: string; repo: string } {
  const clean = url.replace(/\.git$/, "").replace(/\/$/, "");
  const parts = clean.split("/");
  return { repo: parts.pop()!, owner: parts.pop()! };
}

export default async function globalTeardown() {
  if (!TEST_REPO_URL || !TEST_GIT_TOKEN) return;

  const { owner, repo } = parseRepoUrl(TEST_REPO_URL);
  const headers = {
    Authorization: `Bearer ${TEST_GIT_TOKEN}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
  };

  for (const branch of ["staging", "main"]) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({ sha: TEST_BASELINE_SHA, force: true }),
        },
      );

      if (res.ok) {
        console.log(
          `[teardown] reset ${branch} → ${TEST_BASELINE_SHA.slice(0, 8)}`,
        );
      } else {
        const body = await res.text().catch(() => "");
        console.log(
          `[teardown] failed to reset ${branch}: ${res.status} ${body}`,
        );
      }
    } catch (err) {
      console.log(`[teardown] error resetting ${branch}:`, err);
    }
  }
}
