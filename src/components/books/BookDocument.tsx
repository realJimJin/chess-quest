'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
const Context = createContext<{ document: PDFDocumentProxy | null; error: string }>({ document: null, error: '' });
export const useBookDocument = () => useContext(Context);

/** One PDF worker and source buffer shared by the reader and answer excerpts. */
export default function BookDocument({ pdf, children }: { pdf: Blob; children: ReactNode }) {
  const [state, setState] = useState<{ document: PDFDocumentProxy | null; error: string }>({ document: null, error: '' });
  useEffect(() => {
    let alive = true;
    let task: { destroy: () => Promise<void> } | undefined;
    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf/pdf.worker.min.mjs';
        const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await pdf.arrayBuffer()), wasmUrl: '/pdf/wasm/', standardFontDataUrl: '/pdf/standard_fonts/', cMapUrl: '/pdf/cmaps/', cMapPacked: true });
        task = loadingTask;
        if (!alive) { await task.destroy(); return; }
        const document = await loadingTask.promise;
        if (alive) setState({ document, error: '' });
      } catch (cause) { if (alive) setState({ document: null, error: cause instanceof Error ? cause.message : 'This PDF could not be opened.' }); }
    })();
    return () => { alive = false; void task?.destroy(); };
  }, [pdf]);
  return <Context.Provider value={state}>{children}</Context.Provider>;
}
