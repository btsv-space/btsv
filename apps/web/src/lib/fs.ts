import {
  PROJECTS_DIR,
  POSTS_DIR,
  POST_EXT,
  FS_DB_NAME,
  API_REMOTE_SHA_FILE,
} from "$lib/shared/constants";

let fsPromise: ReturnType<
  typeof import("@isomorphic-git/lightning-fs").default
> | null = null;

export async function getFS() {
  if (!fsPromise) {
    const { default: lightningFS } =
      await import("@isomorphic-git/lightning-fs");
    fsPromise = new lightningFS(FS_DB_NAME);
  }
  return fsPromise;
}

export function getDir(projectId: string): string {
  return `${PROJECTS_DIR}/${projectId}`;
}

export function getPostPath(id: string): string {
  return `${POSTS_DIR}/${id}${POST_EXT}`;
}

export async function readPostContent(
  projectId: string,
  postId: string,
): Promise<string> {
  const fs = await getFS();
  const dir = getDir(projectId);
  const filepath = getPostPath(postId);
  const fullPath = `${dir}/${filepath}`;
  return (await fs.promises.readFile(fullPath, "utf8")) as string;
}

export async function ensureDirChain(
  fs: Awaited<ReturnType<typeof getFS>>,
  filePath: string,
): Promise<void> {
  const parts = filePath.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current += "/" + part;
    await fs.promises.mkdir(current).catch(() => {});
  }
}

export async function writePostFile(
  projectId: string,
  postId: string,
  content: string,
): Promise<void> {
  const fs = await getFS();
  const dir = getDir(projectId);
  const fullPath = `${dir}/${getPostPath(postId)}`;
  const parent = fullPath.substring(0, fullPath.lastIndexOf("/"));
  await ensureDirChain(fs, parent);
  await fs.promises.writeFile(fullPath, content, "utf8");
}

export async function deletePostFile(
  projectId: string,
  postId: string,
): Promise<void> {
  const fs = await getFS();
  const dir = getDir(projectId);
  const fullPath = `${dir}/${getPostPath(postId)}`;
  await fs.promises.unlink(fullPath).catch(() => {});
}

export async function postFileExists(
  projectId: string,
  postId: string,
): Promise<boolean> {
  try {
    const fs = await getFS();
    const dir = getDir(projectId);
    const fullPath = `${dir}/${getPostPath(postId)}`;
    await fs.promises.stat(fullPath);
    return true;
  } catch {
    return false;
  }
}

export async function checkProjectDirExists(
  projectId: string,
): Promise<boolean> {
  try {
    const fs = await getFS();
    await fs.promises.stat(`${PROJECTS_DIR}/${projectId}`);
    return true;
  } catch {
    return false;
  }
}

export function getApiRemoteShaPath(projectId: string): string {
  return `${PROJECTS_DIR}/${projectId}/${API_REMOTE_SHA_FILE}`;
}

export async function readApiRemoteSha(
  projectId: string,
): Promise<string | null> {
  try {
    const fs = await getFS();
    const content = await fs.promises.readFile(
      getApiRemoteShaPath(projectId),
      "utf8",
    );
    return (content as string).trim() || null;
  } catch {
    return null;
  }
}

export async function writeApiRemoteSha(
  projectId: string,
  sha: string,
): Promise<void> {
  const fs = await getFS();
  const path = getApiRemoteShaPath(projectId);
  const parent = path.substring(0, path.lastIndexOf("/"));
  await ensureDirChain(fs, parent);
  await fs.promises.writeFile(path, sha, "utf8");
}
