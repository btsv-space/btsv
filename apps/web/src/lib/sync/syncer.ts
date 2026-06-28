import {
  dbGetDirtyPosts,
  dbSavePost,
  dbDeletePost,
  dbGetPost,
  dbSaveProject,
} from "$lib/db";
import { serializeMdx, computeSaveDates, parseMdx } from "$lib/parser";
import { ensureGitToken, currentUser } from "$lib/stores/auth.svelte";
import { APP_NAMESPACE } from "$lib/shared/constants";
import { commitTimestamp } from "$lib/shared/utils";
import { createSyncAdapter } from "$lib/sync/adapter";
import { postFileExists } from "$lib/fs";
import {
  SyncState,
  type IPostEntry,
  type IPostRecord,
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
  private projectQueue = new Map<string, Promise<unknown>>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private afterSyncHooks = new Set<TSyncHook>();

  constructor(config: ISyncerConfig) {
    this.config = config;
  }

  #setStatus(projectId: string, state: SyncState, errorMsg = ""): void {
    this.config.onSyncStatus?.(projectId, {
      state,
      errorMsg: state === SyncState.ERROR ? errorMsg : "",
    });
  }

  async #runSerial<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.projectQueue.get(projectId) ?? Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    this.projectQueue.set(
      projectId,
      next.catch(() => {}),
    );
    return next;
  }

  // ── Operations ──

  async pull(
    project: TProjectEntry,
    tokenOverride?: string,
  ): Promise<IPostRecord[]> {
    return this.#runSerial(project.id, async () => {
      const prefs = this.config.getPrefs();
      const token = tokenOverride ?? (await ensureGitToken(project.id));
      if (!token) {
        console.error(`[syncer] no git token for ${project.id}`);
        this.#setStatus(project.id, SyncState.ERROR, "No git token available");
        return [];
      }

      const adapter = await createSyncAdapter(project, prefs);
      let lastCommitTime: number | undefined;
      let headSha: string | undefined;

      try {
        if (!tokenOverride) {
          const result = await adapter.checkRemote(
            project.id,
            token,
            project.storedRemoteSha,
          );
          lastCommitTime = result.lastCommitTime;
          headSha = result.headSha;
          if (!result.hasChanges) {
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
        }

        this.#setStatus(project.id, SyncState.SYNCING_PULL);
        const entries = await adapter.pull(project.id, token);
        console.log(`[syncer] adapter.pull returned ${entries.length} entries`);

        const records = await this.#parseAndSave(project.id, entries);

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
        return records;
      } catch (err) {
        this.#setStatus(
          project.id,
          SyncState.ERROR,
          err instanceof Error ? err.message : "Pull failed",
        );
        return [];
      }
    });
  }

  async initialPull(
    project: TProjectEntry,
    tokenOverride?: string,
  ): Promise<IPostRecord[]> {
    return this.#runSerial(project.id, async () => {
      const prefs = this.config.getPrefs();
      const token = tokenOverride ?? (await ensureGitToken(project.id));
      if (!token) {
        console.error(`[syncer] no git token for ${project.id}`);
        this.#setStatus(project.id, SyncState.ERROR, "No git token available");
        return [];
      }
      const adapter = await createSyncAdapter(project, prefs);
      this.#setStatus(project.id, SyncState.SYNCING_PULL);
      try {
        const { entries, lastCommitTime, headSha } = await adapter.initialPull(
          project.id,
          token,
        );
        console.log(`[syncer] initialPull returned ${entries.length} entries`);

        const records = await this.#parseAndSave(project.id, entries);

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
        return records;
      } catch (err) {
        this.#setStatus(
          project.id,
          SyncState.ERROR,
          err instanceof Error ? err.message : "Initial pull failed",
        );
        return [];
      }
    });
  }

  async push(project: TProjectEntry): Promise<boolean> {
    return this.#runSerial(project.id, async () => {
      const dirty = await dbGetDirtyPosts(project.id);
      if (dirty.length === 0) {
        this.#setStatus(project.id, SyncState.SYNCED);
        return true;
      }

      this.#setStatus(project.id, SyncState.SYNCING_PUSH);
      const prefs = this.config.getPrefs();
      const username = getUsername();
      const adapter = await createSyncAdapter(project, prefs);
      let allOk = true;
      let anyPublished = false;
      let lastToken: string | null = null;
      let pushedSha: string | null = null;

      for (const post of dirty) {
        try {
          const token = await ensureGitToken(project.id);
          if (!token) {
            console.warn(`[syncer] no git token for ${project.id}, skipping`);
            this.#setStatus(
              project.id,
              SyncState.ERROR,
              "No git token available",
            );
            allOk = false;
            continue;
          }
          lastToken = token;

          const dates = computeSaveDates(post);
          post.dateUpdated = dates.dateUpdated;
          post.datePublished = dates.datePublished;

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

          post.dirty = false;
          if (commitSha) pushedSha = commitSha;

          if (!post.draft) anyPublished = true;

          await dbSavePost(post);

          this.#runAfterSyncHooks(project.id, post.id, post, Date.now());
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
          console.error(`[syncer] mergeToMain failed for ${project.id}:`, err);
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
    });
  }

  async commitDeletion(project: TProjectEntry, postId: string): Promise<void> {
    await this.#runSerial(project.id, async () => {
      const post = await dbGetPost(project.id, postId);
      const wasPublished = post && !post.draft;

      const existsOnDisk = await postFileExists(project.id, postId);
      if (!existsOnDisk) {
        await dbDeletePost(project.id, postId);
        this.#runAfterSyncHooks(project.id, postId, undefined, Date.now());
        return;
      }

      const prefs = this.config.getPrefs();
      const token = await ensureGitToken(project.id);
      if (!token) {
        console.error(`[syncer] no git token for deletion of ${postId}`);
        await dbDeletePost(project.id, postId);
        this.#runAfterSyncHooks(project.id, postId, undefined, Date.now());
        return;
      }

      const username = getUsername();
      const ts = commitTimestamp();
      const message = `${APP_NAMESPACE}-${username}-${project.id}-${postId}-delete-${ts}`;

      const adapter = await createSyncAdapter(project, prefs);
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
    });
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
    entries: IPostEntry[],
  ): Promise<IPostRecord[]> {
    const records: IPostRecord[] = [];
    for (const { id, content } of entries) {
      try {
        const { post } = parseMdx(content, id);
        const record: IPostRecord = {
          projectId,
          id: post.id,
          slug: post.slug,
          title: post.title,
          dateCreated: post.dateCreated,
          dateUpdated: post.dateUpdated,
          datePublished: post.datePublished,
          description: post.description,
          tags: post.tags,
          draft: post.draft,
          body: post.body,
          extra: { ...post.extra },
          dirty: false,
        };

        // TODO: will be changed as part of conflict mgmt in sync refactor
        // Guard: never overwrite a locally-dirty post with stale remote data
        const local = await dbGetPost(projectId, record.id);
        if (local?.dirty) {
          records.push(local);
          continue;
        }

        await dbSavePost(record);
        records.push(record);
        this.#runAfterSyncHooks(projectId, record.id, record);
      } catch (err) {
        console.error(`[syncer] failed to parse pulled post ${id}:`, err);
      }
    }
    return records;
  }

  async #syncAllDirty() {
    if (this.syncingAll) return;
    this.syncingAll = true;

    try {
      const entries = this.config.getProjects();

      for (const entry of entries) {
        if (entry.status !== "ready") continue;
        await this.push(entry);
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
    }, 10_000);
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
