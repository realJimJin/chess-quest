// Guard the CSS-module regression that rendered a styled route without class names.
// Run after build:ios; this checks the actual export and the Capacitor copy.
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const library = await readFile("out/index.html", "utf8");
assert(!library.includes('href="/battles/"'), "Unfinished Battles navigation reached the iOS release");
assert(!library.includes("Discover Book Battles"), "Unfinished Battles promotion reached the iOS release");
const battles = await readFile("out/battles/index.html", "utf8").catch(() => "");
assert(!battles.includes('aria-label="Book Battles preview screens"'), "The unfinished Battles preview is accessible in the iOS release");
assert((await stat("out/art/figma-make/journey.png")).size > 0, "Journey artwork is missing");
assert((await stat("out/art/figma-make/starter-cover.svg")).size > 0, "Starter cover is missing");
assert.equal(await readFile("ios/App/App/public/index.html", "utf8"), library, "Capacitor has a stale library page");
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
console.log("UI export checks passed: iOS release excludes unfinished Battles; training and plan CSS, artwork, and Capacitor copies are intact.");
