'use client';
import { useEffect, useRef, useState } from 'react';
import type { RenderTask } from 'pdfjs-dist';
import type { BookRegion } from '@/lib/private-books';
import { useBookDocument } from './BookDocument';
import styles from './books.module.css';

/** Render the original PDF region, preserving figurines and every variation. */
export default function BookExcerpt({ region, label }: { region: BookRegion; label: string }) {
  const { document, error: documentError } = useBookDocument();
  const [width, setWidth] = useState(500);
  const [zoom, setZoom] = useState(1);
  const [status, setStatus] = useState('Loading source…');
  const [error, setError] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(180, Math.floor(entries[0].contentRect.width))));
    observer.observe(container.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!document || !canvas.current) return;
    let alive = true; let task: RenderTask | undefined;
    void (async () => {
      try {
        setStatus('Loading source…'); setError('');
        const page = await document.getPage(region.page);
        if (!alive || !canvas.current) return;
        const original = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: width * zoom / (original.width * region.width) });
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.current.width = Math.ceil(width * zoom * ratio);
        canvas.current.height = Math.ceil(viewport.height * region.height * ratio);
        task = page.render({ canvas: canvas.current, viewport, transform: [ratio, 0, 0, ratio, -region.x * viewport.width * ratio, -region.y * viewport.height * ratio] });
        await task.promise;
        if (alive) setStatus('');
      } catch (cause) { if (alive) { setError(cause instanceof Error ? cause.message : 'The source could not be displayed.'); setStatus(''); } }
    })();
    return () => { alive = false; task?.cancel(); };
  }, [document, region.page, region.x, region.y, region.width, region.height, width, zoom]);
  return <figure ref={container} className={styles.excerpt} data-testid="book-excerpt" data-rendered={!status && !error && !documentError}>
    {(error || documentError) ? <p role="alert">{error || documentError}</p> : status ? <p role="status">{status}</p> : null}
    <div className={styles.zoomControls}><span>Original book</span><button aria-label={`Zoom out ${label}`} disabled={zoom === 1} onClick={() => setZoom(value => Math.max(1, value - .5))}>−</button><span>{zoom * 100}%</span><button aria-label={`Zoom in ${label}`} disabled={zoom === 3} onClick={() => setZoom(value => Math.min(3, value + .5))}>+</button></div>
    <div className={styles.pdfScroll}><div style={{ width: `${zoom * 100}%` }}><canvas ref={canvas} aria-label={label} /></div></div>
    <figcaption>{label} · PDF page {region.page}</figcaption>
  </figure>;
}
