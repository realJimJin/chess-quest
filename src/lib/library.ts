import { get, set } from "idb-keyval";
import type { BookMeta, Exercise } from "./types";

// The private library lives in this browser's IndexedDB only. Nothing here is
// bundled with, or uploaded by, the deployed site.
export interface LibraryBook { book: BookMeta; exercises: Exercise[]; importedAt: number; report?: Record<string, unknown> }
export type Library = Record<string, LibraryBook>;
const KEY = "cst.library.v1";

export const loadLibrary = async (): Promise<Library> => ((await get(KEY)) as Library | undefined) ?? {};
export const saveLibrary = (lib: Library) => set(KEY, lib);

export function mergeBook(lib: Library, book: BookMeta, incoming: Exercise[], report?: Record<string, unknown>): Library {
  const prev = lib[book.id]?.exercises ?? [];
  const byId = new Map(prev.map((e) => [e.id, e]));
  for (const e of incoming) {
    const old = byId.get(e.id);
    // never overwrite an exercise the user has already reviewed by hand
    if (old?.verification.reviewedBy === "user") continue;
    byId.set(e.id, e);
  }
  const exercises = [...byId.values()].sort((a, b) => a.number - b.number);
  return { ...lib, [book.id]: { book, exercises, importedAt: Date.now(), report: report ?? lib[book.id]?.report } };
}

export const allExercises = (lib: Library): Exercise[] => Object.values(lib).flatMap((b) => b.exercises);
