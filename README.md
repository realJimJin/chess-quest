# Chess Quest

Private calculation trainer for Sergey Ivashchenko's *Chess School 2 / The Manual of Chess Combinations*.
No positions ship with the app; exercises come only from your own PDF and stay in your browser.

## Use

    npm install && npm run dev          # http://localhost:3000, enables PDF upload on /import

Extraction from the command line:

    cd extraction
    python3 -m venv .venv && .venv/bin/pip install pymupdf python-chess numpy opencv-python-headless pytest
    .venv/bin/python -m csx.cli ~/Books/chess-school-2a.pdf --profile cs2a --out out
    # -> out/exercises.json (load on /import), exercises.pgn, report.md, piece_clusters.json

Useful flags: `--pages 7-108`, `--solutions-pages 109-136`, `--page-offset N`, `--lang ru|de|es|fig`,
`--figurine-map "¢=K,£=Q"`, `--labels piece_clusters.json` (after setting `"confirmed": true` on corrected shapes).

## Tests

    npm test                 # puzzle logic, special moves, import validation, progress, diagnostics
    npm run test:extraction  # diagram reconstruction, solution matching, legality, error handling

## Layout

- `extraction/csx` — Python pipeline (PyMuPDF render, OpenCV board detection, clustering recogniser, python-chess validation, Stockfish cross-check)
- `src/lib` — puzzle engine, validation, spaced repetition, diagnostics, storage adapters
- `src/app` — library, trainer (Flow / Deep / Review / Focus), progress, partner, import

## License

Copyright © 2026 Guixuan Jin.

Chess Quest is free software: you can redistribute it and/or modify it under the terms of the
GNU General Public License as published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version. It is distributed WITHOUT ANY WARRANTY; see
[LICENSE](LICENSE) for details.

Third-party components:

| Component | License |
|---|---|
| [chessground](https://github.com/lichess-org/chessground) (board) | GPL-3.0-or-later |
| [Stockfish](https://github.com/official-stockfish/Stockfish) via the [stockfish](https://github.com/nmrugg/stockfish.js) npm build (engine) | GPL-3.0 |
| [chess.js](https://github.com/jhlywa/chess.js) (move rules) | BSD-2-Clause |
| Next.js, React, Capacitor | MIT |
| idb-keyval | Apache-2.0 |

The sample pack in `src/lib/samples.json` is original work, released under the same license.
No book content is in this repository. Exercises come only from a PDF you own, and stay on your device.

Each App Store build is tagged in this repository so its exact source stays available.
