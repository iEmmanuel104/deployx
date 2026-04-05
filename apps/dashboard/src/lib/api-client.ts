import { createApiClient } from "$lib/api.js";
import { getToken } from "$lib/auth.svelte.js";

export const api = createApiClient("", getToken);
