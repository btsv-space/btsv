import type {
  ISyncAdapter,
  IPostEntry,
  IRemoteCheckResult,
} from "$lib/shared/types";
import { getPostPath, writePostFile, deletePostFile } from "$lib/fs";
import {
  POST_EXT,
  DEFAULT_GIT_BRANCH,
  MAIN_GIT_BRANCH,
} from "$lib/shared/constants";

function b64Encode(s: string): string {
  return btoa(
    String.fromCharCode(...new Uint8Array(new TextEncoder().encode(s))),
  );
}

function b64Decode(s: string): string {
  return new TextDecoder().decode(
    Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
  );
}

function parseRepoUrl(repoUrl: string): { owner: string; repo: string } {
  const url = repoUrl.replace(/\.git$/, "");
  const parts = url.split("/");
  const repo = parts.pop()!;
  const owner = parts.pop()!;
  return { owner, repo };
}

// TODO: consider whether to use SDK (e.g. @octokit/rest for GitHub)
export class ApiAdapter implements ISyncAdapter {
  private owner: string;
  private repo: string;
  private gitBranch: string;

  constructor(repoUrl: string, gitBranch?: string) {
    const parsed = parseRepoUrl(repoUrl);
    this.owner = parsed.owner;
    this.repo = parsed.repo;
    this.gitBranch = gitBranch ?? DEFAULT_GIT_BRANCH;
  }

  async checkRemote(
    _projectId: string,
    gitToken: string,
    storedRemoteSha?: string,
  ): Promise<IRemoteCheckResult> {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${this.owner}/${this.repo}/branches/${encodeURIComponent(this.gitBranch)}`,
        {
          headers: {
            Authorization: `Bearer ${gitToken}`,
            Accept: "application/vnd.github.v3+json",
          },
        },
      );
      if (!res.ok) return { hasChanges: true };
      const data = await res.json();
      const headSha: string = data.commit?.sha ?? "";
      if (!headSha) return { hasChanges: true };

      let lastCommitTime: number | undefined;
      const dateStr = data?.commit?.commit?.committer?.date;
      if (dateStr) lastCommitTime = new Date(dateStr).getTime();

      return {
        hasChanges: storedRemoteSha !== headSha,
        lastCommitTime,
        headSha,
      };
    } catch {
      return { hasChanges: true };
    }
  }

  async initialPull(
    projectId: string,
    gitToken: string,
  ): Promise<{
    entries: IPostEntry[];
    lastCommitTime?: number;
    headSha?: string;
  }> {
    const branchRes = await fetch(
      `https://api.github.com/repos/${this.owner}/${this.repo}/branches/${encodeURIComponent(this.gitBranch)}`,
      { headers: { Authorization: `Bearer ${gitToken}` } },
    );

    let lastCommitTime: number | undefined;
    let headSha: string | undefined;

    if (branchRes.ok) {
      const data = await branchRes.json();
      const dateStr = data?.commit?.commit?.committer?.date;
      if (dateStr) lastCommitTime = new Date(dateStr).getTime();
      headSha = data?.commit?.sha ?? undefined;
    }

    if (!branchRes.ok) {
      const refRes = await fetch(
        `https://api.github.com/repos/${this.owner}/${this.repo}/git/ref/heads/${MAIN_GIT_BRANCH}`,
        { headers: { Authorization: `Bearer ${gitToken}` } },
      );
      if (refRes.ok) {
        const { object } = await refRes.json();
        await fetch(
          `https://api.github.com/repos/${this.owner}/${this.repo}/git/refs`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${gitToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ref: `refs/heads/${this.gitBranch}`,
              sha: object.sha,
            }),
          },
        );
      }
    }

    const entries = await this.pull(projectId, gitToken);
    return { entries, lastCommitTime, headSha };
  }

  async mergeToMain(projectId: string, gitToken: string): Promise<void> {
    const res = await fetch(
      `https://api.github.com/repos/${this.owner}/${this.repo}/merges`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${gitToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ base: MAIN_GIT_BRANCH, head: this.gitBranch }),
      },
    );
    if (res.status === 201) {
      const { sha } = await res.json();
      // Fast-forward staging to match main so staging is never "behind"
      await fetch(
        `https://api.github.com/repos/${this.owner}/${this.repo}/git/refs/heads/${this.gitBranch}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${gitToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sha, force: true }),
        },
      ).catch(() => {});
    } else if (res.status === 409) {
      const body = await res.text();
      console.warn(`[api] merge conflict:`, body);
    } else if (res.status !== 204) {
      const body = await res.text();
      console.warn(`[api] merge-to-main failed (${res.status}):`, body);
    }
  }

  async pull(projectId: string, gitToken: string): Promise<IPostEntry[]> {
    const query = `
			query($owner: String!, $repo: String!, $expression: String!) {
				repository(owner: $owner, name: $repo) {
					object(expression: $expression) {
						... on Tree {
							entries {
								name
								object {
									... on Blob {
										text
									}
								}
							}
						}
					}
				}
			}
		`;

    const graphqlRes = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${gitToken}`,
      },
      body: JSON.stringify({
        query,
        variables: {
          owner: this.owner,
          repo: this.repo,
          expression: `${this.gitBranch}:src/content/posts`,
        },
      }),
    });

    if (!graphqlRes.ok) {
      const body = await graphqlRes.text();
      throw new Error(`GraphQL pull failed: ${graphqlRes.status} ${body}`);
    }

    const json = await graphqlRes.json();

    if (json.errors) {
      throw new Error(`GraphQL pull errors: ${JSON.stringify(json.errors)}`);
    }

    const entries: IPostEntry[] = [];
    const tree = json?.data?.repository?.object?.entries ?? [];

    for (const entry of tree) {
      if (!entry.name.endsWith(POST_EXT)) continue;

      const id = entry.name.replace(POST_EXT, "");
      const content: string = entry.object?.text ?? "";

      await writePostFile(projectId, id, content);

      entries.push({ id, content });
    }

    return entries;
  }

  async commitAndPush(
    projectId: string,
    postId: string,
    content: string,
    message: string,
    gitToken: string,
  ): Promise<string | null> {
    await writePostFile(projectId, postId, content);

    const filepath = getPostPath(postId);
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${filepath}`;
    const branchUrl = `${url}?ref=${encodeURIComponent(this.gitBranch)}`;

    const current = await fetchCurrentFile(branchUrl, gitToken);
    if (current && current.content === content) return null;

    const putRes = await putWithRetry(
      url,
      gitToken,
      message,
      content,
      current?.sha,
      this.gitBranch,
    );

    const result = await putRes.json();
    return result.commit?.sha ?? null;
  }

  async commitDeletion(
    projectId: string,
    postId: string,
    message: string,
    gitToken: string,
  ): Promise<string | null> {
    const filepath = getPostPath(postId);
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${filepath}`;

    const existingRes = await fetch(
      `${url}?ref=${encodeURIComponent(this.gitBranch)}`,
      {
        headers: { Authorization: `Bearer ${gitToken}` },
      },
    );

    if (!existingRes.ok) {
      if (existingRes.status === 404) return null;
      throw new Error(`GitHub API get failed: ${existingRes.status}`);
    }

    const existing = await existingRes.json();

    const delRes = await fetch(url, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${gitToken}`,
      },
      body: JSON.stringify({
        message,
        sha: existing.sha,
        branch: this.gitBranch,
      }),
    });

    if (!delRes.ok) {
      const errBody = await delRes.text();
      throw new Error(`GitHub API delete failed: ${delRes.status} ${errBody}`);
    }

    try {
      await deletePostFile(projectId, postId);
    } catch (err) {
      console.debug("[api] deletePostFile error, file may not exist:", err);
    }

    const result = await delRes.json();
    return result.commit?.sha ?? null;
  }
}

async function fetchCurrentFile(
  url: string,
  gitToken: string,
): Promise<{ sha: string; content: string } | null> {
  const sep = url.includes("?") ? "&" : "?";
  const res = await fetch(`${url}${sep}_=${Date.now()}`, {
    headers: { Authorization: `Bearer ${gitToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return {
    sha: data.sha,
    content: b64Decode(data.content),
  };
}

async function putWithRetry(
  url: string,
  gitToken: string,
  message: string,
  content: string,
  sha: string | undefined,
  branch: string,
): Promise<Response> {
  const body: Record<string, string> = {
    message,
    content: b64Encode(content),
    branch,
  };
  if (sha) body.sha = sha;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${gitToken}`,
    },
    body: JSON.stringify(body),
  });

  if (res.status === 409 && sha) {
    const branchUrl = `${url}?ref=${encodeURIComponent(branch)}`;
    const fresh = await fetchCurrentFile(branchUrl, gitToken);
    if (fresh && fresh.sha !== sha) {
      const retryBody: Record<string, string> = {
        message,
        content: b64Encode(content),
        sha: fresh.sha,
        branch,
      };
      const retryRes = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${gitToken}`,
        },
        body: JSON.stringify(retryBody),
      });
      if (retryRes.ok) return retryRes;
    }
  }

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`GitHub API commit failed: ${res.status} ${errBody}`);
  }

  return res;
}
