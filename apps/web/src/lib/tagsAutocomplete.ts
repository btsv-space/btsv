// Pure helpers for the TagsInput combobox: the tags value stays a single
// comma-separated string; autocomplete operates on the segment at the caret.

/** Text of the comma-delimited segment containing the caret (trimmed). */
export function getActiveSegment(value: string, caret: number): string {
  const start = value.lastIndexOf(",", caret - 1) + 1;
  const nextComma = value.indexOf(",", caret);
  const end = nextComma === -1 ? value.length : nextComma;
  return value.slice(start, end).trim();
}

/**
 * Splice `tag` over the segment at the caret. Appends ", " only when the
 * segment is the last one (a following comma already separates). Returns
 * the new value and the caret position after the inserted text.
 */
export function replaceSegment(
  value: string,
  caret: number,
  tag: string,
): { value: string; caret: number } {
  const start = value.lastIndexOf(",", caret - 1) + 1;
  const nextComma = value.indexOf(",", caret);
  const end = nextComma === -1 ? value.length : nextComma;
  const prefix = start > 0 ? " " : "";
  const suffix = nextComma === -1 ? ", " : "";
  const inserted = `${prefix}${tag}${suffix}`;
  return {
    value: value.slice(0, start) + inserted + value.slice(end),
    caret: start + inserted.length,
  };
}

/**
 * Candidates for `segment`: case-insensitive substring match, prefix matches
 * first, alphabetical within a group. Tags already present in other segments
 * of `value` are excluded. An empty segment yields nothing — at least one
 * typed character is required (no match-all on focus).
 */
export function filterTags(
  allTags: string[],
  segment: string,
  value: string,
  limit = 10,
): string[] {
  const seg = segment.toLowerCase();
  if (seg === "") return [];
  const used = new Set(
    value
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
  );
  used.delete(seg);
  return allTags
    .filter((t) => {
      const lt = t.toLowerCase();
      return !used.has(lt) && lt.includes(seg);
    })
    .sort((a, b) => {
      const ap = a.toLowerCase().startsWith(seg) ? 0 : 1;
      const bp = b.toLowerCase().startsWith(seg) ? 0 : 1;
      return ap - bp || a.localeCompare(b);
    })
    .slice(0, limit);
}
