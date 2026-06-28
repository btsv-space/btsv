export const APP_NAMESPACE = "btsv";
export const FS_DB_NAME = "btsv_fs";

export const PROJECTS_DIR = "/projects";
export const POSTS_DIR = "src/content/posts";
export const POST_EXT = ".mdx";

export const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:8080/api";

export const DEFAULT_PROXY_URL =
  import.meta.env.VITE_PROXY_URL ?? "http://localhost:9999";

export const GITHUB_TOKEN_URL = "https://github.com/settings/tokens?type=beta";

export const CREATION_DATE_FIELD = "_creationDate";

export const IV_LENGTH = 12;

export const DEFAULT_GIT_BRANCH = "staging";
export const MAIN_GIT_BRANCH = "main";
