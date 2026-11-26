import { copyFile, mkdir, cp } from 'node:fs/promises';
await mkdir('public/pdf', { recursive: true });
await copyFile('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'public/pdf/pdf.worker.min.mjs');
await copyFile('node_modules/pdfjs-dist/LICENSE', 'public/pdf/LICENSE');
for (const directory of ['wasm', 'standard_fonts', 'cmaps']) await cp(`node_modules/pdfjs-dist/${directory}`, `public/pdf/${directory}`, { recursive: true });
