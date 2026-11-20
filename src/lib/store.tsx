"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Attempt, BookMeta, Exercise, ProgressState } from "./types";
import { allExercises, loadLibrary, mergeBook, saveLibrary, type Library } from "./library";
import { emptyProgress, LocalProgressStore, PROGRESS_KEY, readProgress, recordAttempt, RESET_KEY } from "./progress";
import { onCloudApplied } from "./cloud/events";

interface AppData {
  ready: boolean; library: Library; exercises: Exercise[]; progress: ProgressState;
  progressError: string | null;
  retryProgressSave(): void;
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
  const [progressError, setProgressError] = useState<string | null>(null);
  const pendingEdits = useRef<Array<(state: ProgressState) => ProgressState>>([]);

  useEffect(() => {
    let live = true;
    Promise.all([loadLibrary().catch(() => ({})), store.load()]).then(([lib, prog]) => {
      if (!live) return;
      setLibrary(lib); setProgress(prog); setReady(true);
    });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const refresh = () => setProgress(pendingEdits.current.reduce((state, edit) => edit(state), readProgress()));
    const unsubscribe = onCloudApplied(realm => { if (realm === "progress") refresh(); });
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea === localStorage && (!event.key || event.key === PROGRESS_KEY || event.key === RESET_KEY)) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => { unsubscribe(); window.removeEventListener("storage", onStorage); };
  }, []);

  const retryProgressSave = useCallback(() => {
    if (!pendingEdits.current.length) return;
    try {
      const edits = pendingEdits.current;
      const saved = store.update(state => edits.reduce((next, edit) => edit(next), state));
      pendingEdits.current = [];
      setProgress(saved); setProgressError(null);
    }
    catch {
      setProgressError("Your latest progress could not be saved on this device. Keep this page open; it may be lost if you leave or reload.");
    }
  }, []);
  const updateProgress = useCallback((edit: (state: ProgressState) => ProgressState) => {
    pendingEdits.current.push(edit);
    setProgress(edit);
    retryProgressSave();
  }, [retryProgressSave]);
  const addAttempt = useCallback((a: Attempt) => {
    updateProgress(p => recordAttempt(p, a));
  }, [updateProgress]);
  const amendAttempt = useCallback((exerciseId: string, ts: number, patch: Partial<Attempt>) => {
    updateProgress(p => ({ ...p, attempts: p.attempts.map(a => a.exerciseId === exerciseId && a.ts === ts ? { ...a, ...patch } : a) }));
  }, [updateProgress]);
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
  const resetProgress = useCallback(() => {
    void store.reset().then(() => { pendingEdits.current = []; setProgress(readProgress()); setProgressError(null); })
      .catch(() => setProgressError("Progress could not be reset completely. Please try again."));
  }, []);

  const exercises = useMemo(() => allExercises(library), [library]);
  const value = useMemo(() => ({ ready, library, exercises, progress, progressError, retryProgressSave, addAttempt, amendAttempt, importBook, updateExercise, removeBook, resetProgress }),
    [ready, library, exercises, progress, progressError, retryProgressSave, addAttempt, amendAttempt, importBook, updateExercise, removeBook, resetProgress]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppData {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppProvider");
  return v;
}
