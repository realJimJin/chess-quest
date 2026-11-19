import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { connection } from "next/server";


const ROOT = path.join(/* turbopackIgnore: true */ process.cwd(), process.env.EXTRACTOR_DIR ?? "extraction");
const PY = process.env.EXTRACTOR_PYTHON ?? path.join(ROOT, ".venv", "bin", "python");
const available = () => !process.env.VERCEL && existsSync(/* turbopackIgnore: true */ PY) && existsSync(/* turbopackIgnore: true */ path.join(ROOT, "csx", "cli.py"));

export async function GET() { await connection(); return Response.json({ available: available() }); }

/** Runs the local Python pipeline on an uploaded PDF. Only works when the app
 *  runs on your own machine; the hosted site never receives the book. */
export async function POST(req: Request) {
  if (!available()) return Response.json({ error: "local-only", message: "PDF extraction runs on your own computer, not on the hosted site." }, { status: 501 });
  const form = await req.formData();
  const pdf = form.get("pdf");
  if (!(pdf instanceof File) || pdf.size === 0) return Response.json({ error: "No PDF uploaded." }, { status: 400 });
  const dir = await mkdtemp(path.join(tmpdir(), "cst-"));
  try {
    const pdfPath = path.join(dir, "book.pdf");
    await writeFile(pdfPath, Buffer.from(await pdf.arrayBuffer()));
    const args = ["-m", "csx.cli", pdfPath, "--stdout"];
    const opt = (flag: string, key: string, re: RegExp) => { const v = String(form.get(key) ?? "").trim(); if (v && re.test(v)) args.push(flag, v); };
    opt("--profile", "profile", /^(cs2a|cs2b|cs2|generic)$/);
    opt("--pages", "pages", /^[\d,\- ]+$/);
    opt("--solutions-pages", "solutionsPages", /^[\d,\- ]+$/);
    opt("--page-offset", "pageOffset", /^-?\d+$/);
    opt("--first-number", "firstNumber", /^\d+$/);
    opt("--lang", "lang", /^(en|fig|ru|de|es)$/);
    if (form.get("synthetic") === "1") args.push("--synthetic");
    const labels = String(form.get("labels") ?? "");
    if (labels) { const lp = path.join(dir, "labels.json"); await writeFile(lp, labels); args.push("--labels", lp); }
    const out = await new Promise<string>((resolve, reject) => {
      const p = spawn(/* turbopackIgnore: true */ PY, args, { cwd: ROOT });
      let so = "", se = "";
      p.stdout.on("data", (d) => (so += d)); p.stderr.on("data", (d) => (se += d));
      p.on("error", reject);
      p.on("close", (code) => (so.trim() ? resolve(so) : reject(new Error(se.slice(-600) || `extractor exited ${code}`))));
    });
    const data = JSON.parse(out);
    return Response.json(data, { status: data.error ? 422 : 200 });
  } catch (e) {
    return Response.json({ error: `Extraction failed: ${(e as Error).message}` }, { status: 500 });
  } finally { await rm(dir, { recursive: true, force: true }); }
}
