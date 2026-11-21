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
assert((await stat("out/art/figma-make/journey.png")).size > 0, "Journey artwork is missing");
const native = await readFile("ios/App/App/public/battles/index.html", "utf8");
assert.equal(native, html, "Capacitor has a stale Book Battles page");
const training = await readFile("out/train/index.html", "utf8");
const loadingClass = training.match(/<p class="([^\"]+)" role="status">Preparing your study space/)?.[1];
assert(loadingClass && !loadingClass.includes("undefined"), "Training CSS Module exports were lost");
const trainingSheets = [...training.matchAll(/href="([^\"]+\.css(?:\?[^\"]*)?)"/g)].map(match => new URL(match[1], "https://preview.invalid").pathname);
const trainingCss = (await Promise.all(trainingSheets.map(path => readFile(join("out", path), "utf8")))).join("\n");
assert(trainingCss.includes(`.${loadingClass}`), "Training has no matching stylesheet");
assert(trainingCss.includes("notebookBody"), "Calculation notebook styles are missing");
assert(!trainingCss.includes(":global("), "Unprocessed training selectors reached the export");
assert.equal(await readFile("ios/App/App/public/train/index.html", "utf8"), training, "Capacitor has a stale training page");
const plan = await readFile("out/today/index.html", "utf8");
const planClass = plan.match(/<p class="([^\"]+)" role="status">Preparing your training plan/)?.[1];
assert(planClass && !planClass.includes("undefined"), "Training plan CSS Module exports were lost");
const planSheets = [...plan.matchAll(/href="([^\"]+\.css(?:\?[^\"]*)?)"/g)].map(match => new URL(match[1], "https://preview.invalid").pathname);
const planCss = (await Promise.all(planSheets.map(path => readFile(join("out", path), "utf8")))).join("\n");
assert(planCss.includes(`.${planClass}`) && planCss.includes("sessionTop"), "Training plan styles are missing");
assert.equal(await readFile("ios/App/App/public/today/index.html", "utf8"), plan, "Capacitor has a stale training plan");
console.log("UI export checks passed: Battles, training and plan CSS, notebook styles, map artwork, and Capacitor copies.");
