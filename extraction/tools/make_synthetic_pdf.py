"""Build a small book-like PDF for testing the pipeline.

The positions are generic textbook mating patterns written for this test
suite. They are NOT from Ivashchenko's book and are tagged synthetic so the
app never presents them as book content.
"""
import sys
import chess
import chess.svg
import pymupdf

POSITIONS = [
    (1, "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1", "1.Rd8#"),
    (2, "5r1k/6pp/7N/8/8/1Q6/8/7K w - - 0 1", "1.Qg8+! Rxg8 2.Nf7#"),
    (3, "3r2k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1", "1...Rd1#"),
    (4, "3r3k/4P1pp/8/8/8/8/8/K7 w - - 0 1", "1.exd8=Q#"),
    (5, "6k1/8/R7/1R6/8/8/8/K7 w - - 0 1", "1.Rb7 Kh8 (1...Kf8 2.Ra8#) 2.Ra8#"),
    (6, "r3k2r/8/8/8/8/8/8/4K2R w K - 0 1", "1.0-0 0-0-0 2.Rf7"),
]


def board_png(fen: str, px: int = 480) -> bytes:
    svg = chess.svg.board(chess.Board(fen), coordinates=False, size=px,
                          colors={"square light": "#ffffff", "square dark": "#b0b0b0"})
    doc = pymupdf.open(stream=svg.encode(), filetype="svg")
    return doc[0].get_pixmap(alpha=False).tobytes("png")


def build(path: str, solutions_as_figurines: bool = False) -> None:
    doc = pymupdf.open()
    per_page, size, gap = 4, 190, 40
    for start in range(0, len(POSITIONS), per_page):
        page = doc.new_page(width=482, height=680)
        for k, (num, fen, _sol) in enumerate(POSITIONS[start:start + per_page]):
            col, row = k % 2, k // 2
            x = 36 + col * (size + gap)
            y = 70 + row * (size + 70)
            page.insert_text((x + size / 2 - 6, y - 10), str(num), fontsize=12)
            rect = pymupdf.Rect(x, y, x + size, y + size)
            page.insert_image(rect, stream=board_png(fen))
            page.draw_rect(rect, color=(0, 0, 0), width=1.2)
    page = doc.new_page(width=482, height=680)
    page.insert_text((180, 50), "SOLUTIONS", fontsize=14)
    y = 90
    for num, _fen, sol in POSITIONS:
        text = sol
        if solutions_as_figurines:
            for a, b in (("K", "♔"), ("Q", "♕"), ("R", "♖"), ("N", "♘"), ("B", "♗")):
                text = text.replace(a, b)
        page.insert_text((40, y), f"{num}. {text}", fontsize=11)
        y += 22
    doc.save(path)


if __name__ == "__main__":
    build(sys.argv[1])
    print("wrote", sys.argv[1])
