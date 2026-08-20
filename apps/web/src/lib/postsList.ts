import {
  DRAFT_FILTERS,
  PAGE_FILTERS,
  SORT_FIELDS,
  SORT_ORDERS,
  type IPostRecord,
  type IPostsListPrefs,
  type TDraftFilter,
  type TPageFilter,
  type TPostSortField,
  type TSortOrder,
} from "$lib/shared/types";

export const DEFAULT_LIST_PREFS: IPostsListPrefs = {
  sort: "dateCreated",
  order: "desc",
  draft: "all",
  page: "all",
};

export function isDefaultListPrefs(p: IPostsListPrefs): boolean {
  return (
    p.sort === DEFAULT_LIST_PREFS.sort &&
    p.order === DEFAULT_LIST_PREFS.order &&
    p.draft === DEFAULT_LIST_PREFS.draft &&
    p.page === DEFAULT_LIST_PREFS.page
  );
}

export function matchesListPrefs(
  post: IPostRecord,
  prefs: IPostsListPrefs,
): boolean {
  const wantDraft = prefs.draft === "all" ? null : prefs.draft === "drafts";
  const wantPage = prefs.page === "all" ? null : prefs.page === "pages";
  return (
    !post.deleted &&
    (wantDraft === null || post.draft === wantDraft) &&
    (wantPage === null || post.page === wantPage)
  );
}

export function sanitizeListPrefs(raw: unknown): IPostsListPrefs {
  const p = (raw ?? {}) as Partial<Record<keyof IPostsListPrefs, unknown>>;
  return {
    sort: SORT_FIELDS.includes(p.sort as TPostSortField)
      ? (p.sort as TPostSortField)
      : DEFAULT_LIST_PREFS.sort,
    order: SORT_ORDERS.includes(p.order as TSortOrder)
      ? (p.order as TSortOrder)
      : DEFAULT_LIST_PREFS.order,
    draft: DRAFT_FILTERS.includes(p.draft as TDraftFilter)
      ? (p.draft as TDraftFilter)
      : DEFAULT_LIST_PREFS.draft,
    page: PAGE_FILTERS.includes(p.page as TPageFilter)
      ? (p.page as TPageFilter)
      : DEFAULT_LIST_PREFS.page,
  };
}
