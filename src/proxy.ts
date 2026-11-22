import { NextResponse, type NextRequest } from "next/server";
import { auth0, authConfigured } from "@/server/auth";

// Mounts Auth0's sign-in pages (/auth/login, /auth/callback, /auth/logout,
// /auth/profile) and keeps the session cookie fresh on API calls.
export async function proxy(request: NextRequest) {
  if (!authConfigured()) {
    return request.nextUrl.pathname.startsWith("/auth/")
      ? NextResponse.json({ error: "not-configured", message: "Sign-in is not set up on this server." }, { status: 501 })
      : NextResponse.next();
  }
  return (await auth0()).middleware(request);
}

export const config = { matcher: ["/auth/:path*", "/api/me", "/api/sync/:path*"] };
