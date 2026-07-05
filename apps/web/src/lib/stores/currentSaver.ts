import { DebouncedSaver } from "$lib/saver";
import type { ICurrentSaver, IDebouncedSaverConfig } from "$lib/shared/types";

let currentSaver: ICurrentSaver | null;

export function createCurrentSaver(
  config: IDebouncedSaverConfig,
): DebouncedSaver {
  if (config) {
    const projectId = config.projectId;
    const postId = config.getWorkingPost()?.id;
    if (projectId && postId) {
      const saver = new DebouncedSaver(config);
      currentSaver = { projectId, postId, saver };
      return saver;
    }
  }
  throw Error("createCurrentSaver failed.");
}

export async function destroyCurrentSaver(): Promise<void> {
  if (!currentSaver) return;
  await currentSaver?.saver.cancel();
  currentSaver = null;
}

export function getCurrentSaver(): Omit<ICurrentSaver, "saver"> | null {
  return currentSaver;
}
