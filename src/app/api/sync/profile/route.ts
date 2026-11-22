import { profileGet, profilePut } from "@/server/http";
export const GET = (req: Request) => profileGet(req);
export const PUT = (req: Request) => profilePut(req);
