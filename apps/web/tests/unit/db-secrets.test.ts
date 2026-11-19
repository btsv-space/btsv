import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import {
  dbClearAll,
  dbGetGitToken,
  dbGetPosts,
  dbGetPrefs,
  dbGetProjects,
  dbSaveGitToken,
  dbSavePost,
  dbSavePrefs,
  dbSaveProject,
} from "$lib/db";
import type {
  IPostRecord,
  ISecretRecord,
  TProjectEntry,
} from "$lib/shared/types";

function makePost(id = "post-1"): IPostRecord {
  return {
    projectId: "proj-1",
    id,
    slug: "",
    title: "",
    dateCreated: "2026-01-01",
    dateUpdated: "2026-01-01",
    description: "",
    tags: [],
    draft: false,
    page: false,
    body: "",
    extra: {},
    dirty: 0,
  };
}

const secret: ISecretRecord = {
  projectId: "proj-1",
  iv: "iv-value",
  ciphertext: "ciphertext-value",
  updatedAt: 1,
};

const project: TProjectEntry = {
  id: "proj-1",
  name: "Test",
  repoUrl: "https://github.com/user/repo",
  status: "ready",
  error: "",
};

describe("secrets store", () => {
  beforeEach(async () => {
    await dbClearAll();
  });

  it("round-trips a secret record", async () => {
    await dbSaveGitToken(secret);
    expect(await dbGetGitToken("proj-1")).toEqual(secret);
  });

  it("dbClearAll empties every store", async () => {
    await dbSaveGitToken(secret);
    await dbSavePost(makePost());
    await dbSaveProject(project);
    await dbSavePrefs({ name: "local" });

    await dbClearAll();

    expect(await dbGetGitToken("proj-1")).toBeUndefined();
    expect(await dbGetPosts("proj-1", { limit: 10 })).toEqual([]);
    expect(await dbGetProjects()).toEqual([]);
    expect(await dbGetPrefs()).toBeUndefined();
  });
});
