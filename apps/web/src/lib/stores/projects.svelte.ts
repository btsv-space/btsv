import type { TProjectEntry } from "$lib/shared/types";

export const projects = $state<{ value: TProjectEntry[] }>({ value: [] });
