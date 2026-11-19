import {
  PROJECTS_DIR,
  POSTS_DIR,
  POST_EXT,
  FS_DB_NAME,
} from "$lib/shared/constants";

type LightningFSInstance = InstanceType<
  typeof import("@isomorphic-git/lightning-fs")
>;

let fsInstance: LightningFSInstance | null = null;

export async function getFS(): Promise<LightningFSInstance> {
  if (!fsInstance) {
    const { default: LightningFS } =
      await import("@isomorphic-git/lightning-fs");
    fsInstance = new LightningFS(FS_DB_NAME);
  }
  return fsInstance;
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

export async function clearFS(): Promise<void> {
  const fs = await getFS();

  async function remove(path: string): Promise<void> {
    let stat: Awaited<ReturnType<typeof fs.promises.stat>>;
    try {
      stat = await fs.promises.stat(path);
    } catch {
      return;
    }
    if (stat.isDirectory()) {
      const entries = await fs.promises.readdir(path);
      for (const entry of entries) {
        await remove(`${path}/${entry}`);
      }
      await fs.promises.rmdir(path).catch(() => {});
    } else {
      await fs.promises.unlink(path).catch(() => {});
    }
  }

  let entries: string[];
  try {
    entries = await fs.promises.readdir("/");
  } catch {
    return;
  }
  for (const entry of entries) {
    await remove(`/${entry}`);
  }
}
