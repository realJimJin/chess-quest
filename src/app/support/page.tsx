export const metadata = { title: "Support — Chess Quest" };
const REPOSITORY = "https://github.com/realJimJin/chess-quest";
const SOURCE = process.env.NEXT_PUBLIC_TARGET === "ios" ? `${REPOSITORY}/tree/v1.0.1-build4` : REPOSITORY;
const EMAIL =process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "jimjin135@gmail.com";

export default function Support() {
  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-4 text-sm leading-relaxed">
      <h1 className="text-2xl font-semibold tracking-tight">Support</h1>
      <h2 className="mt-2 text-lg font-semibold">Getting started</h2>
      <p>Open Library and tap “Start studying” in The Starter Collection to play eight original puzzles straight away. To train from your own book, open Library, choose Import, and load an exercise file.</p>
      <h2 className="mt-2 text-lg font-semibold">Common questions</h2>
      <p><strong>My progress is missing on another device.</strong> Progress is stored per device and per browser. It does not sync.</p>
      <p><strong>A level won&apos;t unlock.</strong> A level opens when the one before it is 70% done. Free roam, on the Journey screen, opens every level.</p>
      <p><strong>My move was right but not the app&apos;s move.</strong> A legal move that differs from the stored solution is checked by the built-in engine. An equally strong move counts as correct.</p>
      <p><strong>How do I promote a pawn?</strong> Move the pawn to the last rank and pick a piece from the panel that appears.</p>
      <h2 className="mt-2 text-lg font-semibold">Contact</h2>
      <p>{EMAIL ? <>Email <a className="text-accent underline" href={`mailto:${EMAIL}`}>{EMAIL}</a>.</> : "A support contact will be listed here before release."}</p>
      <h2 className="mt-2 text-lg font-semibold">License and source code</h2>
      <p>Chess Quest is copyright © 2026 Guixuan Jin and is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License, version 3 or (at your option) any later version.</p>
      <p>It comes with ABSOLUTELY NO WARRANTY, to the extent permitted by law.</p>
      <p>The complete source code is at <a className="text-accent underline" href={SOURCE}>{SOURCE.replace("https://", "")}</a>, and the license text is at <a className="text-accent underline" href={`${REPOSITORY}/blob/main/LICENSE`}>LICENSE</a>.</p>
      <p>Chess Quest includes chessground (© Lichess, GPL-3.0-or-later), Stockfish (© the Stockfish developers, GPL-3.0) and chess.js (© Jeff Hlywa, BSD-2-Clause).</p>
    </article>
  );
}
