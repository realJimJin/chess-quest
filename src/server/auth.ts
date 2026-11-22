// Who is calling. Two ways in: the Auth0 session cookie set by the website's
// sign-in, or an Auth0 access token sent as a bearer token (the iOS app, which
// is served from its own origin and cannot share the cookie).
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { Identity } from "./users";

const env = (k: string) => process.env[k]?.trim() || "";
export const authConfigured = (): boolean =>
  !!(env("AUTH0_DOMAIN") && env("AUTH0_CLIENT_ID") && env("AUTH0_CLIENT_SECRET") && env("AUTH0_SECRET").length >= 32 && env("APP_BASE_URL"));

type Client = import("@auth0/nextjs-auth0/server").Auth0Client;
const g = globalThis as { __cqAuth0?: Promise<Client>; __cqJwks?: { url: string; keys: JWTVerifyGetKey } };

/** The Auth0 SDK client, created on first use so the app still runs without sign-in configured. */
export function auth0(): Promise<Client> {
  if (!authConfigured()) throw new Error("Auth0 is not configured");
  g.__cqAuth0 ??= import("@auth0/nextjs-auth0/server").then(({ Auth0Client }) => new Auth0Client({
    domain: env("AUTH0_DOMAIN"), clientId: env("AUTH0_CLIENT_ID"), clientSecret: env("AUTH0_CLIENT_SECRET"),
    secret: env("AUTH0_SECRET"), appBaseUrl: env("APP_BASE_URL"),
    authorizationParameters: { scope: "openid profile email", ...(env("AUTH0_AUDIENCE") ? { audience: env("AUTH0_AUDIENCE") } : {}) },
  }));
  return g.__cqAuth0;
}

export interface BearerOptions { keys: JWTVerifyGetKey; issuer: string; audience: string }
/** Checks an access token's signature, issuer, audience and expiry. Null when it does not pass. */
export async function verifyBearer(token: string, o: BearerOptions): Promise<Identity | null> {
  try {
    const { payload } = await jwtVerify(token, o.keys, { issuer: o.issuer, audience: o.audience, algorithms: ["RS256"] });
    return typeof payload.sub === "string" && payload.sub ? { sub: payload.sub } : null;
  } catch { return null; }
}

function bearerOptions(): BearerOptions | null {
  const domain = env("AUTH0_DOMAIN"), audience = env("AUTH0_AUDIENCE");
  if (!domain || !audience) return null;
  const url = `https://${domain}/.well-known/jwks.json`;
  if (g.__cqJwks?.url !== url) g.__cqJwks = { url, keys: createRemoteJWKSet(new URL(url)) };
  return { keys: g.__cqJwks.keys, issuer: `https://${domain}/`, audience };
}

export interface Caller { identity: Identity; via: "cookie" | "bearer" }
/** The signed-in caller of a route handler, or null. */
export async function identify(req: Request): Promise<Caller | null> {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  if (m) {
    const o = bearerOptions();
    const identity = o ? await verifyBearer(m[1], o) : null;
    return identity ? { identity, via: "bearer" } : null;
  }
  if (!authConfigured()) return null;
  const u = (await (await auth0()).getSession())?.user;
  if (!u?.sub) return null;
  return { identity: { sub: u.sub, email: u.email, emailVerified: u.email_verified, name: u.name, picture: u.picture }, via: "cookie" };
}
