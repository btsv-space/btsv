import { PROJECT_COMMITS_STORAGE_KEY } from "$lib/shared/constants";

function hydrate(): Record<string, number> {
  try {
    const raw = localStorage.getItem(PROJECT_COMMITS_STORAGE_KEY);
    return (JSON.parse(raw ?? "{}") ?? {}) as Record<string, number>;
  } catch {
    return {};
  }
}

class ProjectCommitsStore {
  #commits = $state<Record<string, number>>(hydrate());

  get(projectId: string): number | undefined {
    return this.#commits[projectId];
  }

  get mostRecentProjectId(): string | null {
    let recentId: string | null = null;
    let recentTime = -Infinity;

    for (const [projectId, time] of Object.entries(this.#commits)) {
      if (time > recentTime) {
        recentId = projectId;
        recentTime = time;
      }
    }

    return recentId;
  }

  set(projectId: string, timestamp: number): void {
    this.#commits[projectId] = timestamp;

    try {
      localStorage.setItem(
        PROJECT_COMMITS_STORAGE_KEY,
        JSON.stringify(this.#commits),
      );
    } catch {
      // ignore storage errors
    }
  }
}

export const projectCommits = new ProjectCommitsStore();
