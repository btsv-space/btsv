import { PROJECT_COMMITS_STORAGE_KEY } from "$lib/shared/constants";

function read(): Record<string, number> {
  try {
    return JSON.parse(
      localStorage.getItem(PROJECT_COMMITS_STORAGE_KEY) ?? "{}",
    );
  } catch {
    return {};
  }
}

function write(data: Record<string, number>): void {
  localStorage.setItem(PROJECT_COMMITS_STORAGE_KEY, JSON.stringify(data));
}

export function getProjectCommits(): Record<string, number> {
  return read();
}

export function setProjectCommitTime(
  projectId: string,
  timestamp: number,
): void {
  const data = read();
  data[projectId] = timestamp;
  write(data);
}

export function getRecentProjectId(): string | null {
  const data = read();
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  return entries[0]?.[0] ?? null;
}
