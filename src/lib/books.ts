// Structure taken from the publisher's contents pages (chessm.ru previews).
// No exercises ship with the app: positions come only from the user's own PDF.
export interface BookProfile {
  id: string; title: string; subtitle: string; edition: string;
  chapters: { id: string; title: string; pages: string }[];
}
const stage = (n: number, ord: string, pages: string) => ({ id: `stage-${n}`, title: `The ${ord} stage of studies`, pages });
export const BOOKS: BookProfile[] = process.env.NEXT_PUBLIC_TARGET === "ios" ? [] : [
  { id: "cs2", title: "Chess School 2", subtitle: "The Manual of Chess Combinations · Sergey Ivashchenko",
    edition: "Russian Chess House, 2002 · single volume",
    chapters: [6, 7, 8, 9, 10, 11].map((n) => stage(n, `${n}th`, "")) },
  { id: "cs2a", title: "Chess School 2a", subtitle: "The Manual of Chess Combinations · Sergey Ivashchenko",
    edition: "Russian Chess House, Moscow 2021 · 136 pp.",
    chapters: [stage(6, "6th", "7–40"), stage(7, "7th", "41–74"), stage(8, "8th", "75–108")] },
  { id: "cs2b", title: "Chess School 2b", subtitle: "The Manual of Chess Combinations · Sergey Ivashchenko",
    edition: "Russian Chess House, Moscow 2021 · 144 pp.",
    chapters: [stage(9, "9th", "7–40"), stage(10, "10th", "41–74"), stage(11, "11th", "75–108")] },
];
export const bookTitle = (id: string) => BOOKS.find((b) => b.id === id)?.title ?? (id === "samples" ? "Sample Pack" : process.env.NEXT_PUBLIC_TARGET !== "ios" && id === "cs2" ? "Chess School 2" : "Imported book");
