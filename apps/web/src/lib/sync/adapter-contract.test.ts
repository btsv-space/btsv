import { describe, it, expect, expectTypeOf } from "vitest";
import { ApiAdapter } from "$lib/sync/api-adapter";
import { GitAdapter } from "$lib/sync/git-adapter";
import type { ISyncAdapter } from "$lib/shared/types";

const EXPECTED_METHODS: Array<keyof ISyncAdapter> = [
  "checkRemote",
  "pull",
  "initialPull",
  "mergeToMain",
  "commitAndPush",
  "commitDeletion",
];

const apiAdapter = new ApiAdapter("https://github.com/o/r.git");
const gitAdapter = new GitAdapter("https://github.com/o/r.git");

function publicMethods(adapter: ISyncAdapter): Set<string> {
  const out = new Set<string>();
  let proto: object | null = Object.getPrototypeOf(adapter);
  while (proto && proto !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (
        name !== "constructor" &&
        typeof (proto as Record<string, unknown>)[name] === "function"
      ) {
        out.add(name);
      }
    }
    proto = Object.getPrototypeOf(proto);
  }
  return out;
}

describe("ISyncAdapter contract", () => {
  it("ApiAdapter exposes every ISyncAdapter method", () => {
    const methods = publicMethods(apiAdapter);
    for (const m of EXPECTED_METHODS) {
      expect(methods, `ApiAdapter missing ${m}`).toContain(m);
    }
  });

  it("GitAdapter exposes every ISyncAdapter method", () => {
    const methods = publicMethods(gitAdapter);
    for (const m of EXPECTED_METHODS) {
      expect(methods, `GitAdapter missing ${m}`).toContain(m);
    }
  });

  it("both adapters expose the same set of public methods (no one-sided additions)", () => {
    const apiMethods = publicMethods(apiAdapter);
    const gitMethods = publicMethods(gitAdapter);
    const apiOnly = [...apiMethods].filter((m) => !gitMethods.has(m));
    const gitOnly = [...gitMethods].filter((m) => !apiMethods.has(m));
    expect({ apiOnly, gitOnly }).toEqual({ apiOnly: [], gitOnly: [] });
  });

  it("each ISyncAdapter method has the same declared arity (param count) on both adapters", () => {
    for (const m of EXPECTED_METHODS) {
      const apiFn = apiAdapter[m] as unknown as { length: number };
      const gitFn = gitAdapter[m] as unknown as { length: number };
      expect(
        apiFn.length,
        `${m} arity: api=${apiFn.length}, git=${gitFn.length}`,
      ).toBe(gitFn.length);
    }
  });

  it("ApiAdapter.checkRemote param tuple mirrors ISyncAdapter (compile-time via svelte-check)", () => {
    expectTypeOf<Parameters<ApiAdapter["checkRemote"]>>().toEqualTypeOf<
      Parameters<ISyncAdapter["checkRemote"]>
    >();
  });
  it("ApiAdapter.pull param tuple mirrors ISyncAdapter (compile-time via svelte-check)", () => {
    expectTypeOf<Parameters<ApiAdapter["pull"]>>().toEqualTypeOf<
      Parameters<ISyncAdapter["pull"]>
    >();
  });
  it("ApiAdapter.initialPull param tuple mirrors ISyncAdapter (compile-time via svelte-check)", () => {
    expectTypeOf<Parameters<ApiAdapter["initialPull"]>>().toEqualTypeOf<
      Parameters<ISyncAdapter["initialPull"]>
    >();
  });
  it("ApiAdapter.commitAndPush param tuple mirrors ISyncAdapter (compile-time via svelte-check)", () => {
    expectTypeOf<Parameters<ApiAdapter["commitAndPush"]>>().toEqualTypeOf<
      Parameters<ISyncAdapter["commitAndPush"]>
    >();
  });
  it("ApiAdapter.commitDeletion param tuple mirrors ISyncAdapter (compile-time via svelte-check)", () => {
    expectTypeOf<Parameters<ApiAdapter["commitDeletion"]>>().toEqualTypeOf<
      Parameters<ISyncAdapter["commitDeletion"]>
    >();
  });
  it("ApiAdapter.mergeToMain param tuple mirrors ISyncAdapter (compile-time via svelte-check)", () => {
    expectTypeOf<Parameters<ApiAdapter["mergeToMain"]>>().toEqualTypeOf<
      Parameters<ISyncAdapter["mergeToMain"]>
    >();
  });

  it("GitAdapter.checkRemote param tuple mirrors ISyncAdapter (compile-time via svelte-check)", () => {
    expectTypeOf<Parameters<GitAdapter["checkRemote"]>>().toEqualTypeOf<
      Parameters<ISyncAdapter["checkRemote"]>
    >();
  });
  it("GitAdapter.pull param tuple mirrors ISyncAdapter (compile-time via svelte-check)", () => {
    expectTypeOf<Parameters<GitAdapter["pull"]>>().toEqualTypeOf<
      Parameters<ISyncAdapter["pull"]>
    >();
  });
  it("GitAdapter.initialPull param tuple mirrors ISyncAdapter (compile-time via svelte-check)", () => {
    expectTypeOf<Parameters<GitAdapter["initialPull"]>>().toEqualTypeOf<
      Parameters<ISyncAdapter["initialPull"]>
    >();
  });
  it("GitAdapter.commitAndPush param tuple mirrors ISyncAdapter (compile-time via svelte-check)", () => {
    expectTypeOf<Parameters<GitAdapter["commitAndPush"]>>().toEqualTypeOf<
      Parameters<ISyncAdapter["commitAndPush"]>
    >();
  });
  it("GitAdapter.commitDeletion param tuple mirrors ISyncAdapter (compile-time via svelte-check)", () => {
    expectTypeOf<Parameters<GitAdapter["commitDeletion"]>>().toEqualTypeOf<
      Parameters<ISyncAdapter["commitDeletion"]>
    >();
  });
  it("GitAdapter.mergeToMain param tuple mirrors ISyncAdapter (compile-time via svelte-check)", () => {
    expectTypeOf<Parameters<GitAdapter["mergeToMain"]>>().toEqualTypeOf<
      Parameters<ISyncAdapter["mergeToMain"]>
    >();
  });
});
