"""Glyph-level OCR for scanned answer sections set in figurine notation.

General OCR engines cannot read chess figurines, so this works the same way
as the diagram recogniser: segment glyphs, cluster them by shape, label each
cluster once (labels file), then read every line from the labels. Only the
characters needed for moves are labelled; everything else becomes '?'.
"""
from __future__ import annotations

import json
from dataclasses import dataclass

import cv2
import numpy as np

H, W = 32, 44  # normalised glyph canvas


@dataclass
class Glyph:
    page: int
    line: int
    x0: int
    x1: int
    vec: np.ndarray
    img: np.ndarray
    gap: float          # space before the glyph, in cap-heights
    cluster: int = -1
    sim: float = 0.0


def _runs(mask: np.ndarray, min_gap: int = 1) -> list[tuple[int, int]]:
    out, start, last = [], None, None
    for i, v in enumerate(mask):
        if v:
            if start is None:
                start = i
            elif i - last > min_gap:
                out.append((start, last + 1)); start = i
            last = i
    if start is not None:
        out.append((start, last + 1))
    return out


def text_lines(ink: np.ndarray) -> list[tuple[int, int]]:
    h, w = ink.shape
    rows = ink.sum(axis=1)
    # skip the running header: everything above a full-width rule
    top = 0
    for y in range(int(h * 0.25)):
        if rows[y] > 0.55 * w:
            top = y + 3
    runs = [(a, b) for a, b in _runs(rows[top:] > 0, 1)]
    runs = [(a + top, b + top) for a, b in runs if b - a >= 10]
    if not runs:
        return []
    med = float(np.median([b - a for a, b in runs]))
    out = []
    for a, b in runs:
        n = int(round((b - a) / med)) if med else 1
        if n <= 1 or (b - a) < 1.6 * med:
            out.append((a, b)); continue
        # touching lines: cut at the emptiest rows near the expected boundaries
        cuts = [a]
        for k in range(1, n):
            c = a + int(k * (b - a) / n)
            lo, hi = max(a + 3, c - int(med * 0.3)), min(b - 3, c + int(med * 0.3))
            cuts.append(lo + int(np.argmin(rows[lo:hi])) if hi > lo else c)
        cuts.append(b)
        out += [(cuts[i], cuts[i + 1]) for i in range(n)]
    return out


def line_glyphs(ink: np.ndarray, y0: int, y1: int, page: int, line: int) -> list[Glyph]:
    strip = ink[y0:y1]
    n, _lab, stats, _c = cv2.connectedComponentsWithStats(strip.astype(np.uint8), connectivity=8)
    boxes = [list(stats[i][:4]) for i in range(1, n) if stats[i][4] >= 5]  # x, y, w, h
    if not boxes:
        return []
    boxes.sort(key=lambda b: b[0])
    merged: list[list[int]] = []
    for x, y, w, h in boxes:
        if merged:
            mx, my, mw, mh = merged[-1]
            ov = min(mx + mw, x + w) - max(mx, x)
            if ov > 0.45 * min(mw, w):
                nx, ny = min(mx, x), min(my, y)
                merged[-1] = [nx, ny, max(mx + mw, x + w) - nx, max(my + mh, y + h) - ny]
                continue
        merged.append([x, y, w, h])
    big = [b for b in merged if b[3] >= 0.45 * (y1 - y0)]
    if not big:
        return []
    base = float(np.median([b[1] + b[3] for b in big]))
    cap = float(np.median([b[3] for b in big]))
    top, bot = base - 1.35 * cap, base + 0.5 * cap
    scale = H / (bot - top)
    out, prev_end = [], None
    for x, y, w, h in merged:
        canvas = np.zeros((H, W), np.float32)
        src = strip[:, x:x + w].astype(np.float32)
        ys0, ys1 = int(round(top)), int(round(bot))
        pad_top, pad_bot = max(0, -ys0), max(0, ys1 - src.shape[0])
        src = np.pad(src, ((pad_top, pad_bot), (0, 0)))[ys0 + pad_top:ys1 + pad_top]
        nw = max(1, min(W, int(round(w * scale))))
        small = cv2.resize(src, (nw, H), interpolation=cv2.INTER_AREA)
        off = (W - nw) // 2
        canvas[:, off:off + nw] = small
        blurred = cv2.GaussianBlur(canvas, (3, 3), 0.8)
        v = blurred.ravel() - blurred.mean()
        nrm = np.linalg.norm(v)
        gap = 0.0 if prev_end is None else (x - prev_end) / cap
        out.append(Glyph(page, line, int(x), int(x + w), v / nrm if nrm > 1e-6 else v, (canvas * 255).astype(np.uint8), gap))
        prev_end = x + w
    return out


def page_glyphs(gray: np.ndarray, page: int) -> list[Glyph]:
    ink = gray < 128
    out = []
    for li, (y0, y1) in enumerate(text_lines(ink)):
        out += line_glyphs(ink, y0, y1, page, li)
    return out


class GlyphModel:
    def __init__(self, threshold: float = 0.86):
        self.threshold = threshold
        self.cent = np.zeros((0, H * W), np.float32)
        self.count: list[int] = []
        self.exemplar: list[np.ndarray] = []
        self.labels: dict[int, str] = {}
        self._buf = np.zeros((1024, H * W), np.float32)
        self._resolved: dict[int, str] = {}

    def fit(self, glyphs: list[Glyph]) -> None:
        """Incremental: call once per page. Glyph vectors are released afterwards."""
        for g in glyphs:
            k = len(self.count)
            if k:
                sims = self._buf[:k] @ g.vec
                j = int(np.argmax(sims))
                if sims[j] >= self.threshold:
                    g.cluster, g.sim = j, float(sims[j])
                    self.count[j] += 1
                    if self.count[j] <= 50:   # centroid settles early; keeps it cheap
                        c = self._buf[j] * (self.count[j] - 1) + g.vec
                        self._buf[j] = c / (np.linalg.norm(c) + 1e-9)
                    g.vec = g.img = None
                    continue
            if k == len(self._buf):
                self._buf = np.vstack([self._buf, np.zeros_like(self._buf)])
            self._buf[k] = g.vec; self.count.append(1); self.exemplar.append(g.img)
            g.cluster, g.sim = k, 1.0
            g.vec = g.img = None
        self.cent = self._buf[:len(self.count)]

    def order(self) -> list[int]:
        return sorted(range(len(self.count)), key=lambda i: -self.count[i])

    def contact_sheet(self, ids: list[int], cols: int = 20) -> np.ndarray:
        cw, ch = W + 8, H + 18
        rows = (len(ids) + cols - 1) // cols
        sheet = np.full((rows * ch, cols * cw), 255, np.uint8)
        for n, i in enumerate(ids):
            r, c = divmod(n, cols)
            y, x = r * ch, c * cw
            sheet[y + 14:y + 14 + H, x + 4:x + 4 + W] = 255 - self.exemplar[i]
            cv2.putText(sheet, str(n), (x + 2, y + 11), cv2.FONT_HERSHEY_SIMPLEX, 0.36, 0, 1)
            cv2.rectangle(sheet, (x, y), (x + cw - 1, y + ch - 1), 200, 1)
        return sheet

    def load_labels(self, path: str) -> None:
        """Labels are keyed by exemplar hash so they survive re-clustering."""
        with open(path) as fh:
            by_hash = json.load(fh)
        for i, ex in enumerate(self.exemplar):
            lab = by_hash.get(_hash(ex))
            if lab is not None:
                self.labels[i] = lab

    def label_of(self, g: Glyph) -> str:
        c = g.cluster
        if c in self.labels:
            return self.labels[c]
        if c < 0 or not self.labels:
            return "?"
        if c not in self._resolved:   # unlabelled rare shape: borrow the nearest labelled one
            ids = list(self.labels)
            sims = self.cent[ids] @ self.cent[c]
            j = int(np.argmax(sims))
            self._resolved[c] = self.labels[ids[j]] if sims[j] >= 0.80 else "?"
        return self._resolved[c]


def _hash(img: np.ndarray) -> str:
    import hashlib
    return hashlib.sha1(img.tobytes()).hexdigest()[:16]


def read_text(glyphs: list[Glyph], model: GlyphModel, space: float = 0.28) -> str:
    """Rebuild text. Unknown glyphs come out as '?'; '~' labels are dropped (noise)."""
    out, key = [], None
    for g in glyphs:
        k = (g.page, g.line)
        if k != key:
            out.append("\n"); key = k
        elif g.gap > space:
            out.append(" ")
        lab = model.label_of(g)
        if lab != "~":
            out.append(lab)
    return "".join(out)
