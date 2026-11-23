import OpeningTrainer from "@/components/openings/OpeningTrainer";
import Link from "next/link";
import { IS_IOS } from "@/lib/target";

export default function OpeningsPage() {
  return <>{!IS_IOS && <div className="card mb-6 p-5"><p className="eyebrow">YOUR TOURNAMENT STUDY</p><Link className="btn btn-primary mt-3" href="/studies/philidalphia-national-congress">Philidalphia national congress →</Link></div>}<OpeningTrainer /></>;
}
