import deepEqual from "fast-deep-equal";

import {
  CONTENT_KEYS,
  type IPostRecord,
  type IDebouncedSaverParams,
  type TContentKey,
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

function pickContent(post: IPostRecord): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(CONTENT_KEYS) as TContentKey[]) {
    result[key] = post[key];
  }
  return result;
}

export function contentEqual(a: IPostRecord, b: IPostRecord): boolean {
  return deepEqual(pickContent(a), pickContent(b));
}

export class DebouncedSaver {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastSaved: IPostRecord | null;
  private syncBaseline: IPostRecord | null;
  private params: IDebouncedSaverParams;

  constructor(params: IDebouncedSaverParams) {
    this.params = params;
    this.lastSaved = params.initialPost
      ? JSON.parse(JSON.stringify(params.initialPost))
      : null;
    // TODO: Do we need to keep a copy of syncBaseline? Might get stale. Can we read fs directly?
    this.syncBaseline = params.gitBaseline
      ? JSON.parse(JSON.stringify(params.gitBaseline))
      : null;
  }

  async #write(saved: IPostRecord) {
    await dbSavePost(saved);
    this.lastSaved = saved;
    this.params.onSave(saved);
  }

  async #doSave() {
    const workingPost = this.params.getWorkingPost();
    const tagsInput = this.params.getTagsInput();
    if (!workingPost) return;

    const normalized = normalizePost(workingPost, tagsInput);

    try {
      // No change since last DB save → skip persist,
      // unless the post was dirty and now matches git (e.g. after a successful push/pull)
      if (this.lastSaved && contentEqual(normalized, this.lastSaved)) {
        if (
          this.syncBaseline &&
          this.lastSaved.dirty &&
          contentEqual(normalized, this.syncBaseline)
        ) {
          await this.#write({ ...normalized, dirty: false });
        }
        return;
      }

      // Content changed: dirty = true, unless it matches what git has
      const needsPush = this.syncBaseline
        ? !contentEqual(normalized, this.syncBaseline)
        : true;
      await this.#write({ ...normalized, dirty: needsPush });
    } catch (err) {
      this.params.onError(err instanceof Error ? err.message : "Save failed");
    }
  }

  schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.#doSave();
    }, 200);
  }

  async flush() {
    this.cancel();
    await this.#doSave();
  }

  cancel() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  isUnsaved(): boolean {
    const wp = this.params.getWorkingPost();
    const ti = this.params.getTagsInput();
    if (!wp || !this.lastSaved) return false;
    return !contentEqual(normalizePost(wp, ti), this.lastSaved);
  }

  updateBaseline(syncedPost: IPostRecord) {
    this.syncBaseline = JSON.parse(
      JSON.stringify({ ...syncedPost, dirty: false }),
    );
  }
}
