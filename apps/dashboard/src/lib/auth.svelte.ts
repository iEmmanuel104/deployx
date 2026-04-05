import { goto } from "$app/navigation";

const API_BASE = "";  // Use relative paths (proxy handles it)

let accessToken = $state<string | null>(null);
let user = $state<{ id: string; email: string; name: string; role: string } | null>(null);

export function getToken(): string | null {
  return accessToken;
}

export function getUser() {
  return user;
}

export function setInitialAuth(initialUser: { id: string; email: string; name: string; role: string } | null) {
  user = initialUser;
}

export async function login(email: string, password: string) {
  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    credentials: "include",
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error?.message ?? "Login failed");

  accessToken = data.data.accessToken;
  user = data.data.user;

  // Persist token server-side via session endpoint
  await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken: data.data.accessToken }),
  });

  return data.data;
}

export async function register(name: string, email: string, password: string) {
  const res = await fetch(`${API_BASE}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
    credentials: "include",
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error?.message ?? "Registration failed");

  accessToken = data.data.accessToken;
  user = data.data.user;

  await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken: data.data.accessToken }),
  });

  return data.data;
}

export async function logout() {
  await fetch(`${API_BASE}/api/v1/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
  await fetch("/api/auth/session", { method: "DELETE" });
  accessToken = null;
  user = null;
  await goto("/login");
}
