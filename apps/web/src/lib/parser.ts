import matter from "gray-matter";
import {
  KNOWN_KEYS,
  type IPostRecord,
  type TParsedPost,
} from "$lib/shared/types";
import type { BtsvPostFrontmatter } from "$lib/contract/frontmatter";
import { today } from "$lib/shared/utils";

function toDateStr(val: unknown, fallback: string): string {
  if (val instanceof Date) {
    return val.toISOString().split("T")[0];
  }
  return String(val ?? fallback);
}

function extractExtra(data: Record<string, unknown>): Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  for (const key of Object.keys(data)) {
    if (!KNOWN_KEYS.has(key)) {
      extra[key] = data[key];
    }
  }
  return extra;
}

export function parseMdx(raw: string, id: string): TParsedPost {
  const { data, content } = matter(raw);
  const fm = data as BtsvPostFrontmatter;

  const extra = extractExtra(fm as unknown as Record<string, unknown>);

  return {
    id: String(fm.id ?? id),
    slug: String(fm.slug ?? ""),
    title: String(fm.title ?? ""),
    dateCreated: toDateStr(fm.dateCreated, today()),
    dateUpdated: toDateStr(fm.dateUpdated, today()),
    datePublished:
      fm.datePublished != null ? toDateStr(fm.datePublished, "") : undefined,
    description: String(fm.description ?? ""),
    tags: Array.isArray(fm.tags)
      ? fm.tags.filter((t: unknown) => typeof t === "string")
      : [],
    draft: Boolean(fm.draft),
    page: Boolean(fm.page),
    body: content.trim(),
    extra,
  };
}

export function serializeMdx(post: IPostRecord): string {
  const fm: BtsvPostFrontmatter & Record<string, unknown> = {
    ...post.extra,
    title: post.title,
    id: post.id,
    dateCreated: post.dateCreated,
    dateUpdated: post.dateUpdated,
    description: post.description,
    tags: post.tags,
    draft: post.draft,
    page: post.page,
  };

  if (post.slug) {
    fm.slug = post.slug;
  }
  if (post.datePublished) {
    fm.datePublished = post.datePublished;
  }

  return matter.stringify(post.body, fm);
}
