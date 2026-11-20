"""Independent audit integration checks, using only the shipped original samples."""
import copy
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import audit


def sample():
    path = Path(__file__).resolve().parents[2] / "src/lib/samples.json"
    ex = copy.deepcopy(json.loads(path.read_text())["exercises"][0])
    # Exercise the document-reference check using an explicitly synthetic page.
    ex["pdfPage"] = 1
    return ex


def test_audit_replays_original_solution_independently():
    result = audit.audit_exercise(sample())
    assert audit.failed_checks(result) == []
    assert result["ends_in_mate"] is True


def test_audit_does_not_trust_verified_flag_for_illegal_solution():
    ex = sample()
    ex["solution"][0]["uci"] = "d1d9"
    result = audit.audit_exercise(ex)
    assert result["checks"]["first_move_legal"] is False
    assert result["checks"]["solution_legal"] is False
    assert ex["verification"]["status"] == "verified"


def test_audit_detects_duplicate_identity_and_redacts_content():
    ex = sample()
    report = audit.audit_db({"schema": audit.SCHEMA, "book": {"id": "samples"}, "exercises": [ex, copy.deepcopy(ex)]})
    assert report["duplicate_ids"] == [ex["id"]]
    assert report["pass_all_hard_checks"] == 0
    public_report = json.dumps(report)
    assert ex["fen"] not in public_report
    assert ex["solutionRaw"] not in public_report
