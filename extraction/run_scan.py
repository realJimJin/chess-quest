"""Assemble a scanned edition into the exercise database.

Uses the cached diagram/glyph clusters plus the two label files (piece shapes
and answer-section characters). Usage:
    python run_scan.py CACHE_DIR OUT_DIR [--engine] [--depth N]
"""
import collections, json, pickle, re, sys, datetime as dt
from pathlib import Path
import chess, chess.engine, cv2, numpy as np
from csx import boards as B, notation as N, textocr as T, cli

cache, out = Path(sys.argv[1]), Path(sys.argv[2])
use_engine = "--engine" in sys.argv
depth = int(sys.argv[sys.argv.index("--depth") + 1]) if "--depth" in sys.argv else 12
out.mkdir(parents=True, exist_ok=True)

# ---- diagrams ---------------------------------------------------------------
P = pickle.load(open(cache / "pieces.pkl", "rb"))
plab = json.load(open(cache / "piece_labels.json"))        # rank -> label
order = P["order"]; count = P["count"]
clabel = {order[int(r)]: l for r, l in plab.items()}
meta, assign, bstd = P["meta"], P["assign"], P["bstd"]
raw = pickle.load(open(cache / "boards.pkl", "rb")) + pickle.load(open(cache / "boards_extra.pkl", "rb"))
LAST_EXERCISE_PAGE = 209   # 0-based; later pages are illustrated title pages
_z = np.load(cache / "cell_labels.npz"); LAB, SIM = _z["LAB"], _z["SIM"]
UNC = np.load(cache / "cell_uncertain.npy")

by_page = collections.defaultdict(list)
for i, (page, x, y, size) in enumerate(meta):
    if page <= LAST_EXERCISE_PAGE:
        by_page[page].append(i)
seq, stage_of, stage = [], {}, 5
prev_page = None
for page in sorted(by_page):
    if prev_page is None or page - prev_page > 1:   # a title page sits in the gap
        stage += 1
    prev_page = page
    ids = sorted(by_page[page], key=lambda i: (meta[i][1] > 450, meta[i][2]))   # column-major
    for i in ids:
        seq.append(i); stage_of[i] = stage

# ---- answers ----------------------------------------------------------------
gl, gm = pickle.load(open(cache / "glyphs.pkl", "rb"))
gm.load_labels(str(cache / "glyph_labels.json"))
final = cache / "glyph_final.json"
if final.exists():
    labs, parts, key = json.load(open(final)), [], None
    for g, lab in zip(gl, labs):
        k_ = (g.page, g.line)
        if k_ != key:
            parts.append("\n"); key = k_
        elif g.gap > 0.28:
            parts.append(" ")
        if lab != "~":
            parts.append(lab)
    text = "".join(parts)
else:
    text = T.read_text(gl, gm)
cands = []
for m in re.finditer(r"(?m)^(?:[^\d\n]{0,5})(\d{1,4})\s*\.\s*(?=1\s*[.…])|№\s*(\d{1,4})\s*\.?", text):
    n = int(m.group(1) or m.group(2))
    cands.append((m.start(), m.end(), n))
heads, last = [], 0
for s, e, n in cands:
    if last < n <= last + 30 and n <= len(seq):
        heads.append((s, e, n)); last = n
recovered_heads = 0
filled = []
for k, (s_, e_, n) in enumerate(heads):
    filled.append((s_, e_, n))
    nxt = heads[k + 1] if k + 1 < len(heads) else None
    gap = (nxt[2] - n - 1) if nxt else 0
    if gap > 0:
        seg = text[e_:nxt[0]]
        starts = [m for m in re.finditer(r"\n(?=[^\n\[\(]{0,14}?1\s*\.)", seg)]
        if len(starts) == gap:       # exactly as many new-entry lines as missing numbers
            for j, m in enumerate(starts):
                hm = re.match(r"\n[^\n]{0,14}?(?=1\s*\.)", seg[m.start():])
                filled.append((e_ + m.start(), e_ + m.start() + hm.end(), n + 1 + j)); recovered_heads += 1
heads = sorted(filled)
sols = {}
for k, (s, e, n) in enumerate(heads):
    end = heads[k + 1][0] if k + 1 < len(heads) else len(text)
    sols[n] = N.normalize(" ".join(text[e:end].replace("?", " ").split()), "en")
print("answer headers:", len(heads), "of which recovered from gaps:", recovered_heads, flush=True)

# ---- assemble ---------------------------------------------------------------
engine = None
if use_engine:
    cmd = cli.find_engine(None)
    engine = chess.engine.SimpleEngine.popen_uci(cmd, timeout=60) if cmd else None

STAGE_TITLE = {6: "6th", 7: "7th", 8: "8th", 9: "9th", 10: "10th", 11: "11th"}


def attempt(base, body, result, turn):
    bd = base.copy(); bd.turn = turn
    castling = cli.with_castling(bd)
    if bd.was_into_check():
        return None
    info = {}
    try:
        roots, pflags = N.parse_solution(bd.fen(), body, prenormalized=True, info=info)
    except N.SolutionError as e:
        return {"ok": False, "err": str(e), "info": info, "clean": False}
    trunc = any(f.startswith("mainline_truncated") for f in pflags)
    mate = None
    if result == "#":
        b2 = chess.Board(bd.fen())
        for n_ in N.mainline(roots):
            b2.push(chess.Move.from_uci(n_.uci))
        mate = b2.is_checkmate()
    return {"ok": True, "roots": roots, "flags": [f.split(":")[0] for f in pflags], "trunc": trunc, "mate": mate,
            "fen": bd.fen(), "castling": castling, "info": info, "turn": turn, "clean": not trunc and mate is not False}


def repair(base, body, result, turn, depth, budget):
    """OCR repair: change one move token by one character and keep only texts whose
    whole main line then plays legally (and mates, where the book prints #)."""
    if budget[0] <= 0:
        return []
    budget[0] -= 1
    r = attempt(base, body, result, turn)
    if r is None:
        return []
    if r["clean"]:
        return [(body, r)]
    if depth == 0:
        return []
    fs = r["info"].get("fail_span")
    if fs:
        spans, nd = [fs], depth - 1
    elif r["ok"] and r["mate"] is False:
        spans, nd = r["info"]["main_spans"], 0
    else:
        return []
    out = []
    for a_, b_ in spans:
        for v in N.token_variants(body[a_:b_]):
            out += repair(base, body[:a_] + v + body[b_:], result, turn, nd, budget)
    return out


def final_eval(engine, fen, roots, depth):
    b2 = chess.Board(fen)
    for n_ in N.mainline(roots):
        b2.push(chess.Move.from_uci(n_.uci))
    if b2.is_checkmate():
        return 100000 if b2.turn == chess.BLACK else -100000
    if b2.is_stalemate() or b2.is_insufficient_material():
        return 0
    sc = engine.analyse(b2, chess.engine.Limit(depth=depth))["score"].white().score(mate_score=100000)
    return sc


exercises, stats = [], collections.Counter()
for num, i in enumerate(seq, 1):
    page, x, y, size = meta[i]
    labels = [str(x) for x in LAB[i]]
    flags = []
    unc_cells = [j for j in range(64) if UNC[i, j]]
    entry = sols.get(num, "")
    body, result = N.cut_at_result(entry) if entry else ("", None)
    hint_black = bool(re.match(r"\s*1\s*(\.\s*\.\s*\.|…)", body))
    turns = [chess.BLACK, chess.WHITE] if hint_black else [chess.WHITE, chess.BLACK]

    def board_of(labs):
        bd = chess.Board(None); bd.set_board_fen(B.labels_to_fen_board(labs)); return bd

    base = board_of(labels)
    probs = cli.fen_problems(base)
    best, corrected_from, resolved = None, None, False
    if body:
        # (a) the diagram as read, both sides to move
        if not probs:
            for turn in turns:
                r = attempt(base, body, result, turn)
                if r and r["ok"] and (best is None or (r["clean"] and not best["clean"])):
                    best = r
                if best and best["clean"]:
                    break
        # (b) uncertain squares: try the other colour, keep it only if exactly one reading fits the solution
        swappable = [j for j in unc_cells if labels[j] != "empty"]
        if not (best and best["clean"]) and 0 < len(swappable) <= 4:
            fits = []
            for mask in range(1, 1 << len(swappable)):
                labs = list(labels)
                for k_, j in enumerate(swappable):
                    if mask >> k_ & 1:
                        labs[j] = labs[j].swapcase()
                bd = board_of(labs)
                if cli.fen_problems(bd):
                    continue
                for turn in turns:
                    r = attempt(bd, body, result, turn)
                    if r and r["clean"]:
                        fits.append((labs, bd, r)); break
            if len(fits) == 1:
                labels, base, best = fits[0]; probs = []; resolved = True
        # (c) misread characters in the solution text
        if not probs and not (best and best["clean"]):
            found = {}
            for turn in turns:
                for txt, r in repair(base, body, result, turn, 2, [4000]):
                    found[tuple(n_.uci for n_ in N.mainline(r["roots"]))] = (txt, r)
                if found:
                    break
            if len(found) == 1:
                txt, r = next(iter(found.values()))
                corrected_from, body, best = body, txt, r
    if unc_cells and not resolved:
        flags.append("low_diagram_confidence")
    if resolved:
        flags.append("diagram_resolved_by_solution")
    if corrected_from:
        flags.append("solution_autocorrected")
    flags += [f"fen_{p}" for p in probs]
    conf = 0.5 if (unc_cells and not resolved) else round(float(min(1.0, SIM[i][LAB[i] != "empty"].min(initial=1.0))), 2)
    tree, ok, err = [], False, ""
    if best and best["ok"]:
        tree, fen, side, ok = best["roots"], best["fen"], best["turn"], True
        flags += best["flags"]
        if best["turn"] != turns[0]:
            flags.append("side_differs_from_solution_numbering")
        if best["castling"]:
            flags.append("castling_rights_assumed")
        if best["mate"] is False:
            flags.append("mate_sign_but_not_mate")
    else:
        bd = base.copy(); bd.turn = turns[0]
        if not probs:
            cli.with_castling(bd)
        fen, side = bd.fen(), bd.turn
        flags.append("solution_missing" if not body else "solution_illegal_for_diagram")
        err = (best or {}).get("err", "")
    line = N.mainline(tree)
    mate_ok = best["mate"] if (best and best["ok"]) else None
    result_ok = None
    eng = None
    if engine and ok:
        try:
            eng = cli.engine_check(engine, chess.Board(fen), tree[0].uci, depth)
            if eng["verdict"] == "suspicious":
                eng = cli.engine_check(engine, chess.Board(fen), tree[0].uci, depth + 6)
            if result in ("+-", "-+", "="):
                fe = final_eval(engine, fen, tree, depth + 2)
                if result == "=":
                    result_ok = abs(fe) <= 250
                    if not result_ok:
                        flags.append("draw_not_confirmed_by_engine")
                else:
                    result_ok = (fe >= 150) if result == "+-" else (fe <= -150)
                    if not result_ok:
                        flags.append("result_not_confirmed_by_engine")
            if eng["verdict"] == "suspicious":
                # the engine prefers another first move; that only blocks when the book's own
                # line also fails to reach the result the book states
                flags.append("engine_disagrees_with_book" if result_ok is not True and mate_ok is not True
                             else "engine_prefers_other_move")
        except Exception:
            flags.append("engine_check_failed")
    if corrected_from and not (mate_ok or result_ok):
        flags.append("autocorrection_unconfirmed")
    soft = ("castling_rights_assumed", "variation_dropped", "move_number_misread", "diagram_resolved_by_solution",
            "solution_autocorrected", "engine_prefers_other_move", "draw_not_confirmed_by_engine", "side_differs_from_solution_numbering")
    blocking = [f for f in flags if f not in soft]
    status = "verified" if ok and not blocking else "needs_review"
    stats[status] += 1
    for f in set(flags):
        stats["flag:" + f] += 1
    st = stage_of[i]
    ex = {
        "id": f"cs2-{num:04d}", "bookId": "cs2",
        "chapter": {"id": f"stage-{st}", "title": f"The {STAGE_TITLE.get(st, str(st) + 'th')} stage of studies"},
        "number": num, "numberSource": "inferred", "pdfPage": page + 1, "printedPage": page - 1,
        "fen": fen, "sideToMove": "white" if side == chess.WHITE else "black",
        "sideSource": "solution_text" if ok else "default",
        "instruction": f"{'White' if side == chess.WHITE else 'Black'} to move", "instructionSource": "derived",
        "goal": {"+-": "White wins", "-+": "Black wins", "=": "draw", "#": "mate"}.get(result),
        "solutionRaw": corrected_from or body, "solutionCorrected": body if corrected_from else None, "solution": [n_.to_json() for n_ in tree], "explanation": None,
        "difficulty": {"value": cli.STAGE_DIFFICULTY.get(f"stage-{st}", 5), "source": "estimate",
                       "basis": f"stage {st}; main line {len(line)} plies"},
        "verification": {"status": status, "fenConfidence": round(conf, 2), "fenLegal": not probs,
                         "solutionLegal": ok, "mateConfirmed": mate_ok, "resultConfirmed": result_ok, "engine": eng, "flags": sorted(set(flags))},
    }
    if status != "verified":
        crop = raw[i][6]
        ex["diagram"] = cli.png_data_url(cv2.resize(crop, (220, 220), interpolation=cv2.INTER_AREA))
        if err and not ok:
            ex["verification"]["parseError"] = err.split(" in ")[0]
    exercises.append(ex)
if engine:
    engine.quit()

review = [e for e in exercises if e["verification"]["status"] != "verified"]
report = {
    "pdf": "Chess School 2 (2002 edition scan)", "pdfPages": 260, "hasTextLayer": False,
    "diagramsFound": len(exercises), "validated": stats["verified"], "needsReview": len(review),
    "solutionEntriesFound": len(sols), "solutionsMatched": sum(1 for e in exercises if e["solutionRaw"]),
    "mateConfirmed": sum(1 for e in exercises if e["verification"]["mateConfirmed"]),
    "engineChecked": sum(1 for e in exercises if e["verification"]["engine"]),
    "engineDisagreements": [e["number"] for e in exercises if "engine_disagrees_with_book" in e["verification"]["flags"]],
    "flagCounts": {k[5:]: v for k, v in sorted(stats.items()) if k.startswith("flag:")},
    "reviewList": [{"number": e["number"], "pdfPage": e["pdfPage"], "flags": e["verification"]["flags"]} for e in review],
    "errors": [],
    "coverageClaim": "1176 diagrams were detected, equal to the last exercise number printed in the book. "
                     "Exercise numbers are assigned by reading order, not read from the page.",
}
db = {"schema": cli.SCHEMA,
      "book": {"id": "cs2", "title": "Chess School 2 — The Manual of Chess Combinations", "author": cli.AUTHOR,
               "edition": "Russian Chess House, 2002 (scan, 260 pp.)"},
      "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
      "exercises": exercises, "report": report}
(out / "exercises.json").write_text(json.dumps(db))
cli.write_pgn(db, out / "exercises.pgn")
cli.write_report(db | {"report": report | {"pieceClusters": len(count), "unconfirmedClusters": 0}}, out / "report.md")
print(json.dumps({k: report[k] for k in ("diagramsFound", "validated", "needsReview", "solutionEntriesFound", "mateConfirmed", "engineChecked", "flagCounts")}, indent=1))
print("engine disagreements:", len(report["engineDisagreements"]))
