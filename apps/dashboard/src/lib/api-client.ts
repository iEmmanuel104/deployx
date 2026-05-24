import { createApiClient } from "$lib/api.js";
import { getToken, setToken } from "$lib/auth.svelte.js";

export const api = createApiClient("", getToken, setToken);
