import type { Api } from "./engine";
import { SYNC_ACCOUNT_HEADER } from "./errors";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function call<T>(path: string, init?: RequestInit, profileConflict = false): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("content-type", "application/json");
  const r = await fetch(path, { credentials: "same-origin", cache: "no-store", ...init, headers });
  const body = await r.json().catch(() => null);
  const conflict = profileConflict && r.status === 409 && body?.ok === false && "profile" in body && !body.error;
  if (!r.ok && !conflict) throw new ApiError(r.status, body?.message ?? `Request failed (${r.status})`);
  return body as T;
}

/** Pin every request to the account that owns this sync, even if another tab signs in. */
export function apiForAccount(userId: string): Api {
  const headers = { [SYNC_ACCOUNT_HEADER]: userId };
  return {
    pull: after => call(`/api/sync/progress?after=${after}`, { headers }),
    push: body => call("/api/sync/progress", { method: "POST", headers, body: JSON.stringify({ ...body, origin: "web" }) }),
    getProfile: async () => (await call<{ profile: Awaited<ReturnType<Api["getProfile"]>> }>("/api/sync/profile", { headers })).profile,
    putProfile: (data, baseVersion) => call("/api/sync/profile", { method: "PUT", headers, body: JSON.stringify({ data, baseVersion, origin: "web" }) }, true),
  };
}
