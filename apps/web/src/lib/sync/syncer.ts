import { dbGetDirtyPosts, dbSavePost, dbDeletePost, dbGetPost } from "$lib/db";
import { serializeMdx, computeSaveDates, parseMdx } from "$lib/parser";
import { ensureGitToken, currentUser } from "$lib/stores/auth.svelte";
import { APP_NAMESPACE } from "$lib/shared/constants";
import { commitTimestamp } from "$lib/shared/utils";
import { createSyncAdapter } from "$lib/sync/adapter";
import { postFileExists } from "$lib/fs";
import {
  SyncState,
  type IProject,
  type IUserPreferences,
  type IPostEntry,
  type IPostRecord,
  type TProjectEntry,
  type TSyncHook,
} from "$lib/shared/types";

function getUsername(): string {
  return currentUser.value?.username ?? "unknown";
}

export interface SyncerConfig {
  getPrefs: () => IUserPreferences;
  getProjects: () => TProjectEntry[];
  onStateChange?: (projectId: string, state: SyncState) => void;
  onError?: (projectId: string, error: string) => void;
}

export class Syncer {
  private config: SyncerConfig;
  private started = false;
  private syncingAll = false;
  private perProjectLock = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private afterSyncHooks = new Set<TSyncHook>();

  constructor(config: SyncerConfig) {
    this.config = config;
  }

  // ── Operations ──

  async pull(
    project: IProject,
    tokenOverride?: string,
  ): Promise<IPostRecord[]> {
    const prefs = this.config.getPrefs();
    console.log(
      `[syncer] pull: ${project.id} tokenOverride=${!!tokenOverride}`,
    );
    const token = tokenOverride ?? (await ensureGitToken(project.id));
    if (!token) {
      console.error(`[syncer] no git token for ${project.id}`);
      return [];
    }

    const adapter = await createSyncAdapter(project, prefs);

    let lastCommitTime: number | undefined;

    if (!tokenOverride) {
      const result = await adapter.checkRemote(project.id, token);
      lastCommitTime = result.lastCommitTime;
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
        return [];
      }
    }

    const entries = await adapter.pull(project.id, token);
    console.log(`[syncer] adapter.pull returned ${entries.length} entries`);

    const records = await this.#parseAndSave(project.id, entries);
    this.#runAfterSyncHooks(project.id, undefined, undefined, lastCommitTime);
    return records;
  }

  async initialPull(
    project: IProject,
    tokenOverride?: string,
  ): Promise<IPostRecord[]> {
    const prefs = this.config.getPrefs();
    console.log(`[syncer] initialPull: ${project.id}`);
    const token = tokenOverride ?? (await ensureGitToken(project.id));
    if (!token) {
      console.error(`[syncer] no git token for ${project.id}`);
      return [];
    }
    const adapter = await createSyncAdapter(project, prefs);
    const { entries, lastCommitTime } = await adapter.initialPull(
      project.id,
      token,
    );
    console.log(`[syncer] initialPull returned ${entries.length} entries`);
    const records = await this.#parseAndSave(project.id, entries);
    this.#runAfterSyncHooks(project.id, undefined, undefined, lastCommitTime);
    return records;
  }

  async syncDirtyPosts(projectId: string): Promise<boolean> {
    if (this.perProjectLock.has(projectId)) return false;
    this.perProjectLock.add(projectId);

    try {
      const projects = this.config.getProjects();
      const project = projects.find((p) => p.id === projectId);
      if (!project) {
        console.error(`[syncer] project ${projectId} not found for sync`);
        return false;
      }

      const prefs = this.config.getPrefs();
      const dirty = await dbGetDirtyPosts(projectId);

      if (dirty.length === 0) {
        this.config.onStateChange?.(projectId, SyncState.SYNCED);
        return true;
      }

      this.config.onStateChange?.(projectId, SyncState.SYNCING);

      const username = getUsername();
      const adapter = await createSyncAdapter(project, prefs);
      let allOk = true;
      let anyPublished = false;
      let lastToken: string | null = null;

      for (const post of dirty) {
        try {
          const token = await ensureGitToken(projectId);
          if (!token) {
            console.warn(`[syncer] no git token for ${projectId}, skipping`);
            this.config.onStateChange?.(projectId, SyncState.ERROR);
            this.config.onError?.(projectId, "No git token available");
            allOk = false;
            continue;
          }
          lastToken = token;

          const dates = computeSaveDates(post);
          post.dateUpdated = dates.dateUpdated;
          post.datePublished = dates.datePublished;

          const mdxContent = serializeMdx(post);

          const ts = commitTimestamp();
          const message = `${APP_NAMESPACE}-${username}-${projectId}-${post.id}-save-${ts}`;

          await adapter.commitAndPush(
            projectId,
            post.id,
            mdxContent,
            message,
            token,
          );

          post.dirty = false;

          if (!post.draft) anyPublished = true;

          await dbSavePost(post);

          this.#runAfterSyncHooks(projectId, post.id, post, Date.now());
        } catch (err) {
          console.error(`[syncer] sync failed for ${post.id}:`, err);
          this.config.onStateChange?.(projectId, SyncState.ERROR);
          this.config.onError?.(
            projectId,
            err instanceof Error ? err.message : "Sync failed",
          );
          allOk = false;
        }
      }

      if (allOk) {
        this.config.onStateChange?.(projectId, SyncState.SYNCED);
        this.config.onError?.(projectId, "");
      }

      if (anyPublished && allOk && lastToken) {
        try {
          await adapter.mergeToMain(projectId, lastToken);
        } catch (err) {
          console.error(`[syncer] mergeToMain failed for ${projectId}:`, err);
        }
      }

      return allOk;
    } finally {
      this.perProjectLock.delete(projectId);
    }
  }

  async commitDeletion(project: IProject, postId: string): Promise<void> {
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
    await adapter.commitDeletion(project.id, postId, message, token);
    await dbDeletePost(project.id, postId);

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
        await this.syncDirtyPosts(entry.id);
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
