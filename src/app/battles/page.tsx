import { notFound } from "next/navigation";
import BattlePreview from "@/components/battles/BattlePreview";

export default function BattlesPage() {
  if (process.env.NEXT_PUBLIC_TARGET === "ios") notFound();
  return <BattlePreview />;
}
