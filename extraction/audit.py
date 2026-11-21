"""Independent quality audit of an exercise database.

    python extraction/audit.py <exercises.json> [--json OUT]

Everything is re-derived from the stored position, solution tree and solution
text with python-chess. The `verification` block written by the pipeline is
never used to decide whether an exercise passes; it is only compared with the
audit's own findings at the end.

The summary (stdout and --json) holds counts, ids, exercise numbers and flag
names only: no FENs, moves or diagrams.
"""
from __future__ import annotations

import argparse
import collections
import json
import sys
from pathlib import Path

import chess

sys.path.insert(0, str(Path(__file__).resolve().parent))
from csx import notation as N  # noqa: E402

SCHEMA = "chess-school-trainer/exercises@1"
CLAIMED = {"total": 1176, "verified": 893, "needs_review": 283}

# Checks an exercise must pass before it can be called verified.
HARD_CHECKS = (
    "fen_parses",            # python-chess can read the FEN
    "fen_legal",             # board.status() is STATUS_VALID
    "one_king_each",         # exactly one king per side
    "opponent_not_in_check",  # the side that is NOT to move is not in check
    "side_matches_fen",      # sideToMove equals the FEN's active colour
    "has_solution",          # the stored solution tree is not empty
    "first_move_legal",      # first main-line move is legal for the side to move
    "solution_legal",        # every node (main line and variations) is legal
    "san_matches_uci",       # stored SAN == SAN python-chess gives for the UCI
    "source_ref",            # bookId, number, pdfPage, chapter.id present
    "id_unique",             # id not used by another exercise
    "number_unique",         # number not used twice within the same book
)
TEXT_CLASSES = ("exact", "stored_is_prefix", "mismatch", "unparseable", "no_text")


def status_reasons(board: chess.Board) -> list[str]:
    """Names of the python-chess status bits that make a position illegal."""
    st = board.status()
    return sorted(s.name.removeprefix("STATUS_").lower() for s in chess.Status if s != chess.STATUS_VALID and st & s)


def walk_tree(board: chess.Board, nodes, problems: dict, counts: dict) -> None:
    """Check every node of a stored solution tree against python-chess."""
    if not isinstance(nodes, list):
        problems["illegal"] += 1
        return
    for n in nodes:
        counts["nodes"] += 1
        try:
            mv = chess.Move.from_uci(str(n.get("uci", "")))
        except (ValueError, AttributeError):
            problems["illegal"] += 1
            continue
        if mv not in board.legal_moves:
            problems["illegal"] += 1
            continue
        if board.san(mv) != n.get("san"):
            problems["san"] += 1
        board.push(mv)
        walk_tree(board, n.get("children", []), problems, counts)
        board.pop()


def stored_mainline(solution) -> list[str]:
    out, cur = [], solution
    while isinstance(cur, list) and cur:
        out.append(cur[0].get("uci"))
        cur = cur[0].get("children", [])
    return out


def source_ref_missing(ex: dict) -> list[str]:
    def is_int(v):
        return isinstance(v, int) and not isinstance(v, bool)
    miss = []
    if not ex.get("bookId"):
        miss.append("bookId")
    if not is_int(ex.get("number")):
        miss.append("number")
    if not is_int(ex.get("pdfPage")) or ex["pdfPage"] < 1:
        miss.append("pdfPage")
    if not (isinstance(ex.get("chapter"), dict) and ex["chapter"].get("id")):
        miss.append("chapter.id")
    return miss


def text_match(ex: dict, board: chess.Board | None) -> dict:
    """Re-parse the stored solution text and compare its main line with the tree.

    run_scan.py stores text that is already normalised and cut at the result
    sign, and parses it with prenormalized=True against the stored FEN, so the
    same call is used here. The text is `solutionCorrected` when the pipeline
    repaired an OCR misread, otherwise `solutionRaw`.
    """
    corrected = ex.get("solutionCorrected")
    text = corrected if corrected is not None else ex.get("solutionRaw") or ""
    stored = stored_mainline(ex.get("solution"))
    out = {"source": "solutionCorrected" if corrected is not None else "solutionRaw", "parse_flags": []}
    if not text.strip():
        return out | {"class": "no_text"}
    if board is None:
        return out | {"class": "unparseable"}
    try:
        roots, pflags = N.parse_solution(board.fen(), text, prenormalized=True)
    except (N.SolutionError, ValueError):
        return out | {"class": "unparseable"}
    parsed = [n.uci for n in N.mainline(roots)]
    out["parse_flags"] = sorted({f.split(":")[0] for f in pflags})
    out["tree_identical"] = [n.to_json() for n in roots] == ex.get("solution")
    if parsed == stored:
        cls = "exact"
    elif stored and parsed[:len(stored)] == stored:
        cls = "stored_is_prefix"
    else:
        cls = "mismatch"
    return out | {"class": cls}


def audit_exercise(ex: dict) -> dict:
    """Audit one exercise on its own (uniqueness is added by audit_db)."""
    checks = dict.fromkeys(HARD_CHECKS, False)
    checks["id_unique"] = checks["number_unique"] = True
    res = {"id": ex.get("id"), "number": ex.get("number"), "checks": checks, "status_reasons": [],
           "source_missing": source_ref_missing(ex), "roots": 0, "nodes": 0, "ends_in_mate": None}
    checks["source_ref"] = not res["source_missing"]
    solution = ex.get("solution")
    checks["has_solution"] = isinstance(solution, list) and len(solution) > 0
    res["roots"] = len(solution) if isinstance(solution, list) else 0

    board = None
    try:
        board = chess.Board(ex.get("fen"))
    except (ValueError, TypeError, AttributeError):
        res["status_reasons"] = ["unparseable"]
    if board is not None:
        checks["fen_parses"] = True
        res["status_reasons"] = status_reasons(board)
        checks["fen_legal"] = not res["status_reasons"]
        checks["one_king_each"] = all(len(board.pieces(chess.KING, c)) == 1 for c in chess.COLORS)
        checks["opponent_not_in_check"] = checks["one_king_each"] and not board.was_into_check()
        turn = "white" if board.turn == chess.WHITE else "black"
        checks["side_matches_fen"] = ex.get("sideToMove") == turn
        res["position_key"] = f"{board.board_fen()} {'w' if board.turn else 'b'}"
        if checks["has_solution"]:
            try:
                checks["first_move_legal"] = chess.Move.from_uci(str(solution[0].get("uci", ""))) in board.legal_moves
            except (ValueError, AttributeError):
                checks["first_move_legal"] = False
            problems, counts = {"illegal": 0, "san": 0}, {"nodes": 0}
            walk_tree(board.copy(), solution, problems, counts)
            res["nodes"] = counts["nodes"]
            checks["solution_legal"] = problems["illegal"] == 0
            checks["san_matches_uci"] = problems["illegal"] == 0 and problems["san"] == 0
            if checks["solution_legal"]:
                b2 = board.copy()
                for u in stored_mainline(solution):
                    b2.push(chess.Move.from_uci(u))
                res["ends_in_mate"] = b2.is_checkmate()

    res["text"] = text_match(ex, board)

    # engine block as recorded by the pipeline (not re-run here)
    eng = (ex.get("verification") or {}).get("engine")
    res["engine_verdict"] = eng.get("verdict") if isinstance(eng, dict) else None
    res["engine_other_first_move"] = None
    if isinstance(eng, dict) and eng.get("engineBestMove") and checks["first_move_legal"]:
        res["engine_other_first_move"] = eng["engineBestMove"] != board.san(chess.Move.from_uci(solution[0]["uci"]))
    return res


def failed_checks(res: dict) -> list[str]:
    return [c for c in HARD_CHECKS if not res["checks"][c]]


def audit_db(db: dict) -> dict:
    exs = db.get("exercises") or []
    results = [audit_exercise(e) for e in exs]

    ids = collections.Counter(r["id"] for r in results)
    nums = collections.Counter((e.get("bookId"), e.get("number")) for e in exs)
    positions = collections.defaultdict(list)
    for e, r in zip(exs, results):
        r["checks"]["id_unique"] = bool(r["id"]) and ids[r["id"]] == 1
        r["checks"]["number_unique"] = nums[(e.get("bookId"), e.get("number"))] == 1
        if "position_key" in r:
            positions[r.pop("position_key")].append(r["number"])
    dup_positions = sorted(sorted(v, key=str) for v in positions.values() if len(v) > 1)

    def nums_of(pred):
        return [r["number"] for e, r in zip(exs, results) if pred(e, r)]

    def ver(e):
        return e.get("verification") or {}

    def status(e):
        return ver(e).get("status")

    def hard_ok(r):
        return not failed_checks(r)

    check_table = {}
    for c in HARD_CHECKS:
        failing = nums_of(lambda e, r: not r["checks"][c])
        check_table[c] = {
            "pass": len(results) - len(failing), "fail": len(failing),
            "fail_verified": sum(1 for e, r in zip(exs, results) if not r["checks"][c] and status(e) == "verified"),
            "failing_numbers": failing,
        }

    chapters = {}
    for e in exs:
        cid = (e.get("chapter") or {}).get("id") or "?"
        row = chapters.setdefault(cid, {"total": 0, "verified": 0, "needs_review": 0})
        row["total"] += 1
        row["verified" if status(e) == "verified" else "needs_review"] += 1

    flags, flags_verified = collections.Counter(), collections.Counter()
    for e in exs:
        for f in set(ver(e).get("flags") or []):
            flags[f] += 1
            if status(e) == "verified":
                flags_verified[f] += 1

    reasons = collections.Counter(x for r in results for x in r["status_reasons"])

    text = {}
    for cls in TEXT_CLASSES:
        sel = [(e, r) for e, r in zip(exs, results) if r["text"]["class"] == cls]
        text[cls] = {"count": len(sel), "verified": sum(1 for e, _ in sel if status(e) == "verified"),
                     "numbers": [r["number"] for _, r in sel] if cls in ("mismatch", "unparseable", "no_text") else None}
    with_text = [(e, r) for e, r in zip(exs, results) if r["text"]["class"] in ("exact", "stored_is_prefix", "mismatch")]
    text_extra = {
        "relies_on_solutionCorrected": len(nums_of(lambda e, r: e.get("solutionCorrected") is not None)),
        "relies_on_solutionCorrected_verified": len(nums_of(lambda e, r: e.get("solutionCorrected") is not None and status(e) == "verified")),
        "relies_on_solutionCorrected_numbers": nums_of(lambda e, r: e.get("solutionCorrected") is not None),
        "tree_identical_to_reparse": sum(1 for _, r in with_text if r["text"].get("tree_identical")),
        "tree_differs_from_reparse_numbers": [r["number"] for _, r in with_text if not r["text"].get("tree_identical")],
        "verified_not_exact_numbers": nums_of(lambda e, r: status(e) == "verified" and r["text"]["class"] != "exact"),
    }

    by_verdict = {}
    for e, r in zip(exs, results):
        row = by_verdict.setdefault(r["engine_verdict"] or "not_checked",
                                    {"exercises": 0, "engine_names_other_first_move": 0, "verified": 0, "numbers": []})
        row["exercises"] += 1
        if r["engine_other_first_move"]:
            row["engine_names_other_first_move"] += 1
            row["verified"] += int(status(e) == "verified")
            row["numbers"].append(r["number"])
    alternatives = {
        "multiple_root_moves": nums_of(lambda e, r: r["roots"] > 1),
        "with_any_variation": len(nums_of(lambda e, r: r["nodes"] > len(stored_mainline(e.get("solution"))))),
        "engine_names_other_first_move": sum(v["engine_names_other_first_move"] for v in by_verdict.values()),
        "by_verdict": by_verdict,
    }

    # ---- stored verification block versus the audit's own findings ----------
    verified_failing = [
        {"number": r["number"], "id": r["id"], "failed": failed_checks(r)
         + ([] if ver(e).get("fenLegal") is True else ["stored_fenLegal_not_true"])
         + ([] if ver(e).get("solutionLegal") is True else ["stored_solutionLegal_not_true"])}
        for e, r in zip(exs, results)
        if status(e) == "verified" and (not hard_ok(r) or ver(e).get("fenLegal") is not True or ver(e).get("solutionLegal") is not True)
    ]
    review_passing = [{"number": r["number"], "id": r["id"], "flags": sorted(ver(e).get("flags") or [])}
                      for e, r in zip(exs, results) if status(e) != "verified" and hard_ok(r)]
    review_flag_sets = collections.Counter(", ".join(x["flags"]) or "(none)" for x in review_passing)
    review_flag_single = collections.Counter(f for x in review_passing for f in x["flags"])
    mate_pairs = [(e, r) for e, r in zip(exs, results) if r["ends_in_mate"] is not None and ver(e).get("mateConfirmed") is not None]
    consistency = {
        "verified_failing": verified_failing,
        "needs_review_passing_all_hard_checks": review_passing,
        "needs_review_passing_by_flag_set": dict(review_flag_sets.most_common()),
        "needs_review_passing_by_flag": dict(review_flag_single.most_common()),
        # stored fenLegal comes from the pipeline's own piece-count test; the audit uses board.status()
        "fenLegal_true_but_status_invalid": nums_of(lambda e, r: ver(e).get("fenLegal") is True and not r["checks"]["fen_legal"]),
        "fenLegal_false_but_status_valid": nums_of(lambda e, r: ver(e).get("fenLegal") is False and r["checks"]["fen_legal"]),
        "solutionLegal_true_but_audit_fails": nums_of(lambda e, r: ver(e).get("solutionLegal") is True and not (r["checks"]["has_solution"] and r["checks"]["solution_legal"])),
        "solutionLegal_false_but_has_legal_solution": nums_of(lambda e, r: ver(e).get("solutionLegal") is False and r["checks"]["has_solution"] and r["checks"]["solution_legal"]),
        "mateConfirmed_disagrees_with_replay": [r["number"] for e, r in mate_pairs if ver(e).get("mateConfirmed") != r["ends_in_mate"]],
        "mateConfirmed_true": sum(1 for e in exs if ver(e).get("mateConfirmed") is True),
        "mainline_ends_in_mate": sum(1 for r in results if r["ends_in_mate"]),
        "status_other_than_verified_or_needs_review": nums_of(lambda e, r: status(e) not in ("verified", "needs_review")),
    }

    n_verified = sum(1 for e in exs if status(e) == "verified")
    totals = {"total": len(exs), "verified": n_verified, "needs_review": len(exs) - n_verified}
    report = db.get("report") or {}
    return {
        "schema_ok": db.get("schema") == SCHEMA,
        "book": (db.get("book") or {}).get("id"),
        "generatedAt": db.get("generatedAt"),
        "totals": totals,
        "claimed": CLAIMED,
        "totals_match_claim": totals == CLAIMED,
        "embedded_report": {k: report.get(k) for k in ("diagramsFound", "validated", "needsReview", "solutionsMatched",
                                                       "mateConfirmed", "engineChecked")},
        "embedded_flag_counts_match": (report.get("flagCounts") == dict(sorted(flags.items()))) if "flagCounts" in report else None,
        "pass_all_hard_checks": sum(1 for r in results if hard_ok(r)),
        "checks": check_table,
        "fen_status_reasons": dict(sorted(reasons.items())),
        "duplicate_ids": sorted(str(k) for k, v in ids.items() if v > 1),
        "duplicate_numbers": sorted((n for (_, n), v in nums.items() if v > 1), key=str),
        "duplicate_positions": dup_positions,
        "chapters": chapters,
        "flags": {f: {"count": flags[f], "on_verified": flags_verified[f]} for f in sorted(flags)},
        "text_match": text,
        "text_match_extra": text_extra,
        "alternatives": alternatives,
        "consistency": consistency,
    }


def short(nums: list, limit: int = 40) -> str:
    if not nums:
        return "none"
    s = ", ".join(str(n) for n in nums[:limit])
    return s + (f", ... ({len(nums)} in all)" if len(nums) > limit else "")


def render(s: dict) -> str:
    t, c = s["totals"], s["claimed"]
    L = [f"Exercise quality audit - book {s['book']} (generated {s['generatedAt']})", ""]
    L.append(f"{'':14}{'measured':>10}{'claimed':>10}")
    for k in ("total", "verified", "needs_review"):
        L.append(f"{k:14}{t[k]:>10}{c[k]:>10}  {'ok' if t[k] == c[k] else 'DIFFERS'}")
    L += ["", f"Pass every hard check: {s['pass_all_hard_checks']} of {t['total']}", "",
          f"{'check':24}{'pass':>6}{'fail':>6}{'fail among verified':>21}"]
    for name, row in s["checks"].items():
        L.append(f"{name:24}{row['pass']:>6}{row['fail']:>6}{row['fail_verified']:>21}")
    L += ["", "Illegal-position reasons (board.status): " + (", ".join(f"{k}={v}" for k, v in s["fen_status_reasons"].items()) or "none"),
          f"Duplicate ids: {short(s['duplicate_ids'])}", f"Duplicate numbers: {short(s['duplicate_numbers'])}",
          f"Duplicate positions (same placement and side, different numbers): {len(s['duplicate_positions'])} group(s) "
          + "; ".join("/".join(map(str, g)) for g in s["duplicate_positions"][:20]), "",
          f"{'chapter':12}{'total':>7}{'verified':>10}{'review':>8}"]
    for cid, row in s["chapters"].items():
        L.append(f"{cid:12}{row['total']:>7}{row['verified']:>10}{row['needs_review']:>8}")
    L += ["", f"{'flag':40}{'count':>6}{'on verified':>13}"]
    for f, row in s["flags"].items():
        L.append(f"{f:40}{row['count']:>6}{row['on_verified']:>13}")
    L += ["", "Stored main line versus re-parsed solution text:", f"  {'class':20}{'count':>6}{'verified':>10}"]
    for cls, row in s["text_match"].items():
        L.append(f"  {cls:20}{row['count']:>6}{row['verified']:>10}")
    x = s["text_match_extra"]
    L += [f"  rely on solutionCorrected (OCR text repaired): {x['relies_on_solutionCorrected']} ({x['relies_on_solutionCorrected_verified']} verified)",
          f"  whole tree identical to re-parse: {x['tree_identical_to_reparse']}; differs: {short(x['tree_differs_from_reparse_numbers'])}",
          f"  verified but not exact: {short(x['verified_not_exact_numbers'])}",
          f"  mismatch: {short(s['text_match']['mismatch']['numbers'])}", ""]
    a = s["alternatives"]
    L += ["Alternative lines:", f"  more than one root move: {len(a['multiple_root_moves'])} ({short(a['multiple_root_moves'])})",
          f"  any side variation stored: {a['with_any_variation']}",
          f"  recorded engine best first move differs from the book move: {a['engine_names_other_first_move']}"]
    for v, row in sorted(a["by_verdict"].items()):
        L.append(f"    verdict {v}: {row['exercises']} exercises, {row['engine_names_other_first_move']} with another best move"
                 f" ({row['verified']} of those verified)")
    k = s["consistency"]
    L += ["", "Stored verification block versus this audit:",
          f"  verified but failing a hard check or fenLegal/solutionLegal: {len(k['verified_failing'])}"]
    for v in k["verified_failing"][:40]:
        L.append(f"    #{v['number']}: {', '.join(v['failed'])}")
    L.append(f"  needs_review but passing every hard check: {len(k['needs_review_passing_all_hard_checks'])}; flags on them:")
    for f, n in k["needs_review_passing_by_flag"].items():
        L.append(f"    {n:>4}  {f}")
    for key in ("fenLegal_true_but_status_invalid", "fenLegal_false_but_status_valid", "solutionLegal_true_but_audit_fails",
                "solutionLegal_false_but_has_legal_solution", "mateConfirmed_disagrees_with_replay",
                "status_other_than_verified_or_needs_review"):
        L.append(f"  {key}: {len(k[key])} ({short(k[key], 20)})")
    L.append(f"  mateConfirmed true: {k['mateConfirmed_true']}; main lines that end in checkmate on replay: {k['mainline_ends_in_mate']}")
    return "\n".join(L)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("db", help="exercises.json")
    ap.add_argument("--json", dest="json_out", help="write the machine-readable summary here")
    args = ap.parse_args(argv)
    try:
        db = json.loads(Path(args.db).read_text())
    except (OSError, ValueError) as e:
        print(f"cannot read {args.db}: {e}", file=sys.stderr)
        return 2
    if not isinstance(db, dict) or not isinstance(db.get("exercises"), list):
        print("not an exercise database", file=sys.stderr)
        return 2
    summary = audit_db(db)
    print(render(summary))
    if args.json_out:
        Path(args.json_out).write_text(json.dumps(summary, indent=1))
    return 1 if summary["consistency"]["verified_failing"] or summary["duplicate_ids"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
