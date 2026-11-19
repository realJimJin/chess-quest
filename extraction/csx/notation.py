"""Parse book-style solution text into a validated move tree.

Every move is resolved against python-chess legal moves, so nothing illegal
can enter the database. Unparseable variations are dropped and flagged; an
unparseable main line makes the whole solution fail (the exercise is then
sent to manual review rather than guessed).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

import chess

FIGURINES = {
    "♔": "K", "♕": "Q", "♖": "R", "♗": "B", "♘": "N", "♙": "",
    "♚": "K", "♛": "Q", "♜": "R", "♝": "B", "♞": "N", "♟": "",
}
# Piece-letter alphabets of the four languages the book is printed in.
LANG_LETTERS = {
    "en": {},
    "fig": {},
    "ru": {"Кр": "K", "Ф": "Q", "Л": "R", "С": "B", "К": "N"},
    "de": {"D": "Q", "T": "R", "L": "B", "S": "N"},
    "es": {"R": "K", "D": "Q", "T": "R", "A": "B", "C": "N"},
}

TOKEN_RE = re.compile(
    r"(?P<num>\d{1,3})\s*(?P<dots>\.\s*\.\s*\.|…|\.)"
    r"|(?P<castle>O-O-O|O-O)(?P<csuf>[+#]?)"
    r"|(?P<san>[KQRBN]?[a-h]?[1-8]?[x\-]?[a-h][1-8](?:=?[QRBN])?)(?P<suf>[+#]?)"
    r"|(?P<pc>[a-h][a-h](?:=?[QRBN])?)(?P<psuf>[+#]?)"
    r"|(?P<open>[\(\[])|(?P<close>[\)\]])"
)


class SolutionError(ValueError):
    pass


@dataclass
class Node:
    san: str
    uci: str
    children: list["Node"] = field(default_factory=list)

    def to_json(self) -> dict:
        return {"san": self.san, "uci": self.uci, "children": [c.to_json() for c in self.children]}


def normalize(text: str, lang: str = "en", figurine_map: dict[str, str] | None = None) -> str:
    t = text
    for k, v in (figurine_map or {}).items():
        t = t.replace(k, v)
    for k, v in FIGURINES.items():
        t = t.replace(k, v)
    t = t.replace("х", "x").replace("Х", "x").replace("×", "x").replace(":", "x")
    t = t.replace("–", "-").replace("—", "-").replace("−", "-")
    t = re.sub(r"\b[0О]-[0О]-[0О]\b", "O-O-O", t)
    t = re.sub(r"\b[0О]-[0О]\b", "O-O", t)
    letters = LANG_LETTERS.get(lang, {})
    if letters:
        # longest keys first ("Кр" before "К"); only when followed by a square-ish tail
        for k in sorted(letters, key=len, reverse=True):
            t = re.sub(re.escape(k) + r"(?=[a-h1-8x\-])", "\x00" + letters[k], t)
        t = t.replace("\x00", "")
    t = re.sub(r"e\.?\s?p\.?", "", t)
    t = t.replace("++", "#").replace("‡", "#")
    t = re.sub(r"[!?]+", "", t)
    return t


def _resolve(board: chess.Board, tok: re.Match) -> chess.Move:
    if tok.group("castle"):
        want_long = tok.group("castle") == "O-O-O"
        for m in board.legal_moves:
            if board.is_castling(m) and board.is_queenside_castling(m) == want_long:
                return m
        raise SolutionError(f"castling not legal: {tok.group(0)}")
    if tok.group("pc"):
        # shorthand pawn capture, e.g. "de" = the d-pawn takes on the e-file
        pc = tok.group("pc")
        promo = pc[2:].lstrip("=") or None
        cands = [m for m in board.legal_moves
                 if board.piece_type_at(m.from_square) == chess.PAWN and board.is_capture(m)
                 and chess.FILE_NAMES[chess.square_file(m.from_square)] == pc[0]
                 and chess.FILE_NAMES[chess.square_file(m.to_square)] == pc[1]
                 and ((m.promotion is None and not promo) or
                      (m.promotion is not None and chess.PIECE_SYMBOLS[m.promotion].upper() == (promo or "Q")))]
        if len(cands) == 1:
            return cands[0]
        raise SolutionError(f"{'illegal' if not cands else 'ambiguous'} move {pc} in {board.fen()}")
    s = tok.group("san")
    mm = re.fullmatch(r"([KQRBN]?)([a-h]?)([1-8]?)([x\-]?)([a-h][1-8])(?:=?([QRBN]))?", s)
    if not mm:
        raise SolutionError(f"unreadable move: {s}")
    piece, ffile, frank, _cap, dest, promo = mm.groups()
    ptype = chess.PIECE_SYMBOLS.index(piece.lower()) if piece else chess.PAWN
    to_sq = chess.parse_square(dest)
    cands = []
    for m in board.legal_moves:
        if m.to_square != to_sq or board.piece_type_at(m.from_square) != ptype:
            continue
        if ffile and chess.FILE_NAMES[chess.square_file(m.from_square)] != ffile:
            continue
        if frank and str(chess.square_rank(m.from_square) + 1) != frank:
            continue
        if promo and (m.promotion is None or chess.PIECE_SYMBOLS[m.promotion].upper() != promo):
            continue
        if not promo and m.promotion not in (None, chess.QUEEN):
            continue
        cands.append(m)
    if len(cands) == 1:
        return cands[0]
    if not cands:
        raise SolutionError(f"illegal move {s} in {board.fen()}")
    raise SolutionError(f"ambiguous move {s} in {board.fen()}")


def parse_solution(fen: str, text: str, lang: str = "en",
                   figurine_map: dict[str, str] | None = None, info: dict | None = None,
                   prenormalized: bool = False) -> tuple[list[Node], list[str]]:
    """Return (root children, flags). Raises SolutionError if the main line fails.

    `info`, when given, receives the character spans of the main-line move
    tokens and of the first token that failed, for callers that repair OCR text.
    """
    root_board = chess.Board(fen)
    norm = text if prenormalized else normalize(text, lang, figurine_map)
    if info is not None:
        info["main_spans"] = []
        info["fail_span"] = None
    flags: list[str] = []
    roots: list[Node] = []

    # A "line" is a list of (board_before, node, siblings_list) along the current path.
    class Ctx:
        def __init__(self, path, board, pending_ply=None):
            self.path = path          # list of (board_before, node)
            self.board = board        # board after path
            self.pending_ply = pending_ply
            self.failed = False

    def ply_of(num: int, black: bool) -> int:
        base = root_board.fullmove_number
        root_black = root_board.turn == chess.BLACK
        return (num - base) * 2 + (1 if black else 0) - (1 if root_black else 0)

    def children_at(path) -> list[Node]:
        return path[-1][1].children if path else roots

    stack: list[Ctx] = [Ctx([], root_board.copy())]
    depth_skip = 0
    main_moves = 0

    for tok in TOKEN_RE.finditer(norm):
        ctx = stack[-1]
        if tok.group("open"):
            if ctx.failed or depth_skip:
                depth_skip += 1
                continue
            # default: alternative to the last move of the parent line
            path = ctx.path[:-1] if ctx.path else []
            board = ctx.path[-1][0].copy() if ctx.path else root_board.copy()
            stack.append(Ctx(list(path), board))
            continue
        if tok.group("close"):
            if depth_skip:
                depth_skip -= 1
            elif len(stack) > 1:
                stack.pop()
            continue
        if depth_skip:
            continue
        if tok.group("num"):
            black = tok.group("dots") != "."
            ply = ply_of(int(tok.group("num")), black)
            cur = len(ctx.path)
            if ply == cur or ply < 0:
                continue
            if len(stack) > 1 and 0 <= ply < cur:
                # variation restarts earlier along its inherited path
                board = ctx.path[ply][0].copy()
                ctx.path = ctx.path[:ply]
                ctx.board = board
            elif len(stack) == 1 and ply != cur:
                if main_moves == 0 and ply == cur + 1:
                    # text says "1..." but position is White to move (or vice versa)
                    raise SolutionError("side-to-move mismatch")
                # a misread move number: keep going, every move is still checked for legality
                if "move_number_misread" not in flags:
                    flags.append("move_number_misread")
            continue
        if ctx.failed:
            continue
        try:
            move = _resolve(ctx.board, tok)
        except SolutionError as e:
            if len(stack) == 1:
                if info is not None and info["fail_span"] is None:
                    info["fail_span"] = (tok.start(), tok.end())
                if main_moves == 0:
                    raise
                flags.append(f"mainline_truncated: {e}")
                ctx.failed = True
            else:
                flags.append(f"variation_dropped: {e}")
                ctx.failed = True
            continue
        san = ctx.board.san(move)
        sibs = children_at(ctx.path)
        node = next((n for n in sibs if n.uci == move.uci()), None)
        if node is None:
            node = Node(san, move.uci())
            sibs.append(node)
        before = ctx.board.copy()
        ctx.board.push(move)
        ctx.path.append((before, node))
        if len(stack) == 1:
            main_moves += 1
            if info is not None:
                info["main_spans"].append((tok.start(), tok.end()))

    if not roots:
        raise SolutionError("no legal moves found in solution text")
    return roots, flags


def mainline(roots: list[Node]) -> list[Node]:
    out, cur = [], roots
    while cur:
        out.append(cur[0])
        cur = cur[0].children
    return out


def split_solutions(text: str, numbers: list[int]) -> dict[int, str]:
    """Split a solutions section into {exercise number: raw text}.

    Exercise headers are told apart from move numbers by requiring the header
    numbers to appear in increasing order and to be followed by a first move
    ("1." / "1...").
    """
    wanted = sorted(set(numbers))
    if not wanted:
        return {}
    heads = []
    pos = 0
    idx = 0
    pat = re.compile(r"(?<![\w.])(\d{1,4})\s*[.)]?\s*(?=1\s*(?:\.|…))")
    for m in pat.finditer(text):
        n = int(m.group(1))
        if m.start() < pos:
            continue
        while idx < len(wanted) and wanted[idx] < n:
            idx += 1
        if idx < len(wanted) and wanted[idx] == n and (not heads or n > heads[-1][0]):
            heads.append((n, m.start(), m.end()))
            pos = m.end()
            idx += 1
    out = {}
    for i, (n, _s, e) in enumerate(heads):
        end = heads[i + 1][1] if i + 1 < len(heads) else len(text)
        out[n] = " ".join(text[e:end].split())
    return out


def cut_at_result(text: str) -> tuple[str, str | None]:
    """Trim a book entry at its result sign (+-, -+, =, #), leaving out the
    source citation that follows. Signs inside variation brackets are ignored."""
    depth = 0
    for i, ch in enumerate(text):
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth = max(0, depth - 1)
        elif depth == 0:
            two = text[i:i + 2]
            if two in ("+-", "-+"):
                return text[:i], two
            if ch == "#":
                return text[:i + 1], "#"
            if ch == "=" and not re.match(r"=\s*[QRBN]", text[i:]):
                return text[:i], "="
    return text, None


_PIECES = ["", "K", "Q", "R", "B", "N"]


def token_variants(tok: str) -> list[str]:
    """All move tokens one character substitution away (piece, file or rank),
    plus adding or dropping a piece letter. Used only for OCR repair."""
    out = set()
    body = tok.rstrip("+#")
    suf = tok[len(body):]
    m = re.fullmatch(r"([KQRBN]?)(.*)", body)
    piece, rest = m.group(1), m.group(2)
    for p in _PIECES:
        if p != piece:
            out.add(p + rest + suf)
    for i, ch in enumerate(rest):
        pool = "abcdefgh" if ch in "abcdefgh" else "12345678" if ch in "12345678" else ""
        for c in pool:
            if c != ch:
                out.add(piece + rest[:i] + c + rest[i + 1:] + suf)
    out.discard(tok)
    return sorted(out)
