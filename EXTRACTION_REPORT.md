# Extraction report - Chess School 2 (Ivashchenko), 2002 single-volume scan

Source: the owner's own PDF (260 pages, 300-dpi scan, no text layer). Updated 2026-11-19.

## Result

| | Count |
|---|---|
| Exercises identified (diagrams) | **1176** of 1176 printed |
| Solutions located in the answer section | 1166 |
| **Validated** | **893** |
| **Need manual review** | **283** |
| Engine cross-checked (Stockfish lite) | 1148 |
| Lines ending in a confirmed checkmate where the book prints # | 280 |

Validated means: legal position, the whole main line legal from it, and no blocking flag. For 888 of the
893 the book's stated result is also confirmed independently, by checkmate on the board or by the engine's
evaluation of the final position.

## Why exercises are in review (an exercise can carry several flags)

| Flag | Count | Meaning |
|---|---|---|
| mainline_truncated | 172 | solution reads legally up to a point, then a move is illegal and no unique repair exists |
| low_diagram_confidence | 92 | a square matched weakly, or ink fill contradicts the matched colour |
| mate_sign_but_not_mate | 37 | the book prints # but the stored line does not end in mate |
| result_not_confirmed_by_engine | 31 | after the stored line the engine does not see the win the book states |
| solution_illegal_for_diagram | 18 | first move does not fit the diagram |
| king/piece-count problems | 14 | not a legal diagram (mainly the 12 diagrams recovered by layout) |
| solution_missing | 10 | answer entry not found |
| engine_disagrees_with_book | 8 | engine prefers another first move and the result is unconfirmed |

## Notes kept on validated exercises (not blocking)

- solution_autocorrected (53): one or two move tokens were changed by a single character each. A correction is
  accepted only when exactly one such change makes the whole line legal, and the exercise is validated only if the
  result is then confirmed by mate or engine. The text as originally read is kept in `solutionRaw`.
- move_number_misread (226): a move number was misread; every move still played legally in order.
- variation_dropped (97): a side variation could not be read; the main line is intact.
- engine_prefers_other_move (10): the engine likes a different first move, but the book's line reaches its stated result.
- castling_rights_assumed (62), diagram_resolved_by_solution (2).

## Limits of "validated"

- A diagram misread that still allows the same moves and the same result would pass.
- Exercise numbers come from reading order (6 per page, left column first), confirmed by the answer section fitting.
- Side to move comes from the solution text, not from the symbol under the diagram.
- Side variations are stored only where they parsed; many did not.
- Difficulty is an estimate from the stage number. Source citations and prose are not stored.
