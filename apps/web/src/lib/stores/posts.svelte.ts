import type { IPostRecord } from "$lib/shared/types";

export const posts = $state<{ value: IPostRecord[] }>({ value: [] });
