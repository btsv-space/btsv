import { redirect } from "@sveltejs/kit";
import { isAuthenticated } from "$lib/stores/auth.svelte";
import { ERoute } from "$lib/shared/types";

// runs before the login paints — authed users never paint the login form.
export function load() {
  if (isAuthenticated.value) throw redirect(307, ERoute.HOME);
}
