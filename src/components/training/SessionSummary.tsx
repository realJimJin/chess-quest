import Link from "next/link";
import type { Attempt } from "@/lib/types";
import QuestIcon from "../QuestIcon";
import styles from "./training.module.css";

export default function SessionSummary({ attempts, mapHref }: { attempts: Attempt[]; mapHref: string }) {
  const solved = attempts.filter(attempt => attempt.result === "solved").length;
  const assisted = attempts.filter(attempt => attempt.result === "assisted").length;
  const review = attempts.filter(attempt => attempt.result === "failed").length;
  return <section className={styles.summary} data-testid="session-end" aria-labelledby="session-complete">
    <div className={styles.summaryEmblem}><QuestIcon name="book" /></div>
    <p className="eyebrow">ONE THOUGHTFUL SESSION AT A TIME</p>
    <h1 id="session-complete">Good work. Let it settle.</h1>
    <p>You worked through {attempts.length} {attempts.length === 1 ? "exercise" : "exercises"}. Take a moment to consider what you noticed.</p>
    <dl className={styles.summaryStats}>
      <div><dt>Solved unaided</dt><dd>{solved}</dd></div>
      <div><dt>With hints</dt><dd>{assisted}</dd></div>
      <div><dt>For review</dt><dd>{review}</dd></div>
    </dl>
    {review > 0 && <p className={styles.reviewNote}>The exercises you missed will return in your scheduled reviews.</p>}
    <div className={styles.summaryActions}><Link href="/" className="btn btn-primary">Back to your library <QuestIcon name="arrow" /></Link><Link href={mapHref} className="btn">Explore your map</Link></div>
    <Link href="/coach" className={styles.textLink}>Reflect on your training</Link>
  </section>;
}
