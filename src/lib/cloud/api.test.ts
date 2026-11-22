import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiForAccount } from "./api";
import { SYNC_ACCOUNT_HEADER } from "./errors";

afterEach(() => vi.unstubAllGlobals());
describe("account-bound browser requests", () => {
  it("sends the expected account on every sync request, preserving the JSON content type", async () => {
    const fetch = vi.fn(async () => Response.json({ profile: null }));
    vi.stubGlobal("fetch", fetch);
    const api = apiForAccount("account-a");
    await api.pull(4); await api.push({ attempts: [] }); await api.getProfile(); await api.putProfile({ name: "A" }, 2);
    expect(fetch).toHaveBeenCalledTimes(4);
    for (const [, init] of fetch.mock.calls as unknown as [string, RequestInit][]) {
      expect(new Headers(init.headers).get(SYNC_ACCOUNT_HEADER)).toBe("account-a");
      expect(init.credentials).toBe("same-origin");
      expect(init.cache).toBe("no-store");
      if (init.body) expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    }
  });
  it("accepts a real profile version conflict for merging", async () => {
    const conflict = { ok: false, profile: { data: { name: "New" }, version: 2 } };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(conflict, { status: 409 })));
    expect(await apiForAccount("account-a").putProfile({ name: "Old" }, 1)).toEqual(conflict);
  });
  it("does not treat an account-change rejection as a profile version conflict", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "account-changed", message: "Reload the app." }, { status: 409 })));
    const api = apiForAccount("account-a");
    for (const request of [() => api.pull(0), () => api.push({ attempts: [] }), () => api.getProfile(), () => api.putProfile({}, 0)]) {
      await expect(request()).rejects.toMatchObject({ status: 409, message: "Reload the app." });
    }
  });
  it("reports a response without readable JSON as a request failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Unavailable", { status: 503 })));
    await expect(apiForAccount("account-a").getProfile()).rejects.toThrow(ApiError);
  });
});
