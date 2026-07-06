<script lang="ts">
  import { goto } from "$app/navigation";
  import {
    isAuthenticated,
    ensureInit,
    currentUser,
    dek,
  } from "$lib/stores/auth.svelte";
  import { api } from "$lib/api";
  import {
    generateUserKeys,
    deriveKEK,
    wrapDEK,
    unwrapDEK,
    dekToBase64,
    bytesFromApi,
    bytesToApi,
  } from "$lib/crypto";
  import { IV_LENGTH } from "$lib/shared/constants";
  import { ERoute } from "$lib/shared/types";
  import { onMount } from "svelte";

  const DEK_KEY = "btsv_dek";

  console.log("[/login] mounted");

  let mode: "login" | "register" = $state("login");
  let username = $state("");
  let password = $state("");
  let error = $state("");
  let loading = $state(false);

  onMount(async () => {
    await ensureInit();
    if (isAuthenticated.value) {
      goto(ERoute.HOME, { replaceState: true });
    }
  });

  async function login(uname: string, pwd: string) {
    const result = await api.auth.login(uname, pwd);

    const kekSalt = bytesFromApi(result.kekSalt);
    const blob = bytesFromApi(result.encryptedDek);

    const iv = blob.slice(0, IV_LENGTH);
    const encryptedDek = blob.slice(IV_LENGTH);

    const kek = await deriveKEK(pwd, kekSalt);
    const plainDek = await unwrapDEK(encryptedDek, iv, kek);

    sessionStorage.setItem(DEK_KEY, dekToBase64(plainDek));
    dek.value = plainDek;
    currentUser.value = result.user;
    isAuthenticated.value = true;
    goto(ERoute.HOME, { replaceState: true });
  }

  async function register(uname: string, pwd: string) {
    const { dek: plainDek, kekSalt } = generateUserKeys();

    const kek = await deriveKEK(pwd, kekSalt);
    const { encrypted, iv } = await wrapDEK(plainDek, kek);

    const blob = new Uint8Array(iv.length + encrypted.length);
    blob.set(iv);
    blob.set(encrypted, iv.length);

    const user = await api.auth.register({
      username: uname,
      password: pwd,
      encryptedDek: bytesToApi(blob),
      kekSalt: bytesToApi(kekSalt),
    });

    sessionStorage.setItem(DEK_KEY, dekToBase64(plainDek));
    dek.value = plainDek;
    currentUser.value = user;
    isAuthenticated.value = true;
    goto(ERoute.HOME, { replaceState: true });
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = "";
    loading = true;

    try {
      if (mode === "login") {
        await login(username, password);
      } else {
        await register(username, password);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Something went wrong";
    } finally {
      loading = false;
    }
  }
</script>

<div class="flex items-center justify-center min-h-[calc(100dvh-6rem)]">
  <form
    class="card max-w-90 w-full flex flex-col gap-4 p-8 mx-auto"
    onsubmit={handleSubmit}
  >
    <h1 class="text-xl font-semibold">
      {mode === "login" ? "Sign in" : "Create account"}
    </h1>

    {#if error}
      <p
        class="bg-destructive/10 text-destructive text-sm rounded-md px-3 py-2"
      >
        {error}
      </p>
    {/if}

    <label class="flex flex-col gap-1 text-sm text-muted-foreground">
      <span>Username</span>
      <input
        type="text"
        bind:value={username}
        required
        autocomplete="username"
        class="px-3 py-2 border border-input rounded-md text-[15px] font-inherit bg-background text-foreground"
      />
    </label>

    <label class="flex flex-col gap-1 text-sm text-muted-foreground">
      <span>Password</span>
      <input
        type="password"
        bind:value={password}
        required
        minlength={8}
        autocomplete={mode === "login" ? "current-password" : "new-password"}
        class="px-3 py-2 border border-input rounded-md text-[15px] font-mono bg-background text-foreground"
      />
    </label>

    <button
      type="submit"
      class="btn-primary text-[15px] py-2"
      disabled={loading}
    >
      {loading
        ? "Please wait..."
        : mode === "login"
          ? "Sign in"
          : "Create account"}
    </button>

    <p class="text-sm text-muted-foreground text-center">
      {mode === "login" ? "Don't have an account?" : "Already have an account?"}
      <button
        type="button"
        class="text-sm text-primary cursor-pointer bg-none border-none p-0"
        onclick={() => {
          mode = mode === "login" ? "register" : "login";
          error = "";
        }}
      >
        {mode === "login" ? "Register" : "Sign in"}
      </button>
    </p>
  </form>
</div>
