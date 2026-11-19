# Scan workflow used for the 2002 single-volume edition

The PDF is a 300-dpi bilevel scan with no text layer, so the generic `csx.cli` path is not enough.
Order of the steps (all paths relative to a cache folder):

1. diagram detection on PDF pages 10-210 -> `boards.pkl` (about 15 minutes)
2. `pieces.py` - separate empty from occupied squares, group occupied squares, write contact sheets
3. `recover.py` - re-find diagrams missed on a page from the fixed 2x3 layout; ignore pages after 210
4. `classify.py` - match every occupied square against the labelled examples (`piece_labels.json`, `piece_extra.json`)
5. `uncertain.py` - flag squares with a weak match or where ink fill contradicts the matched colour
6. `glyphs.py`, `label.py`, `ocr2.py` - read the answer section (PDF pages 213-258) character by character
   against labelled examples (`glyph_labels.json`, `glyph_extra.json`)
7. `../run_scan.py CACHE OUT [--engine]` - number the exercises, match solutions, validate, write the database

The label files describe the book's fonts (which shape is which piece or character). They index into the
caches produced by steps 1-2 and 6, so they only apply to this exact scan.
