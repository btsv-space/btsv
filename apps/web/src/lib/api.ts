import { API_BASE_URL } from "$lib/shared/constants";
import type {
  IUser,
  IProject,
  ILoginResult,
  IMeResult,
  IRegisterPayload,
  IChangePasswordPayload,
  ISecretPayload,
  IUserPreferences,
  TSyncType,
} from "$lib/shared/types";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  auth: {
    register(payload: IRegisterPayload) {
      return request<IUser>("/auth/register", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },

    login(username: string, password: string) {
      return request<ILoginResult>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
    },

    logout() {
      return request<void>("/auth/logout", { method: "POST" });
    },

    me() {
      return request<IMeResult | null>("/auth/me");
    },

    changePassword(payload: IChangePasswordPayload) {
      return request<void>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
  },

  preferences: {
    get() {
      return request<IUserPreferences>("/user/preferences");
    },

    update(payload: { syncType?: TSyncType; proxyUrl?: string }) {
      return request<IUserPreferences>("/user/preferences", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    },
  },

  projects: {
    list() {
      return request<IProject[]>("/projects");
    },

    create(name: string, repoUrl: string) {
      return request<IProject>("/projects", {
        method: "POST",
        body: JSON.stringify({ name, repoUrl }),
      });
    },

    getSecret(projectId: string) {
      return request<ISecretPayload>(`/projects/${projectId}/secret`);
    },

    setSecret(projectId: string, payload: ISecretPayload) {
      return request<void>(`/projects/${projectId}/secret`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
  },
};
