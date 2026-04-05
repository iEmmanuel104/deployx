import type { Handle } from "@sveltejs/kit";
import { redirect } from "@sveltejs/kit";

const PUBLIC_PATHS = ["/login", "/register", "/api/"];

export const handle: Handle = async ({ event, resolve }) => {
  const token = event.cookies.get("deployx_token");

  if (token) {
    try {
      // Decode JWT payload (base64, no verification - API handles auth)
      const parts = token.split(".");
      const payload = JSON.parse(atob(parts[1]));
      event.locals.user = {
        id: payload.sub,
        email: payload.email,
        name: payload.email.split("@")[0], // Derive name from email for now
        role: payload.role,
      };
    } catch {
      event.cookies.delete("deployx_token", { path: "/" });
    }
  }

  const isPublic = PUBLIC_PATHS.some((p) => event.url.pathname.startsWith(p));
  if (!event.locals.user && !isPublic && event.url.pathname !== "/") {
    throw redirect(303, "/login");
  }

  return resolve(event);
};
