import type { BtsvPostFrontmatter } from "$lib/contract/frontmatter";
import type { DebouncedSaver } from "$lib/saver";

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

export enum SyncerOps {
  PULL = "pull",
  PUSH = "push",
  DELETE = "delete",
  INITIAL_PULL = "initialPull",
}

export interface ISyncerProjectQueueValue {
  tail: Promise<unknown>;
  lastPromise: Promise<unknown>;
  lastOp: SyncerOps;
  lastOpResolved: boolean;
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
  dirty: boolean;
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
    postEntries: IPostEntry[];
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
  dirty: 0 | 1;
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
  gitBaseline?: IPostRecord | null;
  onSave: (post: IPostRecord) => void;
  onError: (error: string) => void;
}

export interface ICurrentSaver {
  projectId: string;
  postId: string;
  saver: DebouncedSaver;
}

export interface ISyncerConfig {
  getPrefs: () => IUserPreferences;
  getProjects: () => TProjectEntry[];
  isPostEditing?(projectId: string, postId: string): boolean;
  onSyncStatus?(
    projectId: string,
    status: Omit<ISyncStatus, "dirty">,
    dirtyOverride: boolean | null,
  ): void;
}

export interface ILoadPostsOpts {
  forcePull?: boolean;
  page?: number;
  pageSize?: number;
}

// ── Type aliases ───────────────────────────────────

export type TParsedPost = Omit<IPostRecord, "projectId" | "dirty">;

export type TGitStatus = string;

export type TSyncType = "git" | "api";

export type TSyncHook = (
  projectId?: string,
  postId?: string,
  syncedPost?: IPostRecord,
  lastCommitTime?: number,
) => void;

type TMetadataKey =
  | "projectId"
  | "id"
  | "dirty"
  | "dateCreated"
  | "dateUpdated";

export type TContentKey = Exclude<keyof IPostRecord, TMetadataKey>;

export type IPostContent = Omit<IPostRecord, TMetadataKey>;

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
