'use client';
import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import type { BookDiagram } from '@/lib/private-books';
import styles from './books.module.css';

export default function BookPage({ pdf, page, diagrams, selected, onSelect }: { pdf: Blob; page: number; diagrams: BookDiagram[]; selected?: string; onSelect: (diagram: BookDiagram) => void }) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [width, setWidth] = useState(600);
  const [ratio, setRatio] = useState(1.42);
  const [zoom, setZoom] = useState(1);
  const canvas = useRef<HTMLCanvasElement>(null);
  const container = useRef<HTMLDivElement>(null);
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
        const loaded = await loadingTask.promise;
        if (alive) setDocument(loaded);
      } catch (cause) { if (alive) { setError(cause instanceof Error ? cause.message : 'This PDF could not be opened.'); setLoading(false); } }
    })();
    return () => { alive = false; void task?.destroy(); };
  }, [pdf]);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(200, Math.floor(entries[0].contentRect.width))));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!document || !canvas.current) return;
    let alive = true; let task: RenderTask | undefined;
    void (async () => {
      try {
        setLoading(true); setError('');
        const current = await document.getPage(page);
        if (!alive || !canvas.current) return;
        const original = current.getViewport({ scale: 1 });
        const viewport = current.getViewport({ scale: width * zoom / original.width });
        const scale = Math.min(window.devicePixelRatio || 1, 2);
        setRatio(original.height / original.width);
        canvas.current.width = Math.floor(viewport.width * scale);
        canvas.current.height = Math.floor(viewport.height * scale);
        task = current.render({ canvas: canvas.current, viewport, transform: [scale, 0, 0, scale, 0, 0] });
        await task.promise;
        if (alive) setLoading(false);
      } catch (cause) { if (alive) { setLoading(false); setError(cause instanceof Error ? cause.message : 'This page could not be rendered.'); } }
    })();
    return () => { alive = false; task?.cancel(); };
  }, [document, page, width, zoom]);
  return <div ref={container} className={styles.pdfColumn}>
    {error && <p role="alert" className="notice-error">{error}</p>}
    <div className={styles.zoomControls}><span>Source book</span><button aria-label="Zoom out book page" disabled={zoom === 1} onClick={() => setZoom(value => Math.max(1, value - .5))}>−</button><span>{zoom * 100}%</span><button aria-label="Zoom in book page" disabled={zoom === 3} onClick={() => setZoom(value => Math.min(3, value + .5))}>+</button></div>
    <div className={styles.pdfScroll}><div className={styles.pdfPage} style={{ aspectRatio: `1 / ${ratio}`, width: `${zoom * 100}%` }} data-testid="full-book-page" data-page={page} data-rendered={!loading && !error}>
      <canvas ref={canvas} aria-label={`Full book PDF page ${page}`} />
      {!loading && !error && diagrams.map(diagram => <button key={diagram.id} className={styles.diagramTarget} aria-label={`Open ${diagram.label} on the board`} aria-pressed={selected === diagram.id} onClick={() => onSelect(diagram)} style={{ left: `${diagram.x * 100}%`, top: `${diagram.y * 100}%`, width: `${diagram.width * 100}%`, height: `${diagram.height * 100}%` }}><span>Open board ↗</span></button>)}
      {loading && <div className={styles.pageLoading} role="status">Opening page {page}…</div>}
    </div></div>
    <p className={styles.caption}>Complete source page. Tap an outlined diagram to work through it on the board. Zoom in for easier reading; drag sideways to see the rest of the page.</p>
  </div>;
}
