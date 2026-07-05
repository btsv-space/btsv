import type {
  ISyncAdapter,
  IPostEntry,
  IRemoteCheckResult,
} from "$lib/shared/types";
import {
  getFS,
  getDir,
  getPostPath,
  ensureDirChain,
  writePostFile,
  deletePostFile,
} from "$lib/fs";
import {
  POST_EXT,
  DEFAULT_PROXY_URL,
  DEFAULT_GIT_BRANCH,
  MAIN_GIT_BRANCH,
} from "$lib/shared/constants";

function createCredentials(token: string) {
  return () => ({ username: token, password: "x-oauth-basic" as const });
}

export class GitAdapter implements ISyncAdapter {
  private repoUrl: string;
  private proxyUrl: string;
  private gitBranch: string;

  constructor(repoUrl: string, proxyUrl?: string, gitBranch?: string) {
    this.repoUrl = repoUrl;
    this.proxyUrl = proxyUrl ?? DEFAULT_PROXY_URL;
    this.gitBranch = gitBranch ?? DEFAULT_GIT_BRANCH;
  }

  async checkRemote(
    projectId: string,
    gitToken: string,
    storedRemoteSha?: string,
  ): Promise<IRemoteCheckResult> {
    const fs = await getFS();
    const dir = getDir(projectId);
    const gitdir = `${dir}/.git`;

    try {
      await fs.promises.stat(gitdir);
    } catch {
      return { hasChanges: true };
    }

    try {
      const git = await import("isomorphic-git");
      const { default: http } = await import("isomorphic-git/http/web");

      await git.fetch({
        fs,
        http,
        dir,
        corsProxy: this.proxyUrl,
        onAuth: createCredentials(gitToken),
        singleBranch: true,
        ref: this.gitBranch,
      });

      let remoteOid: string;
      try {
        remoteOid = await git.resolveRef({
          fs,
          dir,
          ref: `refs/remotes/origin/${this.gitBranch}`,
        });
      } catch {
        return { hasChanges: true };
      }

      let lastCommitTime: number | undefined;
      try {
        const log = await git.log({
          fs,
          dir,
          ref: `refs/remotes/origin/${this.gitBranch}`,
          depth: 1,
        });
        lastCommitTime = (log[0]?.commit?.author?.timestamp ?? 0) * 1000;
      } catch (err) {
        console.debug("[git] checkRemote log best-effort error:", err);
      }

      return {
        hasChanges: storedRemoteSha !== remoteOid,
        lastCommitTime,
        headSha: remoteOid,
      };
    } catch {
      return { hasChanges: true };
    }
  }

  async initialPull(
    projectId: string,
    gitToken: string,
  ): Promise<{
    postEntries: IPostEntry[];
    lastCommitTime?: number;
    headSha?: string;
  }> {
    const git = await import("isomorphic-git");
    const { default: http } = await import("isomorphic-git/http/web");
    const fs = await getFS();
    const dir = getDir(projectId);

    if (!(await dirExists(fs, `${dir}/.git`))) {
      await ensureDirChain(fs, dir);
      await git.init({ fs, dir });
      await git.addRemote({
        fs,
        dir,
        remote: "origin",
        url: this.repoUrl,
      });

      // Fetch all refs via the remote's refspec (+refs/heads/*:...)
      await git
        .fetch({
          fs,
          http,
          dir,
          corsProxy: this.proxyUrl,
          onAuth: createCredentials(gitToken),
        })
        .catch((err) => {
          console.warn(`Initial pull: Git fetch failed for origin: ${err}`);
        });

      await ensureRepoHasCommit(fs, dir, git);

      // If staging doesn't exist locally, create it from main (or HEAD)
      try {
        await git.resolveRef({ fs, dir, ref: this.gitBranch });
      } catch (err) {
        console.debug("[git] resolveRef staging branch not found:", err);
        let oid: string;
        try {
          oid = await git.resolveRef({
            fs,
            dir,
            ref: `refs/remotes/origin/${MAIN_GIT_BRANCH}`,
          });
        } catch (err) {
          console.debug("[git] resolveRef main/HEAD fallback:", err);
          oid = await git.resolveRef({ fs, dir, ref: "HEAD" });
        }

        await git.branch({
          fs,
          dir,
          ref: this.gitBranch,
          object: oid,
          checkout: true,
        });
        await git
          .push({
            fs,
            http,
            dir,
            url: this.repoUrl,
            corsProxy: this.proxyUrl,
            onAuth: createCredentials(gitToken),
            remoteRef: this.gitBranch,
          })
          .catch((err) => {
            console.warn(
              `Initial pull: Git push failed for ${this.gitBranch}: ${err}`,
            );
          });
      }
    }

    const [logResult, postEntries] = await Promise.all([
      git.log({ fs, dir, ref: this.gitBranch, depth: 1 }).catch(() => null),
      this.pull(projectId, gitToken),
    ]);

    let lastCommitTime: number | undefined;
    if (logResult) {
      lastCommitTime = (logResult[0]?.commit?.author?.timestamp ?? 0) * 1000;
    }

    let headSha: string | undefined;
    try {
      headSha = await git.resolveRef({
        fs,
        dir,
        ref: `refs/remotes/origin/${this.gitBranch}`,
      });
    } catch {
      headSha = logResult?.[0]?.oid;
    }

    return { postEntries, lastCommitTime, headSha };
  }

  async mergeToMain(projectId: string, gitToken: string): Promise<void> {
    const git = await import("isomorphic-git");
    const { default: http } = await import("isomorphic-git/http/web");
    const fs = await getFS();
    const dir = getDir(projectId);

    await git.checkout({ fs, dir, ref: MAIN_GIT_BRANCH });
    try {
      await git.merge({
        fs,
        dir,
        ours: MAIN_GIT_BRANCH,
        theirs: this.gitBranch,
        fastForwardOnly: true,
      });
      await git.push({
        fs,
        http,
        dir,
        corsProxy: this.proxyUrl,
        onAuth: createCredentials(gitToken),
        remoteRef: MAIN_GIT_BRANCH,
      });
    } catch (err) {
      console.warn(`[git] merge-to-main failed for ${projectId}:`, err);
    } finally {
      await git.checkout({ fs, dir, ref: this.gitBranch });
    }
  }

  async pull(
    projectId: string,
    gitToken: string,
    _storedRemoteSha?: string,
    _headSha?: string,
  ): Promise<IPostEntry[]> {
    const git = await import("isomorphic-git");
    const { default: http } = await import("isomorphic-git/http/web");
    const fs = await getFS();

    const dir = getDir(projectId);

    const gitRepoExists = await dirExists(fs, `${dir}/.git`);

    let preIds: Set<string> = new Set();
    if (gitRepoExists) {
      try {
        preIds = new Set((await readPostFiles(fs, dir, true)).map((e) => e.id));
      } catch (err) {
        console.debug("[git] pre-pull id snapshot failed:", err);
      }
    }

    if (!gitRepoExists) {
      await ensureDirChain(fs, dir);
    }

    if (gitRepoExists) {
      try {
        await git.pull({
          fs,
          http,
          dir,
          corsProxy: this.proxyUrl,
          onAuth: createCredentials(gitToken),
          singleBranch: true,
          ref: this.gitBranch,
          author: { name: "btsv", email: "editor@btsv.local" },
        });
      } catch (err) {
        console.debug("[git] pull best-effort error:", err);
      }
    } else {
      await ensureDirChain(fs, dir);

      try {
        await git.clone({
          fs,
          http,
          dir,
          url: this.repoUrl,
          corsProxy: this.proxyUrl,
          onAuth: createCredentials(gitToken),
          singleBranch: true,
          ref: this.gitBranch,
        });
      } catch (err) {
        console.debug("[git] clone best-effort error:", err);
      }
    }

    await ensureRepoHasCommit(fs, dir, git);

    const postEntries = await readPostFiles(fs, dir);

    if (preIds.size > 0) {
      const postIds = new Set(postEntries.map((e) => e.id));
      for (const id of preIds) {
        if (!postIds.has(id)) {
          postEntries.push({ id, deleted: true });
        }
      }
    }

    return postEntries;
  }

  async commitAndPush(
    projectId: string,
    postId: string,
    content: string,
    message: string,
    gitToken: string,
  ): Promise<string | null> {
    const git = await import("isomorphic-git");
    const { default: http } = await import("isomorphic-git/http/web");
    const fs = await getFS();

    const dir = getDir(projectId);
    const filepath = getPostPath(postId);

    await writePostFile(projectId, postId, content);

    const fileStatus = await git.status({ fs, dir, filepath });
    if (fileStatus === "unmodified") return null;

    await git.add({ fs, dir, filepath });
    const sha = await git.commit({
      fs,
      dir,
      message,
      author: { name: "btsv", email: "editor@btsv.local" },
    });

    try {
      await git.push({
        fs,
        http,
        dir,
        corsProxy: this.proxyUrl,
        onAuth: createCredentials(gitToken),
        remoteRef: this.gitBranch,
      });
    } catch {
      console.warn("[git] push rejected, attempting force push...");
      await git.push({
        fs,
        http,
        dir,
        corsProxy: this.proxyUrl,
        onAuth: createCredentials(gitToken),
        remoteRef: this.gitBranch,
        force: true,
      });
    }

    return sha;
  }

  async commitDeletion(
    projectId: string,
    postId: string,
    message: string,
    gitToken: string,
  ): Promise<string | null> {
    const git = await import("isomorphic-git");
    const { default: http } = await import("isomorphic-git/http/web");
    const fs = await getFS();

    const dir = getDir(projectId);
    const filepath = getPostPath(postId);

    await deletePostFile(projectId, postId);

    const fileStatus = await git.status({ fs, dir, filepath });
    if (fileStatus === "absent") return null;

    await git.remove({ fs, dir, filepath });
    const sha = await git.commit({
      fs,
      dir,
      message,
      author: { name: "btsv", email: "editor@btsv.local" },
    });

    try {
      await git.push({
        fs,
        http,
        dir,
        corsProxy: this.proxyUrl,
        onAuth: createCredentials(gitToken),
        remoteRef: this.gitBranch,
      });
    } catch {
      console.warn("[git] push rejected, attempting force push...");
      await git.push({
        fs,
        http,
        dir,
        corsProxy: this.proxyUrl,
        onAuth: createCredentials(gitToken),
        remoteRef: this.gitBranch,
        force: true,
      });
    }

    return sha;
  }
}

async function dirExists(
  fs: Awaited<ReturnType<typeof getFS>>,
  path: string,
): Promise<boolean> {
  try {
    await fs.promises.stat(path);
    return true;
  } catch {
    return false;
  }
}

async function ensureRepoHasCommit(
  fs: Awaited<ReturnType<typeof getFS>>,
  dir: string,
  git: typeof import("isomorphic-git"),
): Promise<void> {
  const gitdir = `${dir}/.git`;
  let hasHead: boolean;
  try {
    const stat = await fs.promises.stat(gitdir);
    hasHead = stat.isDirectory();
  } catch {
    hasHead = false;
  }

  if (hasHead) {
    try {
      await git.log({ fs, dir, depth: 1 });
      return; // repo has commits, nothing to do
    } catch {
      // .git exists but has no valid HEAD — re-init to get a clean state
      await git.init({ fs, dir });
    }
  } else {
    await git.init({ fs, dir });
  }

  const keep = `${dir}/.gitkeep`;
  await fs.promises.writeFile(keep, "").catch(() => {});
  await git.add({ fs, dir, filepath: ".gitkeep" });
  await git.commit({
    fs,
    dir,
    message: "initialize repository",
    author: { name: "btsv", email: "editor@btsv.local" },
  });
  await fs.promises.unlink(keep).catch(() => {});
}

async function readPostFiles(
  fs: Awaited<ReturnType<typeof getFS>>,
  dir: string,
  idOnly = false,
): Promise<IPostEntry[]> {
  const postEntries: IPostEntry[] = [];

  async function walk(current: string): Promise<void> {
    let names: string[];
    try {
      names = await fs.promises.readdir(current);
    } catch {
      return;
    }

    for (const name of names) {
      const full = `${current}/${name}`;
      let stat;
      try {
        stat = await fs.promises.stat(full);
      } catch (err) {
        console.debug("[git] readPostFiles stat error, skipping:", err);
        continue;
      }

      if (stat.isDirectory()) {
        await walk(full);
      } else if (name.endsWith(POST_EXT)) {
        const relative = full.replace(`${dir}/`, "");
        if (relative.includes("/")) {
          const id = relative.split("/").pop()!.replace(POST_EXT, "");
          if (idOnly) {
            postEntries.push({ id });
          } else {
            const content = (await fs.promises.readFile(
              full,
              "utf8",
            )) as string;
            postEntries.push({ id, content });
          }
        }
      }
    }
  }

  await walk(dir);
  return postEntries;
}
