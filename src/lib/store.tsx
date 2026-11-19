"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Attempt, BookMeta, Exercise, ProgressState } from "./types";
import { allExercises, loadLibrary, mergeBook, saveLibrary, type Library } from "./library";
import { emptyProgress, LocalProgressStore, recordAttempt } from "./progress";

interface AppData {
  ready: boolean; library: Library; exercises: Exercise[]; progress: ProgressState;
  addAttempt(a: Attempt): void;
  amendAttempt(exerciseId: string, ts: number, patch: Partial<Attempt>): void;
  importBook(book: BookMeta, exercises: Exercise[], report?: Record<string, unknown>): Promise<void>;
  updateExercise(ex: Exercise): Promise<void>;
  removeBook(id: string): Promise<void>;
  resetProgress(): void;
}
const Ctx = createContext<AppData | null>(null);
const store = new LocalProgressStore();

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [library, setLibrary] = useState<Library>({});
  const [progress, setProgress] = useState<ProgressState>(emptyProgress());

  useEffect(() => {
    let live = true;
    Promise.all([loadLibrary().catch(() => ({})), store.load()]).then(([lib, prog]) => {
      if (!live) return;
      setLibrary(lib); setProgress(prog); setReady(true);
    });
    return () => { live = false; };
  }, []);

  const addAttempt = useCallback((a: Attempt) => {
    setProgress((p) => { const n = recordAttempt(p, a); void store.save(n); return n; });
  }, []);
  const amendAttempt = useCallback((exerciseId: string, ts: number, patch: Partial<Attempt>) => {
    setProgress((p) => {
      const n = { ...p, attempts: p.attempts.map((a) => (a.exerciseId === exerciseId && a.ts === ts ? { ...a, ...patch } : a)) };
      void store.save(n); return n;
    });
  }, []);
  const persist = useCallback(async (lib: Library) => { setLibrary(lib); await saveLibrary(lib); }, []);
  const importBook = useCallback(async (book: BookMeta, exs: Exercise[], report?: Record<string, unknown>) => {
    await persist(mergeBook(await loadLibrary(), book, exs, report));
  }, [persist]);
  const updateExercise = useCallback(async (ex: Exercise) => {
    const lib = await loadLibrary();
    const b = lib[ex.bookId];
    if (!b) return;
    await persist({ ...lib, [ex.bookId]: { ...b, exercises: b.exercises.map((e) => (e.id === ex.id ? ex : e)) } });
  }, [persist]);
  const removeBook = useCallback(async (id: string) => {
    const lib = { ...(await loadLibrary()) }; delete lib[id]; await persist(lib);
  }, [persist]);
  const resetProgress = useCallback(() => { const e = emptyProgress(); setProgress(e); void store.save(e); }, []);

  const exercises = useMemo(() => allExercises(library), [library]);
  const value = useMemo(() => ({ ready, library, exercises, progress, addAttempt, amendAttempt, importBook, updateExercise, removeBook, resetProgress }),
    [ready, library, exercises, progress, addAttempt, amendAttempt, importBook, updateExercise, removeBook, resetProgress]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppData {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppProvider");
  return v;
}
