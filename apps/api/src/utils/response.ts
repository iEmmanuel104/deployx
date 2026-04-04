import type { ApiMeta } from "@deployx/types";

export function success<T>(data: T): {
  ok: true;
  data: T;
  meta: ApiMeta;
} {
  return {
    ok: true,
    data,
    meta: {
      ts: new Date().toISOString(),
      version: "0.1.0",
    },
  };
}
