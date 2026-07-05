import deepEqual from "fast-deep-equal";

import {
  type IPostContent,
  type IPostRecord,
  type IDebouncedSaverConfig,
} from "$lib/shared/types";
import { dbSavePost } from "$lib/db";

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

  async #doSave(signal: AbortSignal): Promise<void> {
    if (signal.aborted) return;

    const workingPost = this.config.getWorkingPost();
    const tagsInput = this.config.getTagsInput();
    if (!workingPost) return;

    const normalized = normalizePost(workingPost, tagsInput);

    try {
      const needsPush = this.syncBaseline
        ? !contentEqual(normalized, this.syncBaseline)
        : true;
      const postSaved: IPostRecord = {
        ...normalized,
        dirty: needsPush ? 1 : 0,
      };
      await dbSavePost(postSaved);

      if (signal.aborted) return;

      this.config.onSave(postSaved);
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
