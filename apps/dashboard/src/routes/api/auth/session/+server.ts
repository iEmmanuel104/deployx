import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, cookies }) => {
  const { accessToken } = await request.json();
  cookies.set("deployx_token", accessToken, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    maxAge: 60 * 15, // 15 min (match JWT expiry)
  });
  return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ cookies }) => {
  cookies.delete("deployx_token", { path: "/" });
  return json({ ok: true });
};
