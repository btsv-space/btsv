// Second-precision ISO UTC (millis stripped for cleaner git diffs)
export function now(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function toDatetimeLocalValue(isoString: string | undefined): string {
  if (!isoString) return "";
  // legacy day-precision: treat as local midnight — parsing as UTC would
  // shift the displayed day in negative-offset timezones
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoString)) return `${isoString}T00:00`;
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDatetimeLocalValue(local: string): string | undefined {
  if (!local) return undefined;
  const d = new Date(local);
  if (isNaN(d.getTime())) return undefined;
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function formatPostDate(isoString: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoString)) return isoString;
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function commitTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
