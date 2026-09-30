#!/usr/bin/env node
// Build a single, offline, self-contained presenter HTML for an event: the promo scenes as
// keyboard-driven beats over a never-stopping music loop.
//   node live.mjs <event-folder> [--fresh] [--theme light] [--adjust]
// Output: <event>/out/<slug>-live[-light][-contrast].html
// Fonts, images, GSAP and audio are all inlined. --adjust adds live contrast/brightness keys.
import { readFile, writeFile, access } from "node:fs/promises";
import { spawnSync, execFileSync } from "node:child_process";
import { join, resolve, dirname, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const eventArg = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--theme");
const theme = args.includes("--theme") ? args[args.indexOf("--theme") + 1] : "dark";
const adjust = args.includes("--adjust");
if (!eventArg) {
  console.error("usage: node live.mjs <event-folder> [--fresh] [--theme light]");
  process.exit(1);
}
const eventDir = resolve(ROOT, eventArg);
const outDir = join(eventDir, "out");
const liveDir = join(outDir, "live");
const ev = JSON.parse(await readFile(join(eventDir, "event.json"), "utf8"));
const slug = ev.slug || basename(eventDir);
const exists = (p) => access(p).then(() => true, () => false);

// ---------- audio stems (music/synth.py --live), loudness-matched to the rendered videos
if (args.includes("--fresh") || !(await exists(join(liveDir, "live.json")))) {
  console.log("♪ synthesizing live stems…");
  execFileSync("uv", ["run", "--script", join(ROOT, "music", "synth.py"), eventDir, "--live"], { stdio: "inherit" });
}
const meta = JSON.parse(await readFile(join(liveDir, "live.json"), "utf8"));
// Same gain render.mjs' loudnorm (linear, -14 LUFS, -1.5 dBTP) applies to the full mix.
const probe = spawnSync("ffmpeg", ["-hide_banner", "-i", join(outDir, "music.wav"), "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], { encoding: "utf8" });
const m = JSON.parse(probe.stderr.slice(probe.stderr.lastIndexOf("{"), probe.stderr.lastIndexOf("}") + 1));
const gainDb = Math.min(-14 - +m.input_i, -1.5 - +m.input_tp);
console.log(`♪ loudness gain ${gainDb.toFixed(2)} dB`);
const flac = (name) =>
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", join(liveDir, name), "-af", `volume=${gainDb.toFixed(3)}dB`, "-c:a", "flac", "-compression_level", "8", "-f", "flac", "-"], { maxBuffer: 1 << 30 }).toString("base64");
const audio = { intro: flac("intro.wav"), loop: flac("loop.wav"), sfx: flac("sfx.wav") };

// ---------- stage document (inline everything)
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const dataURI = async (file) => `data:${MIME[extname(file).toLowerCase()]};base64,${(await readFile(file)).toString("base64")}`;
async function inlineAssets(v) {
  if (typeof v === "string") {
    const f = resolve(eventDir, v);
    return MIME[extname(v).toLowerCase()] && (await exists(f)) ? dataURI(f) : v;
  }
  if (Array.isArray(v)) return Promise.all(v.map(inlineAssets));
  if (v && typeof v === "object") return Object.fromEntries(await Promise.all(Object.entries(v).map(async ([k, x]) => [k, await inlineAssets(x)])));
  return v;
}
const evInline = await inlineAssets(ev);

let css = await readFile(join(ROOT, "src", "style.css"), "utf8");
for (const [, rel] of [...css.matchAll(/url\("(\.\.\/fonts\/[^"]+)"\)/g)]) css = css.replace(rel, await dataURI(join(ROOT, "src", rel)));
const index = await readFile(join(ROOT, "src", "index.html"), "utf8");
const body = index.slice(index.indexOf("<body>") + 6, index.indexOf("<script"));
const js = (s) => s.replace(/<\/script/gi, "<\\/script");
const stage = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${css}</style></head><body>${body}
<script>${js(await readFile(join(ROOT, "node_modules", "gsap", "dist", "gsap.min.js"), "utf8"))}</script>
<script>window.__THEME = ${JSON.stringify(theme)};</script>
<script>window.__EVENT = ${js(JSON.stringify(evInline))};</script>
<script>${js(await readFile(join(ROOT, "src", "timeline.js"), "utf8"))}</script>
</body></html>`;

// ---------- presenter page
const help = [
  ["Space · → · PageDown · clicker", "next beat"],
  ["← · PageUp", "previous beat"],
  ["F", "fullscreen"],
  ["M", "music on / off (fades)"],
  ["+ / −", "volume"],
  ["B · .", "black screen"],
  ...(adjust ? [["] / [", "contrast up / down"], ["' / ;", "brightness up / down"], ["0", "reset picture"]] : []),
  ["Home", "back to the start"],
  ["? · H", "this help"],
];
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${ev.series} · ${ev.city} · live</title>
<style>
  html, body { margin: 0; height: 100%; background: ${theme === "light" ? "#dfe6f2" : "#000"}; overflow: hidden; font: 14px/1.4 system-ui, sans-serif; color: #cfd8ee; }
  body.nocursor, body.nocursor * { cursor: none; }
  #stage { position: absolute; left: 50%; top: 50%; width: 1920px; height: 1080px; border: 0; transform-origin: 50% 50%; pointer-events: none; background: ${theme === "light" ? "#f1f4fa" : "#0b1533"}; }
  #black { position: fixed; inset: 0; background: #000; opacity: 0; pointer-events: none; transition: opacity .6s; }
  #black.on { opacity: 1; }
  #hint { position: fixed; left: 50%; bottom: 2.5vh; transform: translateX(-50%); padding: 6px 14px; border-radius: 999px; background: rgba(0,0,0,.45); opacity: .75; transition: opacity .6s; white-space: nowrap; }
  #hint.gone { opacity: 0; }
  #info { position: fixed; right: 2vw; top: 2vh; padding: 6px 12px; border-radius: 8px; background: rgba(0,0,0,.6); opacity: 0; transition: opacity .3s; }
  #info.on { opacity: 1; }
  #help { position: fixed; left: 50%; top: 50%; transform: translate(-50%,-50%); background: rgba(8,14,34,.94); border: 1px solid #2a3a66; border-radius: 12px; padding: 18px 24px; display: none; }
  #help.on { display: block; }
  #help td { padding: 3px 12px; } #help td:first-child { color: #ffb36b; font-family: ui-monospace, monospace; text-align: right; }
</style>
</head>
<body>
<iframe id="stage" title="stage"></iframe>
<div id="black"></div>
<div id="hint">Loading…</div>
<div id="info"></div>
<div id="help"><table>${help.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("")}</table></div>
<script>window.__LIVE = ${js(JSON.stringify({ meta, audio, stage, adjust }))};</script>
<script>${js(await readFile(join(ROOT, "src", "live.js"), "utf8"))}</script>
</body>
</html>`;
const outFile = join(outDir, `${slug}-live${theme === "dark" ? "" : "-" + theme}${adjust ? "-contrast" : ""}.html`);
await writeFile(outFile, html);
console.log(`✓ ${outFile} (${(html.length / 1e6).toFixed(1)} MB, ${meta.beats.length} beats)`);
