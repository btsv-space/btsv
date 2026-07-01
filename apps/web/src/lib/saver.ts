import deepEqual from "fast-deep-equal";

import {
  type IPostContent,
  type IPostRecord,
  type IDebouncedSaverConfig,
} from "$lib/shared/types";
import { dbGetPost, dbGetDirtyPosts, dbSavePost } from "$lib/db";

export function normalizePost(
  workingPost: IPostRecord,
  tagsInput: string,
): IPostRecord {
  return {
    ...workingPost,
    tags: tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  };
}

function toContent(post: IPostRecord): IPostContent {
  const {
    projectId: _projectId,
    id: _id,
    dirty: _dirty,
    dateCreated: _dateCreated,
    dateUpdated: _dateUpdated,
    ...content
  } = post;
  return content;
}

export function contentEqual(
  a: IPostContent | IPostRecord,
  b: IPostContent | IPostRecord,
): boolean {
  const ac = "projectId" in a ? toContent(a) : a;
  const bc = "projectId" in b ? toContent(b) : b;
  return deepEqual(ac, bc);
}

export class DebouncedSaver {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private syncBaseline: IPostContent | null;
  private config: IDebouncedSaverConfig;
  private aborter: AbortController | null = null;

  constructor(config: IDebouncedSaverConfig) {
    this.config = config;
    this.syncBaseline = config.gitBaseline
      ? toContent(JSON.parse(JSON.stringify(config.gitBaseline)))
      : null;
  }

  async #write(saved: IPostRecord, signal: AbortSignal) {
    await dbSavePost(saved);
    if (signal.aborted) return;
    this.config.onSave(saved);
    // TODO: look into this dirty posts change
    const remaining = await dbGetDirtyPosts(saved.projectId);
    this.config.onDirtyChange?.(saved.projectId, remaining.length > 0);
  }

  async #doSave(signal: AbortSignal): Promise<void> {
    const workingPost = this.config.getWorkingPost();
    const tagsInput = this.config.getTagsInput();
    if (!workingPost) return;

    const normalized = normalizePost(workingPost, tagsInput);

    try {
      const dbPost = await dbGetPost(workingPost.projectId, workingPost.id);
      if (signal.aborted) return;

      // No change since last IDB write → skip persist,
      // unless the post was dirty and now matches git (e.g. after a successful push/pull)
      if (dbPost && contentEqual(normalized, dbPost)) {
        if (
          this.syncBaseline &&
          dbPost.dirty &&
          contentEqual(normalized, this.syncBaseline)
        ) {
          await this.#write({ ...normalized, dirty: 0 }, signal);
        }
        return;
      }

      // Content changed: dirty = true, unless it matches what git has
      const needsPush = this.syncBaseline
        ? !contentEqual(normalized, this.syncBaseline)
        : true;
      await this.#write({ ...normalized, dirty: needsPush ? 1 : 0 }, signal);
    } catch (err) {
      this.config.onError(err instanceof Error ? err.message : "Save failed");
    }
  }

  #abortInflightSave(): AbortSignal {
    this.aborter?.abort();
    this.aborter = new AbortController();
    return this.aborter.signal;
  }

  isScheduled(): boolean {
    return this.timer !== null;
  }

  schedule() {
    this.cancel();
    this.timer = setTimeout(() => {
      // this null helps with the isScheduled check
      this.timer = null;
      const signal = this.#abortInflightSave();
      void this.#doSave(signal);
    }, 50);
  }

  async flush() {
    this.cancel();
    const signal = this.#abortInflightSave();
    await this.#doSave(signal);
  }

  cancel() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  updateBaseline(syncedPost: IPostRecord) {
    this.syncBaseline = toContent(JSON.parse(JSON.stringify(syncedPost)));
    this.schedule();
  }
}
