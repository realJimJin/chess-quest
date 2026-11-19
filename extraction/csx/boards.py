"""Chess diagram detection and piece recognition.

Font-agnostic by design: every square image in the document is clustered by
appearance, clusters are labelled (automatically from a template bank, or by
a human / vision model via a labels file), and each square inherits its
cluster's label. Confidence is tracked per square so uncertain diagrams are
flagged instead of guessed.
"""
from __future__ import annotations

import base64
from dataclasses import dataclass, field

import cv2
import numpy as np

CELL = 32  # normalised square size used for features
LABELS = ["empty", "P", "N", "B", "R", "Q", "K", "p", "n", "b", "r", "q", "k"]


@dataclass
class Board:
    page: int            # 0-based pdf page index
    x: float
    y: float
    size: float
    score: float
    cells: np.ndarray = field(default=None, repr=False)   # (64, CELL, CELL) uint8, a8..h1 row-major
    crop: np.ndarray = field(default=None, repr=False)


def render_page(page, dpi: int = 200) -> np.ndarray:
    import pymupdf
    pix = page.get_pixmap(dpi=dpi, colorspace=pymupdf.csGRAY)
    return np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width).copy()


def _checker_score(gray: np.ndarray, x: float, y: float, size: float) -> tuple[float, float]:
    """(fraction of squares on the right side of the light/dark split, contrast)."""
    h, w = gray.shape
    if x < 0 or y < 0 or x + size > w or y + size > h:
        return 0.0, 0.0
    c = size / 8.0
    p = max(2, int(c * 0.16))
    off = max(1, int(c * 0.07))
    vals = np.zeros((8, 8))
    for r in range(8):
        for f in range(8):
            x0, y0 = int(x + f * c), int(y + r * c)
            x1, y1 = int(x + (f + 1) * c), int(y + (r + 1) * c)
            patches = [
                gray[y0 + off:y0 + off + p, x0 + off:x0 + off + p],
                gray[y0 + off:y0 + off + p, x1 - off - p:x1 - off],
                gray[y1 - off - p:y1 - off, x0 + off:x0 + off + p],
                gray[y1 - off - p:y1 - off, x1 - off - p:x1 - off],
            ]
            vals[r, f] = np.median([pt.mean() for pt in patches if pt.size])
    parity = (np.add.outer(np.arange(8), np.arange(8)) % 2).astype(bool)  # True = dark square
    light, dark = vals[~parity], vals[parity]
    contrast = float(light.mean() - dark.mean())
    if contrast <= 0:
        return 0.0, contrast
    mid = (light.mean() + dark.mean()) / 2
    frac = (np.sum(light > mid) + np.sum(dark < mid)) / 64.0
    return float(frac), contrast


def find_boards(gray: np.ndarray, page_index: int = 0) -> list[Board]:
    h, w = gray.shape
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    _, bw = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)
    k = max(3, int(w * 0.004)) | 1
    bw = cv2.dilate(bw, np.ones((k, k), np.uint8))
    contours, _ = cv2.findContours(bw, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    cands = []
    for cnt in contours:
        bx, by, bwid, bhei = cv2.boundingRect(cnt)
        if bwid < w * 0.10 or bwid > w * 0.98:
            continue
        if abs(bwid - bhei) > 0.06 * max(bwid, bhei):
            continue
        cands.append((bx, by, (bwid + bhei) / 2.0))
    found: list[Board] = []
    for bx, by, s in cands:
        best = None
        # refine: frame thickness / dilation shift the true grid slightly
        for ds in (0, -0.01, -0.02, -0.035, -0.05, -0.07):
            size = s * (1 + ds)
            slack = s - size
            for ox in np.linspace(0, slack, 4 if slack > 1 else 1):
                for oy in np.linspace(0, slack, 4 if slack > 1 else 1):
                    frac, contrast = _checker_score(gray, bx + ox, by + oy, size)
                    key = frac + min(contrast, 80) / 400.0
                    if best is None or key > best[0]:
                        best = (key, frac, contrast, bx + ox, by + oy, size)
        if best and best[1] >= 0.86 and best[2] >= 10:
            found.append(Board(page_index, best[3], best[4], best[5], best[1]))
    # de-duplicate overlapping detections, keep the best-scoring
    found.sort(key=lambda b: (-b.score, -b.size))
    kept: list[Board] = []
    for b in found:
        cx, cy = b.x + b.size / 2, b.y + b.size / 2
        if any(abs(cx - (o.x + o.size / 2)) < o.size * 0.5 and abs(cy - (o.y + o.size / 2)) < o.size * 0.5
               for o in kept):
            continue
        kept.append(b)
    # reading order: rows top-to-bottom, then left-to-right
    kept.sort(key=lambda b: (b.y, b.x))
    rows: list[list[Board]] = []
    for b in kept:
        if rows and abs(rows[-1][0].y - b.y) < b.size * 0.5:
            rows[-1].append(b)
        else:
            rows.append([b])
    ordered = [b for row in rows for b in sorted(row, key=lambda b: b.x)]
    for b in ordered:
        extract_cells(gray, b)
    return ordered


def extract_cells(gray: np.ndarray, b: Board) -> None:
    c = b.size / 8.0
    inset = c * 0.06
    cells = np.zeros((64, CELL, CELL), np.uint8)
    for r in range(8):
        for f in range(8):
            x0, y0 = int(round(b.x + f * c + inset)), int(round(b.y + r * c + inset))
            x1, y1 = int(round(b.x + (f + 1) * c - inset)), int(round(b.y + (r + 1) * c - inset))
            cells[r * 8 + f] = cv2.resize(gray[y0:y1, x0:x1], (CELL, CELL), interpolation=cv2.INTER_AREA)
    b.cells = cells
    m = int(c * 0.15)
    y0, y1 = max(0, int(b.y) - m), min(gray.shape[0], int(b.y + b.size) + m)
    x0, x1 = max(0, int(b.x) - m), min(gray.shape[1], int(b.x + b.size) + m)
    b.crop = gray[y0:y1, x0:x1].copy()


def _vec(cell: np.ndarray) -> np.ndarray:
    # blur so thin outlines (white pieces) tolerate sub-pixel misalignment
    v = cv2.GaussianBlur(cell, (5, 5), 1.2).astype(np.float32).ravel()
    v -= v.mean()
    n = np.linalg.norm(v)
    return v / n if n > 1e-6 else v


def _shift_sim(a: np.ndarray, b: np.ndarray, r: int = 2) -> float:
    """Best normalised correlation of two cell images over small shifts."""
    best = -1.0
    va = _vec(a)
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            m = np.float32([[1, 0, dx], [0, 1, dy]])
            sb = cv2.warpAffine(b, m, (CELL, CELL), borderMode=cv2.BORDER_REPLICATE)
            best = max(best, float(va @ _vec(sb)))
    return best


def is_dark(idx: int) -> bool:
    return ((idx // 8) + (idx % 8)) % 2 == 1


@dataclass
class Cluster:
    id: str
    dark: bool
    centroid: np.ndarray
    exemplar: np.ndarray
    count: int = 0
    flat: bool = False
    label: str | None = None
    label_conf: float = 0.0
    label_source: str = "none"


class PieceModel:
    """Leader clustering of square images + label assignment."""

    def __init__(self, threshold: float = 0.80):
        self.threshold = threshold
        self.clusters: list[Cluster] = []

    def fit(self, boards: list[Board]) -> None:
        for b in boards:
            for i in range(64):
                self._assign(b.cells[i], is_dark(i), create=True)
        self.clusters.sort(key=lambda c: -c.count)
        for n, c in enumerate(self.clusters):
            c.id = f"c{n:03d}{'d' if c.dark else 'l'}"

    def _assign(self, cell: np.ndarray, dark: bool, create: bool = False):
        flat = float(cell.std()) < 6.0
        v = _vec(cell)
        best, best_s = None, -1.0
        for c in self.clusters:
            if c.dark != dark:
                continue
            if flat or c.flat:
                s = 1.0 if (flat and c.flat) else -1.0
            else:
                s = float(v @ (c.centroid / (np.linalg.norm(c.centroid) + 1e-9)))
            if s > best_s:
                best, best_s = c, s
        if best is not None and best_s >= self.threshold:
            if create:
                best.centroid = (best.centroid * best.count + v) / (best.count + 1)
                best.count += 1
            return best, best_s
        if not create:
            return best, best_s
        c = Cluster("", dark, v.copy(), cell.copy(), 1, flat)
        self.clusters.append(c)
        return c, 1.0

    def auto_label(self, bank: list[tuple[str, bool, np.ndarray]]) -> None:
        """Label clusters by nearest template. `bank` = (label, dark, cell image)."""
        tv = [(lab, dark, img, float(img.std()) < 6.0) for lab, dark, img in bank]
        # the most frequent cluster of each square colour is empty in any real book
        for dark in (False, True):
            same = [c for c in self.clusters if c.dark == dark]
            if same:
                top = max(same, key=lambda c: c.count)
                top.label, top.label_conf, top.label_source = "empty", 0.9, "frequency"
        for c in self.clusters:
            if c.label_source == "frequency":
                continue
            scored = []
            for lab, dark, v, flat in tv:
                if dark != c.dark:
                    continue
                s = (1.0 if flat and c.flat else -1.0) if (flat or c.flat) else _shift_sim(c.exemplar, v)
                scored.append((s, lab))
            scored.sort(reverse=True)
            if scored:
                top_s, top_l = scored[0]
                second = next((s for s, l in scored[1:] if l != top_l), -1.0)
                # confidence blends absolute similarity with margin over the runner-up
                c.label = top_l
                c.label_conf = float(max(0.0, min(1.0, top_s)) * min(1.0, 0.5 + (top_s - second) * 2.5))
                c.label_source = "template"

    def apply_labels(self, labels: dict[str, dict]) -> None:
        for c in self.clusters:
            ent = labels.get(c.id)
            if ent and ent.get("label") in LABELS and ent.get("confirmed"):
                c.label, c.label_conf, c.label_source = ent["label"], 1.0, "human"

    def classify(self, b: Board) -> tuple[list[str], list[float]]:
        labels, confs = [], []
        for i in range(64):
            c, s = self._assign(b.cells[i], is_dark(i))
            if c is None or c.label is None:
                labels.append("empty"); confs.append(0.0); continue
            labels.append(c.label)
            confs.append(float(max(0.0, min(1.0, s)) * c.label_conf))
        return labels, confs

    def clusters_json(self) -> list[dict]:
        out = []
        for c in self.clusters:
            ok, png = cv2.imencode(".png", cv2.resize(c.exemplar, (64, 64), interpolation=cv2.INTER_CUBIC))
            out.append({
                "id": c.id, "dark": c.dark, "count": c.count, "label": c.label,
                "confidence": round(c.label_conf, 3), "source": c.label_source,
                "confirmed": c.label_source == "human",
                "image": "data:image/png;base64," + base64.b64encode(png.tobytes()).decode(),
            })
        return out


def labels_to_fen_board(labels: list[str]) -> str:
    rows = []
    for r in range(8):
        row, run = "", 0
        for f in range(8):
            lab = labels[r * 8 + f]
            if lab == "empty":
                run += 1
            else:
                if run:
                    row += str(run); run = 0
                row += lab
        if run:
            row += str(run)
        rows.append(row)
    return "/".join(rows)


def builtin_bank() -> list[tuple[str, bool, np.ndarray]]:
    """Templates rendered from python-chess's vector pieces on plain squares.

    Only a bootstrap: a printed book's diagram font will differ, in which case
    confidences come out low and the clusters need confirming once.
    """
    import chess
    import chess.svg
    import pymupdf
    bank = []
    px = 96
    for dark in (False, True):
        fill = "#b0b0b0" if dark else "#ffffff"
        blank = np.full((CELL, CELL), 176 if dark else 255, np.uint8)
        bank.append(("empty", dark, blank))
        for sym in "PNBRQKpnbrqk":
            inner = chess.svg.piece(chess.Piece.from_symbol(sym), size=px)
            body = inner[inner.index(">") + 1: inner.rindex("</svg>")]
            svg = (f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
                   f'viewBox="0 0 45 45" width="{px}" height="{px}">'
                   f'<rect width="45" height="45" fill="{fill}"/>{body}</svg>')
            doc = pymupdf.open(stream=svg.encode(), filetype="svg")
            pix = doc[0].get_pixmap(colorspace=pymupdf.csGRAY, alpha=False)
            img = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width)
            m = int(img.shape[0] * 0.06)
            bank.append((sym, dark, cv2.resize(img[m:-m, m:-m], (CELL, CELL), interpolation=cv2.INTER_AREA)))
    return bank
