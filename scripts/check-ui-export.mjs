// Guard the CSS-module regression that rendered a styled route without class names.
// Run after build:ios; this checks the actual export and the Capacitor copy.
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const html = await readFile("out/battles/index.html", "utf8");
const nav = html.match(/<nav\b[^>]*aria-label="Book Battles preview screens"[^>]*>/)?.[0];
assert(nav, "Book Battles preview navigation is missing from the export");
const className = nav.match(/class="([^\"]+)"/)?.[1];
assert(className && !className.includes("undefined"), "CSS Module class exports were lost in the build pipeline");
const stylesheets = [...html.matchAll(/href="([^\"]+\.css(?:\?[^\"]*)?)"/g)].map(match => new URL(match[1], "https://preview.invalid").pathname);
assert(stylesheets.length > 0, "Export has no stylesheets");
const css = (await Promise.all(stylesheets.map(path => readFile(join("out", path), "utf8")))).join("\n");
assert(css.includes(`.${className}`), "The rendered module class has no matching stylesheet rule");
assert(!css.includes(":global("), "Unprocessed CSS Module global selectors reached the export");
assert((await stat("out/art/academy-valley.png")).size > 0, "Journey artwork is missing");
const native = await readFile("ios/App/App/public/battles/index.html", "utf8");
assert.equal(native, html, "Capacitor has a stale Book Battles page");
console.log("UI export checks passed: CSS classes, stylesheets, map artwork, and Capacitor copy.");
