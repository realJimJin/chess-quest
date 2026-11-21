import type { TrainingBlock } from "../../lib/training/recommend";

export function trainingBlockHref(block: TrainingBlock): string | null {
  if (!block.mode || !block.exerciseIds.length) return null;
  const params = new URLSearchParams({ mode: block.mode, ids: JSON.stringify(block.exerciseIds) });
  if (block.bookId) params.set("book", block.bookId);
  if (block.chapterId) params.set("chapter", block.chapterId);
  return `/train?${params}`;
}

/** Accept only requested, currently trainable positions, in plan order.
 * An expired or malformed plan never expands to the whole book. */
export function requestedExerciseIds(raw: string, trainableIds: ReadonlySet<string>): string[] {
  try {
    const ids: unknown = JSON.parse(raw);
    if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => typeof id !== "string")) return [];
    return [...new Set(ids as string[])].filter(id => trainableIds.has(id));
  } catch { return []; }
}
