import json, subprocess, sys
from pathlib import Path
import chess, pytest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from csx import notation as N, boards as B, cli
from tools.make_synthetic_pdf import POSITIONS, build

ROOT = Path(__file__).resolve().parents[1]

@pytest.fixture(scope="session")
def db(tmp_path_factory):
    d = tmp_path_factory.mktemp("syn")
    pdf = d / "synthetic.pdf"
    build(str(pdf))
    rc = cli.main([str(pdf), "--profile", "generic", "--out", str(d / "out"), "--pages", "1-2",
                   "--solutions-pages", "3", "--synthetic", "--depth", "10"])
    assert rc == 0
    return json.loads((d / "out" / "exercises.json").read_text()), d / "out"

# --- FEN reconstruction ---------------------------------------------------
def test_all_diagrams_found_and_fens_exact(db):
    data, _ = db
    assert len(data["exercises"]) == len(POSITIONS)
    for ex, (num, fen, _s) in zip(data["exercises"], POSITIONS):
        assert ex["number"] == num and ex["numberSource"] == "text"
        assert ex["fen"].split()[0] == fen.split()[0], f"exercise {num}"
        assert ex["fen"].split()[1] == fen.split()[1]
        assert chess.Board(ex["fen"]).is_valid()
        assert ex["synthetic"] is True

def test_solutions_matched_to_right_exercise(db):
    data, _ = db
    for ex, (num, fen, sol) in zip(data["exercises"], POSITIONS):
        assert ex["solutionRaw"].replace("!", "") == sol.replace("!", "").replace("0-0-0", "O-O-O").replace("0-0", "O-O")
        board = chess.Board(ex["fen"])
        node = ex["solution"]
        while node:  # main line legal
            mv = chess.Move.from_uci(node[0]["uci"])
            assert mv in board.legal_moves
            board.push(mv); node = node[0]["children"]
        assert ex["verification"]["solutionLegal"]

def test_variation_tree_and_report(db):
    data, out = db
    ex5 = data["exercises"][4]
    replies = {c["san"] for c in ex5["solution"][0]["children"]}
    assert replies == {"Kh8", "Kf8"}
    r = data["report"]
    assert r["diagramsFound"] == 6 and r["validated"] + r["needsReview"] == 6
    assert "NOT verified" in r["coverageClaim"]
    assert (out / "exercises.pgn").read_text().count("[Event ") == 6
    assert "Extraction report" in (out / "report.md").read_text()

def test_engine_crosscheck_runs_when_available(db):
    data, _ = db
    if cli.find_engine(None) is None:
        pytest.skip("no engine")
    assert data["report"]["engineChecked"] == 6
    assert data["exercises"][0]["verification"]["engine"]["verdict"] == "agrees"

# --- notation / legality --------------------------------------------------
def test_figurines_russian_and_long_algebraic():
    fen = "5r1k/6pp/7N/8/8/1Q6/8/7K w - - 0 1"
    for text, lang in (("1.♕g8+ ♖xg8 2.♘f7#", "fig"), ("1.Фg8+ Л:g8 2.Кf7X", "ru"), ("1.Qb3-g8+ Rf8xg8 2.Nh6-f7#", "en")):
        roots, flags = N.parse_solution(fen, text, lang)
        assert [n.san for n in N.mainline(roots)] == ["Qg8+", "Rxg8", "Nf7#"], text

def test_castling_en_passant_promotion():
    roots, _ = N.parse_solution("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "1.0-0-0 0-0")
    assert [n.uci for n in N.mainline(roots)] == ["e1c1", "e8g8"]
    roots, _ = N.parse_solution("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1", "1.exd6 e.p.")
    assert roots[0].uci == "e5d6"
    roots, _ = N.parse_solution("8/P6k/8/8/8/8/8/K7 w - - 0 1", "1.a8N")
    assert roots[0].uci == "a7a8n"

def test_illegal_mainline_is_rejected_not_guessed():
    with pytest.raises(N.SolutionError):
        N.parse_solution("6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1", "1.Qd8#")
    with pytest.raises(N.SolutionError):  # ambiguous: two rooks can reach d8
        N.parse_solution("6k1/5ppp/8/8/8/8/3R1PPP/3R2K1 b - - 0 1".replace(" b ", " w ").replace("3R1PPP/3R2K1", "R4PPP/3R2K1").replace("6k1", "R5k1"), "1.Rd8")

def test_bad_variation_dropped_and_flagged():
    roots, flags = N.parse_solution("6k1/8/R7/1R6/8/8/8/K7 w - - 0 1", "1.Rb7 Kh8 (1...Kg7 2.Ra8#) 2.Ra8#")
    assert [n.san for n in N.mainline(roots)] == ["Rb7", "Kh8", "Ra8#"]
    assert any(f.startswith("variation_dropped") for f in flags)

def test_split_solutions_ignores_move_numbers():
    text = "1. 1.Rd8# 2. 1.Qg8+ Rxg8 2.Nf7# 3. 1...Rd1#"
    got = N.split_solutions(text, [1, 2, 3])
    assert got == {1: "1.Rd8#", 2: "1.Qg8+ Rxg8 2.Nf7#", 3: "1...Rd1#"}

# --- extraction errors ----------------------------------------------------
def test_wrong_side_diagram_goes_to_review():
    probs = cli.fen_problems(chess.Board("8/8/8/8/8/8/8/K7 w - - 0 1"))
    assert "black_king_count" in probs

def test_missing_solutions_flagged(tmp_path):
    pdf = tmp_path / "s.pdf"; build(str(pdf))
    assert cli.main([str(pdf), "--out", str(tmp_path / "o"), "--pages", "1-2", "--no-engine", "--synthetic"]) == 0
    data = json.loads((tmp_path / "o" / "exercises.json").read_text())
    assert all(e["verification"]["status"] == "needs_review" for e in data["exercises"])
    assert all("solution_missing" in e["verification"]["flags"] for e in data["exercises"])

def test_not_a_pdf_reports_error(tmp_path):
    bad = tmp_path / "x.pdf"; bad.write_text("not a pdf")
    assert cli.main([str(bad), "--out", str(tmp_path / "o")]) == 2

def test_publisher_preview_has_no_exercises():
    """Guards the claim in the report: the chessm.ru previews contain no diagrams."""
    import os
    p = os.environ.get("CS2_PREVIEW_PDF")
    if not p: pytest.skip("set CS2_PREVIEW_PDF to check")
    out = subprocess.run([sys.executable, "-m", "csx.cli", p, "--profile", "cs2a", "--stdout", "--no-engine"],
                         cwd=ROOT, capture_output=True, text=True)
    assert json.loads(out.stdout)["report"]["diagramsFound"] == 0
