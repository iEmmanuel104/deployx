import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
  // Expose the JWT to the client so post-reload client-side fetches can attach
  // Authorization: Bearer <token>. The cookie itself is httpOnly + SameSite=Strict
  // — same-origin only — and the token is short-lived (15 min). Without this,
  // page reloads wipe the in-memory $state and every API call returns 401.
  return {
    user: locals.user ?? null,
    accessToken: locals.user ? (cookies.get("deployx_token") ?? null) : null,
  };
};
