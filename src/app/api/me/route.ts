import { me } from "@/server/http";
export const GET = (req: Request) => me(req);
