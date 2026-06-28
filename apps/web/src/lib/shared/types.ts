import type { BtsvPostFrontmatter } from "$lib/contract/frontmatter";

// ── Enums ──────────────────────────────────────────

export enum Route {
  HOME = "/",
  LOGIN = "/login",
  SETTINGS = "/settings",
}

export enum SyncState {
  SYNCED = "synced",
  SYNCING_PULL = "syncing-pull",
  SYNCING_PUSH = "syncing-push",
  DIRTY = "dirty",
  ERROR = "error",
  CONFLICT = "conflict",
}

// ── Interfaces ─────────────────────────────────────

export interface IUser {
  id: string;
  username: string;
}

export interface IProject {
  id: string;
  name: string;
  repoUrl: string;
}

export interface ISyncStatus {
  state: SyncState;
  errorMsg: string;
}

export interface IUserPreferences {
  syncType: TSyncType;
  proxyUrl: string;
}

export interface IPostEntry {
  id: string;
  content?: string;
  deleted?: boolean;
}

export interface IRemoteCheckResult {
  hasChanges: boolean;
  lastCommitTime?: number;
  headSha?: string;
}

export type TSyncHook = (
  projectId?: string,
  postId?: string,
  syncedPost?: IPostRecord,
  lastCommitTime?: number,
) => void;

export interface ISyncAdapter {
  checkRemote(
    projectId: string,
    gitToken: string,
    storedRemoteSha?: string,
  ): Promise<IRemoteCheckResult>;
  pull(
    projectId: string,
    gitToken: string,
    storedRemoteSha?: string,
    headSha?: string,
  ): Promise<IPostEntry[]>;
  initialPull(
    projectId: string,
    gitToken: string,
  ): Promise<{
    entries: IPostEntry[];
    lastCommitTime?: number;
    headSha?: string;
  }>;
  commitAndPush(
    projectId: string,
    postId: string,
    content: string,
    message: string,
    gitToken: string,
  ): Promise<string | null>;
  commitDeletion(
    projectId: string,
    postId: string,
    message: string,
    gitToken: string,
  ): Promise<string | null>;
  mergeToMain(projectId: string, gitToken: string): Promise<void>;
}

export interface ILoginResult {
  user: IUser;
  encryptedDek: string;
  kekSalt: string;
}

export interface IMeResult {
  id: string;
  username: string;
  encryptedDek: string;
  kekSalt: string;
}

export interface IRegisterPayload {
  username: string;
  password: string;
  encryptedDek: string;
  kekSalt: string;
}

export interface IChangePasswordPayload {
  oldPassword: string;
  newPassword: string;
  encryptedDek: string;
  kekSalt: string;
}

export interface ISecretPayload {
  ciphertext: string;
  iv: string;
}

export interface IPostRecord extends BtsvPostFrontmatter {
  projectId: string;
  id: string;
  slug: string;
  description: string;
  tags: string[];
  draft: boolean;
  body: string;
  extra: Record<string, unknown>;
  dirty: boolean;
}

export interface IGitState {
  projectId: string;
  dir: string;
  status: "idle" | "cloning" | "ready" | "error";
  error?: string;
}

export interface ICloneOpts {
  project: IProject;
  token: string;
  onStatus: (status: TGitStatus) => void;
  onDebug: (msg: string) => void;
}

export interface IDebouncedSaverConfig {
  projectId: string;
  getWorkingPost: () => IPostRecord | null;
  getTagsInput: () => string;
  initialPost: IPostRecord | null;
  gitBaseline?: IPostRecord | null;
  onSave: (post: IPostRecord) => void;
  onError: (error: string) => void;
}

export interface ISyncerConfig {
  getPrefs: () => IUserPreferences;
  getProjects: () => TProjectEntry[];
  onSyncStatus?: (projectId: string, status: ISyncStatus) => void;
}

export interface IParseResult {
  post: Pick<
    IPostRecord,
    | "id"
    | "slug"
    | "title"
    | "dateCreated"
    | "dateUpdated"
    | "datePublished"
    | "description"
    | "tags"
    | "draft"
    | "body"
    | "extra"
  >;
}

export interface IDocument {
  projectId: string;
  path: string;
  content: string;
  updatedAt: number;
}

// ── Type aliases ───────────────────────────────────

export type TGitStatus = string;

export type TSyncType = "git" | "api";

type TMetadataKey =
  | "projectId"
  | "id"
  | "dirty"
  | "dateCreated"
  | "dateUpdated";

export type TContentKey = Exclude<keyof IPostRecord, TMetadataKey>;

export type TProjectEntry = IProject & {
  status: "unknown" | "ready" | "cloning" | "error";
  error: string;
  syncType?: TSyncType;
  storedRemoteSha?: string;
};

// ── Key-set constants ──────────────────────────────

const FRONTMATTER_FIELDS = {
  title: true,
  dateCreated: true,
  dateUpdated: true,
  datePublished: true,
  description: true,
  tags: true,
  draft: true,
  id: true,
  slug: true,
} as const satisfies Record<keyof BtsvPostFrontmatter, true>;

export const KNOWN_KEYS = new Set(Object.keys(FRONTMATTER_FIELDS));

export const CONTENT_KEYS = {
  title: true,
  slug: true,
  datePublished: true,
  description: true,
  tags: true,
  draft: true,
  body: true,
  extra: true,
} as const satisfies { [K in TContentKey]: true };
