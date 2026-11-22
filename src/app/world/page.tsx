import { Suspense } from "react";
import Campaign from "@/components/Campaign";
export default function WorldPage() { return <Suspense fallback={<p className="py-20 text-center text-mute">Opening your journey…</p>}><Campaign /></Suspense>; }
