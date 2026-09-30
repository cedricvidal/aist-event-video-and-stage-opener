#!/usr/bin/env node
// Render an AI Show & Tell promo video.
//   node render.mjs <event-folder> [--formats 16x9,1x1,9x16,4x5] [--stills 1,5.5,20] [--no-audio] [--preview]
// Frames are rendered deterministically: Playwright seeks the paused GSAP timeline
// to each frame time, screenshots it, and pipes PNGs into ffmpeg.
import { createServer } from "node:http";
import { readFile, mkdir, access } from "node:fs/promises";
import { spawn, execFileSync } from "node:child_process";
import { extname, join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SIZES = { "16x9": [1920, 1080], "1x1": [1080, 1080], "9x16": [1080, 1920], "4x5": [1080, 1350] };
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".svg": "image/svg+xml" };

const args = process.argv.slice(2);
const eventArg = args.find((a) => !a.startsWith("--") && !args[args.indexOf(a) - 1]?.match(/^--(formats|stills)$/));
if (!eventArg) {
  console.error("usage: node render.mjs <event-folder> [--formats 16x9,1x1,9x16] [--stills t1,t2] [--no-audio] [--preview]");
  process.exit(1);
}
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const eventDir = resolve(ROOT, eventArg);
const eventName = basename(eventDir);
const formats = (opt("--formats") || "16x9,1x1,9x16").split(",");
const stills = opt("--stills")?.split(",").map(Number);
const noAudio = args.includes("--no-audio");
const preview = args.includes("--preview"); // fast, lower-quality encode
const outDir = join(eventDir, "out");
await mkdir(outDir, { recursive: true });
const ev = JSON.parse(await readFile(join(eventDir, "event.json"), "utf8"));
const slug = ev.slug || eventName;

// ---------- static server rooted at the repo root
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = resolve(ROOT, "." + p);
    if (!file.startsWith(ROOT)) throw new Error("forbidden");
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404); res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const pageUrl = (fmt) => `http://127.0.0.1:${port}/src/index.html?event=${encodeURIComponent(eventName)}&format=${fmt}`;

// ---------- audio (synthesize once, then two-pass loudness normalize to -14 LUFS)
const exists = (p) => access(p).then(() => true, () => false);
let audio = null;
if (!stills && !noAudio) {
  const raw = join(outDir, "music.wav");
  if (!(await exists(raw))) {
    console.log("♪ synthesizing music…");
    execFileSync("uv", ["run", "--script", join(ROOT, "music", "synth.py"), eventDir], { stdio: "inherit" });
  }
  audio = join(outDir, "music-norm.wav");
  const probe = spawn("ffmpeg", ["-hide_banner", "-i", raw, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"]);
  let err = ""; probe.stderr.on("data", (d) => (err += d));
  await new Promise((r) => probe.on("close", r));
  const m = JSON.parse(err.slice(err.lastIndexOf("{"), err.lastIndexOf("}") + 1));
  const af = `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", raw, "-af", af, "-ar", "48000", audio]);
  console.log(`♪ audio normalized (input ${m.input_i} LUFS → -14)`);
}

// ---------- render
const browser = await chromium.launch({ args: ["--disable-gpu-vsync", "--force-color-profile=srgb", "--hide-scrollbars"] });

async function openPage(fmt) {
  const [w, h] = SIZES[fmt];
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error(`[${fmt}] page error:`, e.message));
  page.on("console", (m) => m.type() === "error" && console.error(`[${fmt}]`, m.text()));
  await page.goto(pageUrl(fmt));
  await page.evaluate(() => window.__ready);
  return page;
}

async function renderStills(fmt) {
  const page = await openPage(fmt);
  const dir = join(outDir, "stills"); await mkdir(dir, { recursive: true });
  for (const t of stills) {
    await page.evaluate((t) => window.seek(t), t);
    await page.screenshot({ path: join(dir, `${fmt}-${t.toFixed(2).padStart(6, "0")}.png`) });
  }
  await page.close();
  console.log(`✓ ${fmt}: ${stills.length} stills → ${dir}`);
}

async function renderVideo(fmt) {
  const page = await openPage(fmt);
  const { duration, fps, poster } = await page.evaluate(() => ({ duration: window.__duration, fps: window.__fps, poster: window.__poster }));
  const frames = Math.round(duration * fps);
  const out = join(outDir, `${slug}-${fmt}.mp4`);
  const ff = spawn("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-",
    ...(audio ? ["-i", audio] : []),
    "-map", "0:v", ...(audio ? ["-map", "1:a", "-c:a", "aac", "-b:a", "192k", "-ar", "48000"] : []),
    "-c:v", "libx264", "-preset", preview ? "veryfast" : "slow", "-crf", preview ? "26" : "17",
    "-pix_fmt", "yuv420p", "-profile:v", "high", "-tune", "animation",
    "-r", String(fps), "-t", String(duration), "-movflags", "+faststart", out,
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((r, j) => ff.on("close", (c) => (c ? j(new Error(`ffmpeg exited ${c}`)) : r())));
  const t0 = Date.now();
  for (let f = 0; f < frames; f++) {
    await page.evaluate((t) => window.seek(t), f / fps);
    const buf = await page.screenshot({ type: "png" });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    if (f % (fps * 5) === 0) console.log(`  [${fmt}] ${f}/${frames} frames (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  ff.stdin.end();
  await done;
  await page.evaluate((t) => window.seek(t), poster ?? duration - 1);
  await page.screenshot({ path: join(outDir, `${slug}-${fmt}-poster.png`) });
  await page.close();
  console.log(`✓ ${fmt} → ${out} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}

try {
  await Promise.all(formats.map((f) => (stills ? renderStills(f) : renderVideo(f))));
} finally {
  await browser.close();
  server.close();
}
