"""Extract exercises + solutions from a chess book PDF into a validated database.

    python -m csx.cli BOOK.pdf --profile cs2a --out out/

Outputs: exercises.json, exercises.pgn, report.md, piece_clusters.json
"""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import os
import re
import shutil
import sys
from pathlib import Path

import chess
import chess.engine
import chess.pgn
import cv2

from . import boards as B
from . import notation as N

SCHEMA = "chess-school-trainer/exercises@1"
AUTHOR = "Sergey Ivashchenko"

# Chapter page ranges are PRINTED page numbers taken from the publisher's
# contents pages (chessm.ru previews). 2a's solutions start is not listed in
# its preview and is inferred from the 2b layout.
PROFILES = {
    "cs2a": {
        "title": "Chess School 2a — The Manual of Chess Combinations",
        "edition": "Russian Chess House, Moscow 2021, 136 pp.",
        "chapters": [("stage-6", "The 6th stage of studies", 7, 40),
                     ("stage-7", "The 7th stage of studies", 41, 74),
                     ("stage-8", "The 8th stage of studies", 75, 108)],
        "solutions_from": 109,
    },
    "cs2b": {
        "title": "Chess School 2b — The Manual of Chess Combinations",
        "edition": "Russian Chess House, Moscow 2021, 144 pp.",
        "chapters": [("stage-9", "The 9th stage of studies", 7, 40),
                     ("stage-10", "The 10th stage of studies", 41, 74),
                     ("stage-11", "The 11th stage of studies", 75, 108)],
        "solutions_from": 109,
    },
    "cs2": {
        "title": "Chess School 2 — The Manual of Chess Combinations",
        "edition": "single-volume edition",
        "chapters": [],
        "solutions_from": None,
    },
    "generic": {"title": "Imported book", "edition": "", "chapters": [], "solutions_from": None},
}
STAGE_DIFFICULTY = {"stage-6": 4, "stage-7": 5, "stage-8": 6, "stage-9": 7, "stage-10": 8, "stage-11": 9}


def parse_ranges(spec: str) -> set[int]:
    out: set[int] = set()
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        a, _, b = part.partition("-")
        out.update(range(int(a), int(b or a) + 1))
    return out


def fen_problems(board: chess.Board) -> list[str]:
    probs = []
    for color, name in ((chess.WHITE, "white"), (chess.BLACK, "black")):
        if len(board.pieces(chess.KING, color)) != 1:
            probs.append(f"{name}_king_count")
        if len(board.pieces(chess.PAWN, color)) > 8:
            probs.append(f"{name}_too_many_pawns")
        if chess.popcount(board.occupied_co[color]) > 16:
            probs.append(f"{name}_too_many_pieces")
    if board.pawns & (chess.BB_RANK_1 | chess.BB_RANK_8):
        probs.append("pawn_on_back_rank")
    return probs


def with_castling(board: chess.Board) -> bool:
    """Diagrams don't show castling rights: assume them when king and rook are home."""
    board.set_castling_fen("KQkq")
    board.castling_rights = board.clean_castling_rights()
    return bool(board.castling_rights)


def find_engine(explicit: str | None) -> list[str] | None:
    if explicit:
        return explicit.split()
    exe = shutil.which("stockfish")
    if exe:
        return [exe]
    here = Path(__file__).resolve().parents[2]
    js = here / "node_modules" / "stockfish" / "bin" / "stockfish-19-lite-single.js"
    node = shutil.which("node")
    if js.exists() and node:
        return [node, str(js)]
    return None


def engine_check(engine, board: chess.Board, book_uci: str, depth: int) -> dict:
    move = chess.Move.from_uci(book_uci)
    best = engine.analyse(board, chess.engine.Limit(depth=depth))
    book = engine.analyse(board, chess.engine.Limit(depth=depth), root_moves=[move])
    pov = board.turn
    b_cp = best["score"].pov(pov).score(mate_score=100000)
    k_cp = book["score"].pov(pov).score(mate_score=100000)
    best_move = best.get("pv", [None])[0]
    verdict = "agrees"
    if best_move != move and k_cp < b_cp - 150 and k_cp < 200:
        verdict = "suspicious"
    return {
        "verdict": verdict, "depth": depth,
        "engineBestMove": board.san(best_move) if best_move else None,
        "engineBestEval": str(best["score"].pov(pov)),
        "bookMoveEval": str(book["score"].pov(pov)),
        "note": "Engine output is a cross-check only; the stored solution is the book's.",
    }


def page_numbers_near(page, board: B.Board, scale: float) -> int | None:
    """Exercise number from the text layer: nearest all-digit word around the diagram."""
    x0, y0, s = board.x / scale, board.y / scale, board.size / scale
    best = None
    for wx0, wy0, wx1, wy1, word, *_ in page.get_text("words"):
        m = re.fullmatch(r"(\d{1,4})[.)]?", word.strip())
        if not m:
            continue
        cx, cy = (wx0 + wx1) / 2, (wy0 + wy1) / 2
        if not (x0 - s * 0.3 <= cx <= x0 + s * 1.3):
            continue
        dy = min(abs(cy - y0), abs(cy - (y0 + s)))
        inside = y0 + s * 0.08 < cy < y0 + s * 0.92 and x0 < cx < x0 + s
        if inside or dy > s * 0.30:
            continue
        if best is None or dy < best[0]:
            best = (dy, int(m.group(1)))
    return best[1] if best else None


def png_data_url(img) -> str:
    ok, png = cv2.imencode(".png", img)
    return "data:image/png;base64," + base64.b64encode(png.tobytes()).decode()


def run(args) -> dict:
    import pymupdf
    prof = PROFILES[args.profile]
    doc = pymupdf.open(args.pdf)
    npages = len(doc)
    offset = args.page_offset
    printed = lambda idx: idx + 1 + offset  # noqa: E731

    chapters = list(prof["chapters"])
    if args.chapters:
        chapters = []
        for i, part in enumerate(args.chapters.split(";")):
            title, _, rng = part.rpartition(":")
            a, _, b = rng.partition("-")
            chapters.append((f"ch-{i + 1}", title.strip() or f"Chapter {i + 1}", int(a), int(b or a)))

    sol_pages = parse_ranges(args.solutions_pages) if args.solutions_pages else None
    if sol_pages is None and prof["solutions_from"]:
        sol_pages = {p for p in range(prof["solutions_from"] - offset, npages + 1)}
    ex_pages = parse_ranges(args.pages) if args.pages else None

    # ---- pass 1: problems (diagrams) -------------------------------------
    scale = args.dpi / 72.0
    all_boards: list[B.Board] = []
    numbers: dict[int, int | None] = {}
    errors: list[str] = []
    text_layer_chars = 0
    for i in range(npages):
        pdf_page = i + 1
        if ex_pages is not None and pdf_page not in ex_pages:
            continue
        if sol_pages and pdf_page in sol_pages:
            continue
        page = doc[i]
        text_layer_chars += len(page.get_text().strip())
        try:
            gray = B.render_page(page, args.dpi)
            found = B.find_boards(gray, i)
        except Exception as e:  # keep going; report the page
            errors.append(f"page {pdf_page}: render/detect failed: {e}")
            continue
        for b in found:
            numbers[id(b)] = page_numbers_near(page, b, scale)
            all_boards.append(b)

    model = B.PieceModel()
    model.fit(all_boards)
    model.auto_label(B.builtin_bank())
    if args.labels and os.path.exists(args.labels):
        with open(args.labels) as fh:
            lab = json.load(fh)
        model.apply_labels({c["id"]: c for c in lab} if isinstance(lab, list) else lab)

    # ---- pass 2: solutions (text) ----------------------------------------
    sol_text = ""
    if sol_pages:
        for p in sorted(sol_pages):
            if 1 <= p <= npages:
                sol_text += "\n" + doc[p - 1].get_text()
    fig_map = dict(kv.split("=", 1) for kv in args.figurine_map.split(",")) if args.figurine_map else None

    # exercise numbering
    last = args.first_number - 1
    rows = []
    for b in all_boards:
        n = numbers[id(b)]
        src = "text"
        if n is None or (rows and n <= last):
            n, src = last + 1, "inferred"
        last = n
        rows.append((b, n, src))
    sols = N.split_solutions(N.normalize(sol_text, args.lang, fig_map), [n for _, n, _ in rows]) if sol_text.strip() else {}

    eng_cmd = None if args.no_engine else find_engine(args.engine)
    engine = None
    if eng_cmd:
        try:
            engine = chess.engine.SimpleEngine.popen_uci(eng_cmd, timeout=30)
        except Exception as e:
            errors.append(f"engine unavailable ({' '.join(eng_cmd)}): {e}")

    exercises = []
    for b, num, num_src in rows:
        labels, confs = model.classify(b)
        placement = B.labels_to_fen_board(labels)
        fen_conf = round(float(min(confs)), 3) if confs else 0.0
        pdf_page = b.page + 1
        pp = printed(b.page)
        chap = next(((cid, title) for cid, title, a, z in chapters if a <= pp <= z), ("unsorted", "Unsorted"))
        flags: list[str] = []
        if num_src == "inferred":
            flags.append("number_inferred")
        if fen_conf < args.min_confidence:
            flags.append("low_diagram_confidence")

        raw = sols.get(num, "")
        base = chess.Board(None)
        try:
            base.set_board_fen(placement)
        except ValueError:
            flags.append("fen_unparseable")
        probs = fen_problems(base)
        flags += [f"fen_{p}" for p in probs]

        tree, side, side_src, sol_ok = [], None, "unknown", False
        hint_black = bool(re.match(r"\s*1\s*(\.\s*\.\s*\.|…)", raw))
        order = [chess.BLACK, chess.WHITE] if hint_black else [chess.WHITE, chess.BLACK]
        fen = None
        if not probs:
            for turn in order:
                bd = base.copy()
                bd.turn = turn
                castling = with_castling(bd)
                if bd.was_into_check():
                    continue
                if not raw:
                    continue
                try:
                    roots, pflags = N.parse_solution(bd.fen(), raw, "en")
                except N.SolutionError as e:
                    last_err = str(e)
                    continue
                tree, side, sol_ok, fen = roots, turn, True, bd.fen()
                side_src = "solution_text"
                flags += pflags
                if turn != order[0]:
                    flags.append("side_differs_from_solution_numbering")
                if castling:
                    flags.append("castling_rights_assumed")
                break
        if fen is None:
            bd = base.copy()
            bd.turn = chess.BLACK if hint_black else chess.WHITE
            if not probs:
                with_castling(bd)
            fen = bd.fen()
            side = bd.turn
            side_src = "solution_numbering" if raw else "default_white"
            flags.append("solution_missing" if not raw else "solution_illegal_for_diagram")

        eng = None
        if engine and sol_ok:
            try:
                eng = engine_check(engine, chess.Board(fen), tree[0].uci, args.depth)
                if eng["verdict"] == "suspicious":
                    flags.append("engine_disagrees_with_book")
            except Exception as e:
                errors.append(f"exercise {num}: engine check failed: {e}")

        blocking = [f for f in flags if not f.startswith(("castling_rights_assumed", "variation_dropped"))]
        status = "verified" if sol_ok and not blocking else "needs_review"
        plies = len(N.mainline(tree)) if tree else 0
        diff = STAGE_DIFFICULTY.get(chap[0], 5)
        ex = {
            "id": f"{args.profile}-{num:04d}",
            "bookId": args.profile,
            "chapter": {"id": chap[0], "title": chap[1]},
            "number": num, "numberSource": num_src,
            "pdfPage": pdf_page, "printedPage": pp,
            "fen": fen,
            "sideToMove": "white" if side == chess.WHITE else "black",
            "sideSource": side_src,
            "instruction": f"{'White' if side == chess.WHITE else 'Black'} to move",
            "instructionSource": "derived",
            "solutionRaw": raw,
            "solution": [n.to_json() for n in tree],
            "explanation": None,
            "difficulty": {"value": diff, "source": "estimate",
                           "basis": f"chapter position; main line {plies} plies"},
            "verification": {
                "status": status, "fenConfidence": fen_conf,
                "fenLegal": not probs, "solutionLegal": sol_ok,
                "engine": eng, "flags": flags,
            },
        }
        if args.synthetic:
            ex["synthetic"] = True
        if not args.no_crops:
            ex["diagram"] = png_data_url(cv2.resize(b.crop, (240, 240), interpolation=cv2.INTER_AREA))
        exercises.append(ex)
    if engine:
        engine.quit()

    verified = [e for e in exercises if e["verification"]["status"] == "verified"]
    review = [e for e in exercises if e["verification"]["status"] != "verified"]
    report = {
        "pdf": os.path.basename(args.pdf), "pdfPages": npages,
        "hasTextLayer": text_layer_chars > 200,
        "diagramsFound": len(exercises), "validated": len(verified), "needsReview": len(review),
        "solutionsMatched": sum(1 for e in exercises if e["solutionRaw"]),
        "solutionEntriesFound": len(sols),
        "engineChecked": sum(1 for e in exercises if e["verification"]["engine"]),
        "engineDisagreements": [e["number"] for e in exercises
                                if "engine_disagrees_with_book" in e["verification"]["flags"]],
        "reviewList": [{"number": e["number"], "pdfPage": e["pdfPage"], "flags": e["verification"]["flags"]}
                       for e in review],
        "pieceClusters": len(model.clusters),
        "unconfirmedClusters": sum(1 for c in model.clusters if c.label_conf < args.min_confidence),
        "errors": errors,
        "coverageClaim": "Counts are diagrams detected in this PDF. Completeness against the printed "
                         "book is NOT verified by this tool.",
    }
    return {
        "schema": SCHEMA,
        "book": {"id": args.profile, "title": prof["title"], "author": AUTHOR if args.profile != "generic" else "",
                 "edition": prof["edition"]},
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "synthetic": bool(args.synthetic),
        "exercises": exercises, "report": report, "pieceClusters": model.clusters_json(),
    }


def write_pgn(db: dict, path: Path) -> None:
    with open(path, "w") as fh:
        for e in db["exercises"]:
            if not e["solution"]:
                continue
            game = chess.pgn.Game()
            board = chess.Board(e["fen"])
            game.setup(board)
            game.headers.update({
                "Event": db["book"]["title"], "Site": f"{e['chapter']['title']}, p.{e['printedPage']}",
                "White": f"Exercise {e['number']}", "Black": e["verification"]["status"], "Result": "*",
            })

            def add(parent, nodes):
                for i, n in enumerate(nodes):
                    child = parent.add_variation(chess.Move.from_uci(n["uci"])) if i else \
                        parent.add_main_variation(chess.Move.from_uci(n["uci"]))
                    add(child, n["children"])
            add(game, e["solution"])
            print(game, file=fh, end="\n\n")


def write_report(db: dict, path: Path) -> None:
    r = db["report"]
    lines = [
        f"# Extraction report — {db['book']['title']}", "",
        f"- Source PDF: `{r['pdf']}` ({r['pdfPages']} pages, text layer: {'yes' if r['hasTextLayer'] else 'no'})",
        f"- Diagrams identified: **{r['diagramsFound']}**",
        f"- Solutions matched by exercise number: **{r['solutionsMatched']}** (entries found in answer section: {r['solutionEntriesFound']})",
        f"- Fully validated (legal position + legal solution, no blocking flags): **{r['validated']}**",
        f"- Need manual review: **{r['needsReview']}**",
        f"- Engine cross-checked: {r['engineChecked']}; engine disagrees with book on: {r['engineDisagreements'] or 'none'}",
        f"- Piece-image clusters: {r['pieceClusters']} ({r['unconfirmedClusters']} not yet confirmed)",
        f"- {r['coverageClaim']}", "",
    ]
    if r["errors"]:
        lines += ["## Errors", ""] + [f"- {e}" for e in r["errors"]] + [""]
    if r["reviewList"]:
        lines += ["## Exercises requiring review", "", "| # | PDF page | Flags |", "|---|---|---|"]
        lines += [f"| {x['number']} | {x['pdfPage']} | {', '.join(x['flags'])} |" for x in r["reviewList"]]
    path.write_text("\n".join(lines) + "\n")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf")
    ap.add_argument("--profile", choices=sorted(PROFILES), default="generic")
    ap.add_argument("--out", default="out")
    ap.add_argument("--dpi", type=int, default=200)
    ap.add_argument("--pages", help="PDF pages holding exercises, e.g. 7-108")
    ap.add_argument("--solutions-pages", help="PDF pages holding the answers, e.g. 109-136")
    ap.add_argument("--page-offset", type=int, default=0, help="printed page = pdf page + offset")
    ap.add_argument("--chapters", help='override: "Title:7-40;Title:41-74" (printed pages)')
    ap.add_argument("--first-number", type=int, default=1)
    ap.add_argument("--lang", default="fig", choices=sorted(N.LANG_LETTERS))
    ap.add_argument("--figurine-map", help='text-layer glyph map, e.g. "¢=K,£=Q,¦=R,¥=B,¤=N"')
    ap.add_argument("--labels", help="piece_clusters.json with confirmed labels")
    ap.add_argument("--min-confidence", type=float, default=0.6)
    ap.add_argument("--engine", help="UCI engine command")
    ap.add_argument("--no-engine", action="store_true")
    ap.add_argument("--depth", type=int, default=14)
    ap.add_argument("--no-crops", action="store_true", help="do not embed diagram crops")
    ap.add_argument("--synthetic", action="store_true", help="mark output as test fixture, not book content")
    ap.add_argument("--stdout", action="store_true", help="print JSON to stdout instead of writing files")
    args = ap.parse_args(argv)
    try:
        db = run(args)
    except Exception as e:
        print(json.dumps({"error": f"{type(e).__name__}: {e}"}), file=sys.stdout if args.stdout else sys.stderr)
        return 2
    if args.stdout:
        json.dump(db, sys.stdout)
        return 0
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    clusters = db.pop("pieceClusters")
    (out / "piece_clusters.json").write_text(json.dumps(clusters, indent=1))
    db["pieceClusters"] = clusters
    (out / "exercises.json").write_text(json.dumps(db))
    write_pgn(db, out / "exercises.pgn")
    write_report(db, out / "report.md")
    r = db["report"]
    print(f"diagrams={r['diagramsFound']} validated={r['validated']} review={r['needsReview']} -> {out}/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
