// Live presenter controller (bundled by live.mjs into a single offline HTML file).
// The stage renders in a fixed 1920x1080 iframe scaled to the window; this page owns the
// keyboard and a Web Audio clock. The groove loop never stops; each beat's animation starts
// on a music beat and plays its own SFX slot, then holds until the next key press.
(() => {
  const L = window.__LIVE;
  const M = L.meta, beats = M.beats, BEAT = 60 / M.bpm;
  const frame = document.getElementById("stage");
  const hint = document.getElementById("hint");
  const help = document.getElementById("help");
  const black = document.getElementById("black");

  const fit = () => {
    const s = Math.min(innerWidth / 1920, innerHeight / 1080);
    frame.style.transform = `translate(-50%, -50%) scale(${s})`;
  };
  addEventListener("resize", fit);
  fit();

  let tl = null, bg = null, ctx = null, buf = null, master = null, musicBus = null, sfxBus = null;
  let T0 = null;          // audio time of music time 0
  let cur = -1;           // beat on screen (-1 = pre-show)
  let seg = null;         // animation in flight
  let loop = null;        // { src, gain }
  let loopFadeAt = Infinity, musicMuted = false, volume = 1;
  const live = [];        // running one-shot sources (intro/SFX), stopped on reset

  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer;
  const readyAudio = (async () => {
    ctx = new AudioContext({ latencyHint: "playback" });
    const dec = async (k) => ctx.decodeAudioData(b64(L.audio[k]));
    buf = { intro: await dec("intro"), loop: await dec("loop"), sfx: await dec("sfx") };
    master = ctx.createGain();
    master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
  })();
  const readyStage = new Promise((res) => {
    frame.addEventListener("load", async () => {
      const w = frame.contentWindow;
      await w.__ready;
      tl = w.__tl; bg = w.__bg;
      res();
    }, { once: true });
  });
  frame.srcdoc = L.stage;
  let ready = false;
  Promise.all([readyAudio, readyStage]).then(() => {
    ready = true;
    hint.innerHTML = "<b>Space</b> / <b>→</b> start &nbsp;·&nbsp; <b>F</b> fullscreen &nbsp;·&nbsp; <b>?</b> help";
  }, (e) => { hint.textContent = "Failed to load: " + e; });

  // ------------------------------------------------------------ audio helpers
  const play = (buffer, at, offset, dur, bus) => {
    const src = ctx.createBufferSource(), gain = ctx.createGain();
    src.buffer = buffer;
    src.connect(gain).connect(bus);
    src.start(at, offset, dur);
    const h = { src, gain };
    live.push(h);
    src.onended = () => live.splice(live.indexOf(h), 1);
    return h;
  };
  const fadeOut = (h, at, d = 0.08) => {
    h.gain.gain.cancelScheduledValues(at);
    h.gain.gain.setValueAtTime(h.gain.gain.value, at);
    h.gain.gain.linearRampToValueAtTime(0, at + d);
    try { h.src.stop(at + d + 0.02); } catch {}
  };
  const musicTime = (at) => at - T0;
  // earliest audio time >= t that falls on a music beat
  const onBeat = (t) => T0 + Math.ceil((t - T0) / BEAT - 1e-6) * BEAT;

  function startLoop(at, fade) {
    const src = ctx.createBufferSource(), gain = ctx.createGain();
    src.buffer = buf.loop; src.loop = true;
    src.connect(gain).connect(musicBus);
    const P = M.loop_period;
    src.start(at, ((musicTime(at) % P) + P) % P);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(1, at + fade);
    loop = { src, gain };
    loopFadeAt = Infinity;
  }
  function loopTo(v, at, d) {
    const g = loop.gain.gain;
    g.cancelScheduledValues(at);
    g.setValueAtTime(g.value, at);
    g.linearRampToValueAtTime(v, at + d);
  }

  // ------------------------------------------------------------ beats
  function playBeat(i, when, lo) {
    const b = beats[i];
    const sfx = play(buf.sfx, when, b.sfx[0], b.sfx[1], sfxBus);
    seg = { i, when, from: b.from, lo: Math.max(b.from, lo), hi: b.hold, sfx };
    cur = i;
    if (i === beats.length - 1) {  // the ending: loop fades on the final hit, chord rings out
      loopFadeAt = when + (M.end_hit - b.from);
      loopTo(0, loopFadeAt, 1.2);
    }
  }

  function startShow() {
    ctx.resume();
    T0 = ctx.currentTime + 0.15;
    const intro = play(buf.intro, T0, 0, undefined, musicBus);
    intro.gain.gain.setValueAtTime(1, T0 + M.loop_at);
    intro.gain.gain.linearRampToValueAtTime(0, T0 + M.loop_at + 0.03);
    startLoop(T0 + M.loop_at, 0.03);
    playBeat(0, T0, 0);
    hint.classList.add("gone");
  }

  function next() {
    if (!ready) return;
    if (cur === -1) return startShow();
    if (seg || cur >= beats.length - 1) return; // let the current beat land
    const b = beats[cur + 1], lead = b.start - b.from;
    const when = onBeat(ctx.currentTime + 0.05 + lead) - lead;
    playBeat(cur + 1, when, beats[cur].hold);
  }

  function prev() {
    if (!ready || cur <= 0) return;
    const wasEnd = cur === beats.length - 1;
    if (seg) { fadeOut(seg.sfx, ctx.currentTime); seg = null; }
    cur -= 1;
    tl.seek(beats[cur].hold, false);
    if (wasEnd && !musicMuted) { loopTo(1, ctx.currentTime, 0.8); loopFadeAt = Infinity; }
  }

  function reset() {
    if (cur === -1) return;
    const now = ctx.currentTime;
    live.slice().forEach((h) => fadeOut(h, now, 0.6));
    if (loop) { fadeOut(loop, now, 0.6); loop = null; }
    seg = null; cur = -1; T0 = null; loopFadeAt = Infinity;
    tl.seek(0, false);
    hint.classList.remove("gone");
  }

  function toggleMusic() {
    if (!loop) return;
    musicMuted = !musicMuted;
    const now = ctx.currentTime;
    musicBus.gain.cancelScheduledValues(now);
    musicBus.gain.setValueAtTime(musicBus.gain.value, now);
    musicBus.gain.linearRampToValueAtTime(musicMuted ? 0 : 1, now + 1.2);
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1.5, v));
    if (master) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
    flashInfo(`Volume ${Math.round(volume * 100)}%`);
  }
  // Optional picture controls (`live.mjs --adjust`): CSS contrast/brightness on the whole stage,
  // remembered across reloads so a rehearsal calibration sticks.
  const PIC_KEY = "aist-live-picture";
  const pic = { c: 1, b: 1 };
  if (L.adjust) {
    try { Object.assign(pic, JSON.parse(localStorage.getItem(PIC_KEY)) || {}); } catch {}
  }
  function applyPic(show) {
    const r = (v) => Math.round(v * 100) / 100;
    pic.c = r(Math.max(0.5, Math.min(2, pic.c)));
    pic.b = r(Math.max(0.5, Math.min(1.6, pic.b)));
    frame.style.filter = pic.c === 1 && pic.b === 1 ? "" : `contrast(${pic.c}) brightness(${pic.b})`;
    try { localStorage.setItem(PIC_KEY, JSON.stringify(pic)); } catch {}
    if (show) flashInfo(`Contrast ${Math.round(pic.c * 100)}% · Brightness ${Math.round(pic.b * 100)}%`);
  }
  let infoTimer = 0;
  function flashInfo(text) {
    const el = document.getElementById("info");
    el.textContent = text; el.classList.add("on");
    clearTimeout(infoTimer); infoTimer = setTimeout(() => el.classList.remove("on"), 1200);
  }

  addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if ([" ", "ArrowRight", "PageDown", "Enter", "ArrowDown"].includes(k)) { e.preventDefault(); if (!e.repeat) next(); }
    else if (["ArrowLeft", "PageUp", "Backspace", "ArrowUp"].includes(k)) { e.preventDefault(); if (!e.repeat) prev(); }
    else if (k === "Home" || k === "Escape" && e.shiftKey) reset();
    else if (k === "f" || k === "F") document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    else if (k === "m" || k === "M") { toggleMusic(); flashInfo(musicMuted ? "Music off" : "Music on"); }
    else if (k === "+" || k === "=") setVolume(volume + 0.1);
    else if (k === "-" || k === "_") setVolume(volume - 0.1);
    else if (k === "b" || k === "B" || k === ".") black.classList.toggle("on");
    else if (k === "?" || k === "h" || k === "H") help.classList.toggle("on");
    else if (L.adjust && (k === "]" || k === "[")) { pic.c += k === "]" ? 0.05 : -0.05; applyPic(true); }
    else if (L.adjust && (k === "'" || k === ";")) { pic.b += k === "'" ? 0.05 : -0.05; applyPic(true); }
    else if (L.adjust && k === "0") { pic.c = 1; pic.b = 1; applyPic(true); }
  });
  addEventListener("click", () => { if (cur === -1) next(); });

  if (L.adjust) applyPic(false);

  let idle = 0;
  addEventListener("mousemove", () => {
    document.body.classList.remove("nocursor");
    clearTimeout(idle); idle = setTimeout(() => document.body.classList.add("nocursor"), 1500);
  });

  // ------------------------------------------------------------ frame loop
  const clock0 = performance.now();
  function frameLoop() {
    requestAnimationFrame(frameLoop);
    if (!tl) return;
    // what the audience hears now (sound systems add output latency)
    const now = ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
    if (seg) {
      const t = Math.min(seg.hi, Math.max(seg.lo, seg.from + (now - seg.when)));
      tl.seek(t, false);
      if (now - seg.when >= seg.hi - seg.from) seg = null;
    }
    const musicOn = T0 !== null && !musicMuted && now < loopFadeAt;
    bg((performance.now() - clock0) / 1000, musicOn ? musicTime(now) : -1);
  }
  requestAnimationFrame(frameLoop);

  // test hook
  window.__live = { next, prev, reset, state: () => ({ cur, animating: !!seg, t: tl && tl.time(), ctx: ctx && ctx.state, T0 }) };
})();
