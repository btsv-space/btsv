import {
  dbGetDirtyPosts,
  dbSavePost,
  dbDeletePost,
  dbGetPost,
  dbSaveProject,
} from "$lib/db";
import { serializeMdx, parseMdx } from "$lib/parser";
import { ensureGitToken, currentUser } from "$lib/stores/auth.svelte";
import { APP_NAMESPACE } from "$lib/shared/constants";
import { commitTimestamp, today } from "$lib/shared/utils";
import { createSyncAdapter } from "$lib/sync/adapter";
import { postFileExists, deletePostFile } from "$lib/fs";
import {
  SyncerOps,
  SyncState,
  type IPostEntry,
  type IPostRecord,
  type ISyncerProjectQueueValue,
  type TProjectEntry,
  type TSyncHook,
  type ISyncerConfig,
} from "$lib/shared/types";

function getUsername(): string {
  return currentUser.value?.username ?? "unknown";
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
    state: SyncState,
    errorMsg = "",
    dirtyOverride: boolean | null = null,
  ): void {
    this.config.onSyncStatus?.(
      projectId,
      {
        state,
        errorMsg: state === SyncState.ERROR ? errorMsg : "",
      },
      dirtyOverride,
    );
  }

  async #ensureGitToken(projectId: string): Promise<string | null> {
    const token = await ensureGitToken(projectId);
    if (!token) {
      console.error(`[syncer] no git token for ${projectId}`);
      this.#setStatus(projectId, SyncState.ERROR, "No git token available");
    }
    return token;
  }

  async #runSerial<T>(
    projectId: string,
    fn: () => Promise<T>,
    opType: SyncerOps,
  ): Promise<T> {
    const prev = this.projectQueue.get(projectId)?.tail ?? Promise.resolve();
    const next = prev.catch(() => {}).then(fn);

    // when the operation is done, this marks it as no longer in-flight
    next.finally(() => {
      const q = this.projectQueue.get(projectId);
      if (q?.lastPromise === next) {
        this.projectQueue.set(projectId, { ...q, lastOpResolved: true });
      }
    });

    this.projectQueue.set(projectId, {
      tail: next.catch(() => {}),
      lastPromise: next,
      lastOp: opType,
      lastOpResolved: false,
    });
    return next;
  }

  // ── Operations ──

  async pull(project: TProjectEntry): Promise<IPostRecord[]> {
    const q = this.projectQueue.get(project.id);
    // if the previous queue op is an active pull, just return that
    if (q?.lastOp === SyncerOps.PULL && !q.lastOpResolved && q.lastPromise) {
      return q.lastPromise as Promise<IPostRecord[]>;
    }

    return this.#runSerial(
      project.id,
      async () => {
        const userPrefs = this.config.getPrefs();
        const token = await this.#ensureGitToken(project.id);
        if (!token) {
          return [];
        }

        const adapter = await createSyncAdapter(project, userPrefs);
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
            this.#setStatus(project.id, SyncState.SYNCED);
            return [];
          }

          this.#setStatus(project.id, SyncState.SYNCING_PULL);
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
          this.#setStatus(project.id, SyncState.SYNCED);
          return postRecords;
        } catch (err) {
          this.#setStatus(
            project.id,
            SyncState.ERROR,
            err instanceof Error ? err.message : "Pull failed",
          );
          return [];
        }
      },
      SyncerOps.PULL,
    );
  }

  async initialPull(
    project: TProjectEntry,
    tokenOverride?: string,
  ): Promise<IPostRecord[]> {
    return this.#runSerial(
      project.id,
      async () => {
        const userPrefs = this.config.getPrefs();
        const token = tokenOverride ?? (await this.#ensureGitToken(project.id));
        if (!token) {
          return [];
        }
        const adapter = await createSyncAdapter(project, userPrefs);
        this.#setStatus(project.id, SyncState.SYNCING_PULL);
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
          this.#setStatus(project.id, SyncState.SYNCED);
          return postRecords;
        } catch (err) {
          this.#setStatus(
            project.id,
            SyncState.ERROR,
            err instanceof Error ? err.message : "Initial pull failed",
          );
          return [];
        }
      },
      SyncerOps.INITIAL_PULL,
    );
  }

  async push(project: TProjectEntry): Promise<boolean> {
    return this.#runSerial(
      project.id,
      async () => {
        const dirty = await dbGetDirtyPosts(project.id);
        if (dirty.length === 0) {
          // we just got dirty from db, can override dirty status
          this.#setStatus(project.id, SyncState.SYNCED, "", false);
          return true;
        }

        this.#setStatus(project.id, SyncState.SYNCING_PUSH);
        const userPrefs = this.config.getPrefs();
        const username = getUsername();
        const adapter = await createSyncAdapter(project, userPrefs);
        let allOk = true;
        let anyPublished = false;
        let lastToken: string | null = null;
        let pushedSha: string | null = null;

        for (const post of dirty) {
          try {
            const token = await this.#ensureGitToken(project.id);
            if (!token) {
              allOk = false;
              continue;
            }
            lastToken = token;

            const dateUpdated = today();
            post.dateUpdated = dateUpdated;

            const mdxContent = serializeMdx(post);

            const ts = commitTimestamp();
            const message = `${APP_NAMESPACE}-${username}-${project.id}-${post.id}-save-${ts}`;

            const commitSha = await adapter.commitAndPush(
              project.id,
              post.id,
              mdxContent,
              message,
              token,
            );

            if (commitSha) pushedSha = commitSha;

            if (!post.draft) anyPublished = true;

            const syncedPost: IPostRecord = { ...post, dirty: 0 };

            // when editor is open for this post, skip save to db
            const isEditing =
              this.config.isPostEditing?.(project.id, post.id) ?? false;
            if (!isEditing) {
              await dbSavePost(syncedPost);
            }

            // TODO: check if there are any dirty/remaining hooks
            // that will mess up with dirty state
            this.#runAfterSyncHooks(
              project.id,
              post.id,
              syncedPost,
              Date.now(),
            );
          } catch (err) {
            console.error(`[syncer] sync failed for ${post.id}:`, err);
            this.#setStatus(
              project.id,
              SyncState.ERROR,
              err instanceof Error ? err.message : "Sync failed",
            );
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

        if (allOk && pushedSha) {
          project.storedRemoteSha = pushedSha;
          await dbSaveProject(project);
        }

        if (allOk) {
          this.#setStatus(project.id, SyncState.SYNCED);
        }

        return allOk;
      },
      SyncerOps.PUSH,
    );
  }

  async commitDeletion(project: TProjectEntry, postId: string): Promise<void> {
    await this.#runSerial(
      project.id,
      async () => {
        const post = await dbGetPost(project.id, postId);
        const wasPublished = post && !post.draft;

        const existsOnDisk = await postFileExists(project.id, postId);
        if (!existsOnDisk) {
          await dbDeletePost(project.id, postId);
          this.#setStatus(project.id, SyncState.SYNCED);
          this.#runAfterSyncHooks(project.id, postId, undefined, Date.now());
          return;
        }

        const userPrefs = this.config.getPrefs();
        const token = await this.#ensureGitToken(project.id);
        if (!token) {
          return;
        }

        const username = getUsername();
        const ts = commitTimestamp();
        const message = `${APP_NAMESPACE}-${username}-${project.id}-${postId}-delete-${ts}`;

        const adapter = await createSyncAdapter(project, userPrefs);
        const commitSha = await adapter.commitDeletion(
          project.id,
          postId,
          message,
          token,
        );
        await dbDeletePost(project.id, postId);

        if (commitSha) {
          project.storedRemoteSha = commitSha;
          await dbSaveProject(project);
        }

        this.#setStatus(project.id, SyncState.SYNCED);

        this.#runAfterSyncHooks(project.id, postId, undefined, Date.now());

        if (wasPublished) {
          try {
            await adapter.mergeToMain(project.id, token);
          } catch (err) {
            console.error(
              `[syncer] merge after deletion failed for ${project.id}:`,
              err,
            );
          }
        }
      },
      SyncerOps.DELETE,
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
