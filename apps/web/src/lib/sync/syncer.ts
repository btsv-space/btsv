import {
  dbGetDirtyPosts,
  dbSavePost,
  dbDeletePost,
  dbGetPost,
  dbSaveProject,
} from "$lib/db";
import { serializeMdx, parseMdx } from "$lib/parser";
import { contentEqual } from "$lib/saver";
import { ensureGitToken } from "$lib/secrets";
import { APP_NAMESPACE } from "$lib/shared/constants";
import { commitTimestamp, now, slugify } from "$lib/shared/utils";
import { createSyncAdapter } from "$lib/sync/adapter";
import { postFileExists, deletePostFile } from "$lib/fs";
import {
  ESyncerOps,
  ESyncState,
  type IPostEntry,
  type IPostRecord,
  type ISyncerProjectQueueValue,
  type IPreferences,
  type TProjectEntry,
  type TSyncHook,
  type ISyncerConfig,
  type ISyncError,
  type TSyncErrorType,
} from "$lib/shared/types";
import { GitHubHttpError } from "$lib/sync/api-adapter";

function getNameTag(prefs: IPreferences): string {
  return slugify(prefs.name ?? "") || "unnamed";
}

function errorTypeFor(err: unknown): TSyncErrorType | null {
  if (!(err instanceof GitHubHttpError)) return null;
  if (err.status === 401) return "token-invalid";
  if (err.status === 403 || err.status === 404) return "no-repo-access";
  return null;
}

export class Syncer {
  private config: ISyncerConfig;
  private started = false;
  private syncingAll = false;
  private projectQueue = new Map<string, ISyncerProjectQueueValue>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private afterSyncHooks = new Set<TSyncHook>();

  constructor(config: ISyncerConfig) {
    this.config = config;
  }

  #setStatus(
    projectId: string,
    state: ESyncState,
    error: ISyncError | null = null,
    dirtyOverride: boolean | null = null,
  ): void {
    this.config.onSyncStatus?.(
      projectId,
      { state, error: state === ESyncState.ERROR ? error : null },
      dirtyOverride,
    );
  }

  #isPaused(projectId: string): boolean {
    return this.config.isSyncPaused?.(projectId) ?? false;
  }

  #setError(projectId: string, err: unknown, fallbackMsg: string): void {
    this.#setStatus(projectId, ESyncState.ERROR, {
      type: errorTypeFor(err),
      message: err instanceof Error ? err.message : fallbackMsg,
    });
  }

  async #ensureGitToken(projectId: string): Promise<string | null> {
    const token = await ensureGitToken(projectId);
    if (!token) {
      console.error(`[syncer] no git token for ${projectId}`);
      this.#setStatus(projectId, ESyncState.ERROR, {
        type: "no-token",
        message: "No git token available",
      });
    }
    return token;
  }

  async #runSerial<T>(
    projectId: string,
    fn: () => Promise<T>,
    opType: ESyncerOps,
  ): Promise<T> {
    const prev = this.projectQueue.get(projectId)?.tail ?? Promise.resolve();
    const next = prev.then(fn);

    // never-rejecting queue/bookkeeping chain.
    const settled = next.catch(() => {});
    // when the operation is done, this marks it as no longer in-flight
    settled.finally(() => {
      const q = this.projectQueue.get(projectId);
      if (q?.lastPromise === next) {
        this.projectQueue.set(projectId, { ...q, lastOpResolved: true });
      }
    });

    this.projectQueue.set(projectId, {
      tail: settled,
      lastPromise: next,
      lastOp: opType,
      lastOpResolved: false,
    });
    return next;
  }

  // ── Operations ──

  async pull(
    project: TProjectEntry,
    opts: { force?: boolean } = {},
  ): Promise<IPostRecord[]> {
    if (!opts.force && this.#isPaused(project.id)) return [];

    const q = this.projectQueue.get(project.id);
    // if the previous queue op is an active pull, just return that
    if (q?.lastOp === ESyncerOps.PULL && !q.lastOpResolved && q.lastPromise) {
      return q.lastPromise as Promise<IPostRecord[]>;
    }

    return this.#runSerial(
      project.id,
      async () => {
        const token = await this.#ensureGitToken(project.id);
        if (!token) {
          return [];
        }

        const adapter = await createSyncAdapter(project);
        let lastCommitTime: number | undefined;
        let headSha: string | undefined;

        try {
          const checkResult = await adapter.checkRemote(
            project.id,
            token,
            project.storedRemoteSha,
          );
          lastCommitTime = checkResult.lastCommitTime;
          headSha = checkResult.headSha;
          if (!checkResult.hasChanges) {
            console.log(
              `[syncer] no remote changes for ${project.id}, skipping pull`,
            );
            this.#runAfterSyncHooks(
              project.id,
              undefined,
              undefined,
              lastCommitTime,
            );
            this.#setStatus(project.id, ESyncState.SYNCED);
            return [];
          }

          this.#setStatus(project.id, ESyncState.SYNCING_PULL);
          const postEntries = await adapter.pull(
            project.id,
            token,
            project.storedRemoteSha,
            headSha,
          );
          console.log(
            `[syncer] adapter.pull returned ${postEntries.length} postEntries`,
          );

          const postRecords = await this.#parseAndSave(project.id, postEntries);

          if (headSha) {
            project.storedRemoteSha = headSha;
            await dbSaveProject(project);
          }

          this.#runAfterSyncHooks(
            project.id,
            undefined,
            undefined,
            lastCommitTime,
          );
          this.#setStatus(project.id, ESyncState.SYNCED);
          return postRecords;
        } catch (err) {
          this.#setError(project.id, err, "Pull failed");
          return [];
        }
      },
      ESyncerOps.PULL,
    );
  }

  async initialPull(
    project: TProjectEntry,
    tokenOverride?: string,
  ): Promise<IPostRecord[]> {
    return this.#runSerial(
      project.id,
      async () => {
        const token = tokenOverride ?? (await this.#ensureGitToken(project.id));
        if (!token) {
          return [];
        }
        const adapter = await createSyncAdapter(project);
        this.#setStatus(project.id, ESyncState.SYNCING_PULL);
        try {
          const { postEntries, lastCommitTime, headSha } =
            await adapter.initialPull(project.id, token);
          console.log(
            `[syncer] initialPull returned ${postEntries.length} postEntries`,
          );

          const postRecords = await this.#parseAndSave(project.id, postEntries);

          if (headSha) {
            project.storedRemoteSha = headSha;
            await dbSaveProject(project);
          }

          this.#runAfterSyncHooks(
            project.id,
            undefined,
            undefined,
            lastCommitTime,
          );
          this.#setStatus(project.id, ESyncState.SYNCED);
          return postRecords;
        } catch (err) {
          this.#setError(project.id, err, "Initial pull failed");
          throw err;
        }
      },
      ESyncerOps.INITIAL_PULL,
    );
  }

  async push(
    project: TProjectEntry,
    opts: { force?: boolean } = {},
  ): Promise<boolean> {
    if (!opts.force && this.#isPaused(project.id)) return false;

    return this.#runSerial(
      project.id,
      async () => {
        const dirty = await dbGetDirtyPosts(project.id);
        if (dirty.length === 0) {
          // we just got dirty from db, can override dirty status
          this.#setStatus(project.id, ESyncState.SYNCED, null, false);
          return true;
        }

        this.#setStatus(project.id, ESyncState.SYNCING_PUSH);
        const nameTag = getNameTag(this.config.getPrefs());
        const adapter = await createSyncAdapter(project);
        let allOk = true;
        let anyPublished = false;
        let lastToken: string | null = null;

        for (const post of dirty) {
          const op = post.deleted ? "delete" : "save";

          const token = await this.#ensureGitToken(project.id);
          if (!token) {
            allOk = false;
            continue;
          }
          lastToken = token;
          if (!post.draft) anyPublished = true;

          const ts = commitTimestamp();
          const message = `${APP_NAMESPACE}-${nameTag}-${project.id}-${post.id}-${op}-${ts}`;

          try {
            if (post.deleted) {
              await adapter.commitDeletion(project.id, post.id, message, token);

              await dbDeletePost(project.id, post.id);

              this.#runAfterSyncHooks(
                project.id,
                post.id,
                undefined,
                Date.now(),
              );
            } else {
              post.dateUpdated = now();
              const mdxContent = serializeMdx(post);

              await adapter.commitAndPush(
                project.id,
                post.id,
                mdxContent,
                message,
                token,
              );

              const syncedPost: IPostRecord = { ...post, dirty: 0 };

              // when editor is open for this post, skip save to db
              const isEditing =
                this.config.isPostEditing?.(project.id, post.id) ?? false;
              if (!isEditing) {
                // prevent overwriting intervening changes
                const current = await dbGetPost(project.id, post.id);
                if (current && contentEqual(current, syncedPost)) {
                  await dbSavePost({ ...current, dirty: 0 });
                }
              }

              this.#runAfterSyncHooks(
                project.id,
                post.id,
                syncedPost,
                Date.now(),
              );
            }
          } catch (err) {
            console.error(`[syncer] ${op} failed for ${post.id}:`, err);
            this.#setError(project.id, err, `${op} failed`);
            allOk = false;
          }
        }

        if (anyPublished && allOk && lastToken) {
          try {
            await adapter.mergeToMain(project.id, lastToken);
          } catch (err) {
            console.error(
              `[syncer] mergeToMain failed for ${project.id}:`,
              err,
            );
          }
        }

        // storedRemoteSha is NOT advanced on push: the pushed commit's
        // history may contain unpulled commits from other devices, and
        // pulls compare from storedRemoteSha — only pull moves the base.

        if (allOk) {
          this.#setStatus(project.id, ESyncState.SYNCED);
        }

        return allOk;
      },
      ESyncerOps.PUSH,
    );
  }

  async markForDeletion(project: TProjectEntry, postId: string): Promise<void> {
    await this.#runSerial(
      project.id,
      async () => {
        const post = await dbGetPost(project.id, postId);

        const existsOnDisk = await postFileExists(project.id, postId);
        if (!existsOnDisk) {
          await dbDeletePost(project.id, postId);
          this.#setStatus(project.id, ESyncState.SYNCED);
          this.#runAfterSyncHooks(project.id, postId, undefined, Date.now());
          return;
        }

        // Remove from OPFS
        await deletePostFile(project.id, postId);

        // Mark as pending deletion — push loop handles the rest
        await dbSavePost({ ...post!, dirty: 1 as const, deleted: true });
        this.#setStatus(project.id, ESyncState.SYNCED);
        this.#runAfterSyncHooks(project.id, postId, undefined, Date.now());
      },
      ESyncerOps.DELETE,
    );
  }

  // ── Hooks ──

  #runAfterSyncHooks(...args: Parameters<TSyncHook>): void {
    for (const hook of this.afterSyncHooks) {
      hook(...args);
    }
  }

  addAfterSyncHook(hook: TSyncHook): () => void {
    this.afterSyncHooks.add(hook);
    return () => {
      this.afterSyncHooks.delete(hook);
    };
  }

  // ── Lifecycle ──

  start() {
    if (this.started) return;
    this.started = true;

    this.#syncAllDirty().catch(() => {});
    this.#schedule();
    this.#addListeners();
  }

  stop() {
    this.started = false;
    this.#clearTimer();
    this.#removeListeners();
  }

  // ── Private ──

  async #parseAndSave(
    projectId: string,
    postEntries: IPostEntry[],
  ): Promise<IPostRecord[]> {
    const postRecords: IPostRecord[] = [];
    for (const postEntry of postEntries) {
      const { id, content, deleted } = postEntry;
      let syncedPost: IPostRecord | undefined;
      try {
        if (deleted) {
          await dbDeletePost(projectId, id);
          try {
            await deletePostFile(projectId, id);
          } catch (err) {
            console.debug(
              `[syncer] deletePostFile error during pulled-delete for ${id}:`,
              err,
            );
          }
          continue;
        }
        if (!content) continue;

        // TODO: will be changed as part of conflict mgmt in sync refactor
        // Guard: never overwrite a locally-dirty post with stale remote data.
        const localPost = await dbGetPost(projectId, id);
        if (localPost?.dirty) {
          postRecords.push(localPost);
          continue;
        }

        const parsed = parseMdx(content, id);
        const post: IPostRecord = {
          projectId,
          ...parsed,
          dirty: 0,
          extra: { ...parsed.extra },
        };

        await dbSavePost(post);
        postRecords.push(post);
        syncedPost = post;
      } catch (err) {
        console.error(`[syncer] failed to parse pulled post ${id}:`, err);
      } finally {
        this.#runAfterSyncHooks(projectId, syncedPost?.id ?? id, syncedPost);
      }
    }
    return postRecords;
  }

  async #syncAllDirty() {
    if (this.syncingAll) return;
    this.syncingAll = true;

    try {
      const projectEntries = this.config.getProjects();

      for (const projectEntry of projectEntries) {
        if (projectEntry.status !== "ready") continue;
        if (this.#isPaused(projectEntry.id)) continue;
        await this.push(projectEntry);
      }
    } finally {
      this.syncingAll = false;
    }
  }

  #schedule() {
    this.#clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.#syncAllDirty()
        .catch(() => {})
        .finally(() => this.#schedule());
    }, 60_000);
  }

  #clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  #addListeners() {
    document.addEventListener("visibilitychange", this.#onVisibility);
    window.addEventListener("online", this.#onOnline);
  }

  #removeListeners() {
    document.removeEventListener("visibilitychange", this.#onVisibility);
    window.removeEventListener("online", this.#onOnline);
  }

  #onVisibility = () => {
    if (document.visibilityState === "hidden") {
      this.#syncAllDirty().catch(() => {});
    }
  };

  #onOnline = () => {
    this.#syncAllDirty().catch(() => {});
  };
}
