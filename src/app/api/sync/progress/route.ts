import { progressGet, progressPost } from "@/server/http";
export const GET = (req: Request) => progressGet(req);
export const POST = (req: Request) => progressPost(req);
