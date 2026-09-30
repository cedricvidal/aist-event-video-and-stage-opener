/* global gsap */
// Builds the promo scenes from <event>/event.json and exposes a deterministic,
// seekable timeline: window.seek(t) renders the exact frame for time t (seconds).
(() => {
  const params = new URLSearchParams(location.search);
  const ASPECT = params.get("format") || "16x9";
  // 4:5 reuses the square layout; style.css tunes it via data-aspect="4x5".
  const FORMAT = ASPECT === "4x5" ? "1x1" : ASPECT;
  const EVENT = params.get("event");
  const PLAY = params.has("play");
  document.documentElement.dataset.theme = window.__THEME || params.get("theme") || "dark";
  document.documentElement.dataset.format = FORMAT;
  document.documentElement.dataset.aspect = ASPECT;
  const base = `../${EVENT}/`;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const pad2 = (n) => String(n).padStart(2, "0");

  function mulberry32(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Per-character spans so typewriter reveals never reflow the layout.
  function typeHTML(text) {
    return text
      .split(/(\s+)/)
      .map((tok) => (/^\s+$/.test(tok) ? tok.replace(/./g, '<span class="ch"> </span>') : `<span style="white-space:nowrap">${[...tok].map((c) => `<span class="ch">${esc(c)}</span>`).join("")}</span>`))
      .join("");
  }

  const W = innerWidth, H = innerHeight, U = Math.min(W, H) / 100;

  window.__ready = (async () => {
    // The live presenter build (live.mjs) inlines the event, with assets as data: URIs.
    const ev = window.__EVENT || await (await fetch(base + "event.json")).json();
    build(ev);
    await document.fonts.ready;
    await Promise.all($$("img").map((img) => img.decode().catch(() => {})));
    const tl = buildTimeline(ev);
    const bg = makeBackground(ev);
    window.__duration = ev.timing.duration;
    window.__fps = ev.timing.fps;
    window.__poster = ev.poster_time;
    window.seek = (t) => { tl.seek(t, false); bg(t); };
    window.__tl = tl;
    window.__bg = bg;
    window.seek(0);
    if (PLAY) {
      const t0 = performance.now();
      gsap.ticker.add(() => window.seek(((performance.now() - t0) / 1000) % ev.timing.duration));
    }
    return true;
  })();

  // ---------------------------------------------------------------- DOM
  function build(ev) {
    const world = $("#world");
    const sp = ev.speakers;
    const img = (p) => (p.startsWith("data:") ? p : base + p);

    const open = `
      <section class="scene s-open" id="sc-open">
        <div class="term panel">
          <div class="term-bar"><i></i><i></i><i></i><span>agent@ai-show-and-tell: ~/${esc(ev.city.toLowerCase().replace(/\s+/g, "-"))}</span></div>
          <div class="term-body">
            ${ev.open.lines.map((l, i) => `<div class="term-line ${i ? "dim" : ""}"><span class="p">${esc(l.prompt)}</span><span class="t">${typeHTML(l.text)}</span><span class="caret"></span></div>`).join("")}
          </div>
        </div>
        <div class="stamp">${esc(ev.open.stamp)}</div>
      </section>`;

    const words = (s) => s.split(" ").map((w) => `<span class="w">${esc(w)}</span>`).join(" ");
    const title = `
      <section class="scene s-title" id="sc-title">
        <div class="shock"></div>
        <svg class="gavel" viewBox="0 0 100 100">
          <g>
            <rect x="46" y="40" width="9" height="56" rx="4" fill="#c98a55" transform="rotate(-45 50 68)"/>
            <rect x="18" y="12" width="46" height="24" rx="6" fill="#ef7d37" transform="rotate(-45 41 24)"/>
            <rect x="24" y="14" width="6" height="20" rx="2" fill="#ffb36b" transform="rotate(-45 41 24)"/>
            <rect x="52" y="14" width="6" height="20" rx="2" fill="#b35a22" transform="rotate(-45 41 24)"/>
          </g>
        </svg>
        <div class="title-line l1">${words(ev.title_lines[0])}</div>
        <div class="title-line l2">${words(ev.title_lines[1])}</div>
        <div class="title-sub">${esc(ev.series)} · ${esc(ev.city)}</div>
      </section>`;

    const brand = `
      <section class="scene s-brand" id="sc-brand">
        <div class="cover-wrap"><div class="ring halo"></div><div class="ring spin"></div><img src="${img(ev.cover)}" alt=""></div>
        <div class="brand-text">
          <div class="kicker">${esc(ev.series)} · ${esc(ev.city)}</div>
          <h2>${esc(ev.title_lines[0])}<br><span class="grad-text">${esc(ev.title_lines[1])}</span></h2>
          <div class="when"><span class="chip">📅 ${esc(ev.date_short)}</span><span class="chip">🕕 ${esc(ev.time)}</span><span class="chip">📍 ${esc(ev.venue)}</span></div>
          <div class="where">${esc(ev.address)}</div>
          <div class="next">${esc(ev.brand_next || "Meet the speakers →")}</div>
        </div>
      </section>`;

    const motifHTML = (m) => {
      if (m.type === "log")
        return `<div class="m-log panel">${m.lines.map((l) => `<div class="row ${l.ok ? "" : "bad"}"><span class="verb">${esc(l.verb)}</span><span class="what">${esc(l.what)}</span><span class="meta">${esc(l.meta)}</span><span class="ok">${l.ok ? "✓" : "✗"}</span></div>`).join("")}</div>`;
      if (m.type === "frontier")
        return `<div class="m-frontier">
          <div class="codebox panel">
            <div class="struck">${esc(m.struck)}<span class="bar"></span></div>
            <div class="code"><span class="t">${typeHTML(m.code)}</span></div>
            <div class="stat">★ ${esc(m.stat)}</div>
          </div>
          <svg class="chart panel" viewBox="0 0 340 200">
            <text x="18" y="24" fill="#a9b6d3" font-family="JetBrains Mono" font-size="12">cost ↓</text>
            <text x="250" y="190" fill="#a9b6d3" font-family="JetBrains Mono" font-size="12">latency ↓</text>
            <line x1="40" y1="30" x2="40" y2="170" stroke="#3a4f80" stroke-width="2"/>
            <line x1="40" y1="170" x2="320" y2="170" stroke="#3a4f80" stroke-width="2"/>
            ${[[250, 60], [280, 90], [210, 75], [300, 50], [230, 110], [270, 130]].map(([x, y]) => `<circle class="old" cx="${x}" cy="${y}" r="6" fill="#7cc4ff" opacity=".55"/>`).join("")}
            <path class="curve" d="M60 60 C 90 140, 150 158, 300 160" fill="none" stroke="#ef7d37" stroke-width="4" stroke-linecap="round"/>
            <circle class="new" cx="92" cy="128" r="10" fill="#ef7d37"/>
            <circle class="newring" cx="92" cy="128" r="10" fill="none" stroke="#ef7d37" stroke-width="3"/>
            <text class="lbl" x="108" y="112" fill="#fafafa" font-family="Space Grotesk" font-weight="700" font-size="18">${esc(m.label)}</text>
          </svg>
        </div>`;
      if (m.type === "vms")
        return `<div class="m-vms"><div class="grid panel" style="padding:2vmin">${Array.from({ length: m.count }, () => '<div class="vm"><div class="on"></div></div>').join("")}</div>
          <div class="big"><div class="v grad-text">${esc(m.stat)}</div><div class="l">${esc(m.stat_label)}</div><div class="l zz">standby → awake</div></div></div>`;
      if (m.type === "counters")
        return `<div class="m-counters">${m.items.map((c) => `<div class="ctr panel"><div class="v grad-text" data-to="${c.value}">0</div><div class="l">${esc(c.label)}</div></div>`).join("")}</div>`;
      if (m.type === "panel")
        return `<div class="m-panel">
          <div class="pn-faces">${sp.map((x) => `<div class="pn-f"><div class="ring"></div><img src="${img(x.photo)}" alt=""></div>`).join("")}</div>
          <div class="pn-live panel"><span class="dot"></span><b>${esc(m.live)}</b><span>${esc(m.detail)}</span></div>
        </div>`;
      if (m.type === "scope")
        return `<div class="m-scope panel">
          <div class="sc-row sc-head"><span class="brand"><svg class="sc-logo" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg><b>scope</b></span>${m.agents.map((a) => `<span class="ag">${esc(a)}</span>`).join("")}</div>
          ${m.rows.map((r) => `<div class="sc-row ${r.gap ? "gap" : ""}"><span class="lb">${esc(r.label)}</span>${r.marks.map((k) => `<span class="mk ${k ? "ok" : "no"}">${k ? "✓" : "✕"}</span>`).join("")}</div>`).join("")}
          <div class="sc-verdict"><span class="sc-stamp">${esc(m.stamp)}</span><span class="vt">${esc(m.verdict)} <b>${esc(m.verdict_strong)}</b></span></div>
        </div>`;
      return "";
    };

    const personHTML = (s, id, idx) => `
      <section class="scene s-speaker" id="sc-${id}">
        <div class="photo-wrap">
          <div class="ring halo"></div><div class="ring spin"></div>
          <div class="photo"><img src="${img(s.photo)}" alt=""></div>
          <div class="idx">${esc(idx)}</div>
          <div class="co">${esc(s.company)}</div>
        </div>
        <div class="sp-text">
          <div class="sp-head">
            <div class="kicker sp-label">${esc(s.label)}</div>
            <div class="sp-name" style="overflow:hidden;padding-bottom:.08em"><div class="in">${esc(s.name)}</div></div>
            <div class="sp-role">${esc(s.role)} @ <b>${esc(s.company)}</b></div>
          </div>
          <div class="sp-body">
            <div class="sp-talk"><span class="q">“</span>${typeHTML(s.talk)}<span class="q q2">”</span></div>
            <div class="sp-hook">${esc(s.hook)}</div>
            <div class="motif">${motifHTML(s.motif)}</div>
          </div>
        </div>
      </section>`;
    const speakers = sp.map((s, i) => personHTML(s, `speaker-${i}`, pad2(i + 1))).join("");
    const host = ev.host ? personHTML(ev.host, "host", ev.host.badge || "★") : "";

    const lineup = `
      <section class="scene s-lineup" id="sc-lineup">
        <div class="kicker">${esc(ev.date_short)} · ${esc(ev.venue)}</div>
        <div class="lineup-title">${sp.length} builders. <span class="grad-text">One night.</span></div>
        <div class="faces">${sp.map((s) => `<div class="face"><div class="pic"><div class="ring"></div><img src="${img(s.photo)}" alt=""></div><div class="n">${esc(s.name)}</div><div class="c">${esc(s.company)}</div></div>`).join("")}</div>
        <div class="extras">${ev.extras.map((x) => `<span class="chip">+ ${esc(x)}</span>`).join("")}</div>
      </section>`;

    const hasScene = (id) => ev.timing.scenes.some((s) => s.id === id);

    // Optional joint "Your hosts" scene (event.json `hosts`)
    const hosts = ev.hosts ? `
      <section class="scene s-hosts" id="sc-hosts">
        <div class="kicker">${esc(ev.series)} · ${esc(ev.city)}</div>
        <div class="hosts-title">Your <span class="grad-text">hosts</span></div>
        <div class="hosts">${ev.hosts.map((h, i) => `${i ? `<div class="amp grad-text">&amp;</div>` : ""}
          <div class="host">
            <div class="pic"><div class="ring"></div><img src="${img(h.photo)}" alt=""><div class="co">${esc(h.company)}</div></div>
            <div class="n">${esc(h.name)}</div>
            <div class="r">${esc(h.role)}</div>
            <div class="tag chip">${esc(h.label)}</div>
          </div>`).join("")}
        </div>
      </section>` : "";

    // Optional sponsor wall ending (event.json `sponsors`), used instead of the RSVP call to action
    const sponsors = ev.sponsors ? `
      <section class="scene s-sponsors" id="sc-sponsors">
        <div class="kicker">${esc(ev.series)} · ${esc(ev.city)}</div>
        <div class="sps-title">${esc(ev.sponsors.title)}</div>
        <div class="logos">
          ${ev.sponsors.qr
            ? `<div class="logo-row first"><div class="logo big"><img src="${img(ev.sponsors.logos[0])}" alt=""></div><div class="qr"><img src="${img(ev.sponsors.qr.image)}" alt=""><span>${esc(ev.sponsors.qr.caption)}</span></div></div>`
            : `<div class="logo big"><img src="${img(ev.sponsors.logos[0])}" alt=""></div>`}
          <div class="logo-row">${ev.sponsors.logos.slice(1).map((l) => `<div class="logo"><img src="${img(l)}" alt=""></div>`).join("")}</div>
        </div>
        ${ev.sponsors.outro ? `<div class="sps-outro grad-text">${esc(ev.sponsors.outro)}</div>` : ""}
      </section>` : "";

    const cta = !hasScene("cta") ? "" : `
      <section class="scene s-cta" id="sc-cta">
        <div class="kicker">${esc(ev.series)} · ${esc(ev.city)}</div>
        <div class="cta-big"><span class="l1">Space is limited.</span><span class="l2 grad-text">First come, first served.</span></div>
        <div class="cta-when"><b>${esc(ev.date_long)}</b> · ${esc(ev.time)} <span class="sep">·</span> ${esc(ev.venue)}, ${esc(ev.city)}</div>
        <div class="rsvp-btn"><div class="rsvp-pulse"></div><small>RSVP FREE</small>${esc(ev.rsvp_url)}</div>
        <div class="sponsor"><span>${esc(ev.sponsor.label)}</span><img src="${img(ev.sponsor.logo)}" alt=""></div>
      </section>`;

    world.innerHTML = open + title + brand + hosts + speakers + lineup + host + cta + sponsors;

    $("#hud").innerHTML = `
      <div class="hud-badge"><span class="dot"></span>${esc(ev.series)} · ${ev.city === "San Francisco" ? "SF" : esc(ev.city)}<span class="bd-date">&nbsp;· ${esc(ev.date_short)}</span></div>
      <div class="hud-count"><span class="n">01</span> / ${pad2(sp.length)}</div>
      <div class="hud-foot"><span><b>${esc(ev.date_short)}</b> · ${esc(ev.time)} · ${esc(ev.venue)}</span>${ev.rsvp_url ? `<span class="rsvp">RSVP → ${esc(ev.rsvp_url)}</span>` : ""}</div>
      <div class="hud-progress"></div>`;
  }

  // ----------------------------------------------------------- TIMELINE
  function buildTimeline(ev) {
    const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });
    const T = ev.timing;
    const cue = T.cues;
    const scene = (id) => T.scenes.find((s) => s.id === id);
    const el = (id) => $("#sc-" + id);

    // Scene visibility windows
    for (const s of T.scenes) {
      tl.set(el(s.id), { visibility: "visible" }, s.start);
      tl.set(el(s.id), { visibility: "hidden" }, s.start + s.dur);
    }
    tl.set({}, {}, T.duration); // pad timeline to full length

    const typer = (chars, at, dur, caret) => {
      const o = { n: 0 };
      tl.fromTo(o, { n: 0 }, {
        n: chars.length, duration: dur, ease: "none",
        onUpdate: () => {
          const k = Math.round(o.n);
          chars.forEach((c, i) => (c.style.opacity = i < k ? 1 : 0));
          if (caret) caret.style.opacity = 1;
        },
      }, at);
      chars.forEach((c) => (c.style.opacity = 0));
    };
    const shake = (at, a = 2.2 * U, target = "#world") =>
      tl.to(target, { keyframes: { x: [0, -a, a * 0.8, -a * 0.55, a * 0.3, 0], y: [0, a * 0.6, -a * 0.5, a * 0.3, -a * 0.1, 0] }, duration: 0.4, ease: "none" }, at);
    const flash = (at, o = 0.6, d = 0.35) => tl.fromTo("#flash", { opacity: o }, { opacity: 0, duration: d, ease: "power2.out", immediateRender: false }, at);

    // Full-screen skewed wipe, covering the frame exactly at time `at`.
    const skewOff = Math.tan((18 * Math.PI) / 180) * H;
    const wW = W + 2 * skewOff + 0.3 * W;
    gsap.set("#wipe .w1", { width: wW });
    gsap.set("#wipe .w2", { width: 0.22 * W });
    const L0 = -wW - skewOff - 20 - 0.22 * W, L1 = W + skewOff + 20;
    gsap.set("#wipe .w", { x: L0 });
    const wipe = (at) => {
      const d = 0.8;
      tl.fromTo("#wipe .w1", { x: L0 }, { x: L1, duration: d, ease: "power2.inOut", immediateRender: false }, at - d / 2);
      tl.fromTo("#wipe .w2", { x: L0 + wW }, { x: L1 + wW, duration: d, ease: "power2.inOut", immediateRender: false }, at - d / 2);
    };

    // HUD (the final scene is either the RSVP call to action or the sponsor wall)
    const endStart = (scene("cta") || scene("sponsors")).start;
    tl.fromTo(".hud-progress", { scaleX: 0 }, { scaleX: 1, duration: T.duration, ease: "none" }, 0);
    tl.fromTo([".hud-badge"], { autoAlpha: 0, y: -2 * U }, { autoAlpha: 1, y: 0, duration: 0.5 }, cue.drop + 0.4);
    tl.to([".hud-badge"], { autoAlpha: 0, duration: 0.3 }, endStart - 0.3);
    tl.fromTo([".hud-foot", ".hud-count"], { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 }, scene("speaker-0").start + 0.3);
    tl.to(".hud-count", { autoAlpha: 0, duration: 0.2 }, scene("lineup").start - 0.2);
    tl.to(".hud-foot", { autoAlpha: 0, duration: 0.3 }, endStart - 0.3);

    // ---- OPEN
    {
      const s = el("open"), t0 = scene("open").start;
      const lines = $$(".term-line", s);
      const carets = $$(".caret", s);
      carets.forEach((c) => (c.style.opacity = 0));
      tl.fromTo($(".term", s), { autoAlpha: 0, scale: 0.9, y: 4 * U }, { autoAlpha: 1, scale: 1, y: 0, duration: 0.5 }, t0);
      const starts = [t0 + 0.35, t0 + 1.4, t0 + 2.15], durs = [0.9, 0.6, 0.35];
      lines.forEach((ln, i) => {
        tl.fromTo(ln, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01 }, starts[i]);
        typer($$(".ch", ln), starts[i], durs[i]);
        tl.fromTo(carets[i], { opacity: 0 }, { opacity: 1, duration: 0.01 }, starts[i]);
        if (i < lines.length - 1) tl.to(carets[i], { opacity: 0, duration: 0.01 }, starts[i + 1]);
      });
      // blinking caret on the last line
      for (let k = 0; k < 4; k++) tl.to(carets[2], { opacity: k % 2 ? 1 : 0, duration: 0.01 }, starts[2] + durs[2] + 0.1 + k * 0.12);
      const stamp = $(".stamp", s);
      tl.fromTo(stamp, { xPercent: -50, yPercent: -50, scale: 2.8, rotation: -18, autoAlpha: 0 }, { scale: 1, rotation: -8, autoAlpha: 1, duration: 0.16, ease: "power4.in" }, cue.denied - 0.16);
      tl.to($(".term", s), { borderColor: "rgba(255,77,94,.8)", boxShadow: "0 0 8vmin rgba(255,77,94,.35)", duration: 0.1 }, cue.denied);
      tl.to(stamp, { keyframes: { textShadow: ["-0.8vmin 0 #00e5ff, 0.8vmin 0 #ff2bd6", "0 0 4vmin rgba(255,77,94,.6)", "1vmin 0 #00e5ff, -1vmin 0 #ff2bd6", "0 0 4vmin rgba(255,77,94,.6)"] }, duration: 0.5, ease: "none" }, cue.denied);
      flash(cue.denied, 0.35, 0.3);
      shake(cue.denied, 2.6 * U);
      // glitch-out
      tl.to(s, { keyframes: { x: [0, 3 * U, -5 * U, 8 * U], skewX: [0, 6, -10, 20], autoAlpha: [1, 0.8, 1, 0] }, duration: 0.4, ease: "none" }, t0 + 3.6);
    }

    // ---- TITLE
    {
      const s = el("title"), t0 = scene("title").start;
      const w1 = $$(".l1 .w", s), l2 = $(".l2", s);
      w1.forEach((w, i) => tl.fromTo(w, { autoAlpha: 0, scale: 1.9, filter: "blur(2vmin)" }, { autoAlpha: 1, scale: 1, filter: "blur(0vmin)", duration: 0.3, ease: "power4.out" }, cue.slam1 + i * 0.25));
      tl.fromTo(l2, { autoAlpha: 0, scale: 3.2 }, { autoAlpha: 1, scale: 1, duration: 0.2, ease: "power4.in" }, cue.gavel - 0.2);
      const gavel = $(".gavel", s);
      tl.fromTo(gavel, { rotation: -75, autoAlpha: 0 }, { rotation: 8, autoAlpha: 1, duration: 0.28, ease: "power4.in" }, cue.gavel - 0.28);
      tl.to(gavel, { rotation: -14, duration: 0.25, ease: "power2.out" }, cue.gavel);
      tl.to(gavel, { rotation: 0, duration: 0.5, ease: "bounce.out" }, cue.gavel + 0.25);
      tl.fromTo($(".shock", s), { scale: 0.2, autoAlpha: 1 }, { scale: 4, autoAlpha: 0, duration: 0.7, ease: "power2.out", immediateRender: false }, cue.gavel);
      flash(cue.gavel, 0.7, 0.45);
      shake(cue.gavel, 3 * U);
      tl.fromTo($(".title-sub", s), { autoAlpha: 0, y: 2 * U, letterSpacing: "0.6em" }, { autoAlpha: 1, y: 0, letterSpacing: "0.3em", duration: 0.8 }, cue.gavel + 0.4);
      tl.to(s, { scale: 0.85, autoAlpha: 0, filter: "blur(1.5vmin)", duration: 0.35, ease: "power2.in" }, t0 + 3.65);
    }

    // ---- BRAND
    {
      const s = el("brand"), t0 = scene("brand").start;
      flash(t0, 0.8, 0.5);
      tl.fromTo($(".cover-wrap", s), { scale: 0, rotation: -160 }, { scale: 1, rotation: 0, duration: 1, ease: "back.out(1.5)" }, t0);
      tl.fromTo($$(".ring", s), { rotation: 0 }, { rotation: 240, duration: 4, ease: "none" }, t0);
      const kids = [...$(".brand-text", s).children];
      const vertical = FORMAT !== "16x9";
      tl.fromTo(kids.slice(0, -1), { autoAlpha: 0, x: vertical ? 0 : 6 * U, y: vertical ? 3 * U : 0 }, { autoAlpha: 1, x: 0, y: 0, duration: 0.6, stagger: 0.14 }, t0 + 0.35);
      tl.fromTo(kids.at(-1), { autoAlpha: 0, x: -2 * U }, { autoAlpha: 1, x: 0, duration: 0.5 }, t0 + 2.4);
      tl.to(kids.at(-1), { x: 1.5 * U, duration: 0.25, yoyo: true, repeat: 3, ease: "sine.inOut" }, t0 + 2.9);
    }

    // ---- HOSTS (optional joint intro)
    if (ev.hosts) {
      const s = el("hosts"), sc = scene("hosts"), t0 = sc.start;
      wipe(t0);
      const cards = $$(".host", s);
      tl.fromTo([$(".kicker", s), $(".hosts-title", s)], { autoAlpha: 0, y: 3 * U }, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.1 }, t0 + 0.15);
      cards.forEach((c, i) => {
        const from = (i - (cards.length - 1) / 2) * -18 * U;
        const at = t0 + 0.35 + i * 0.2;
        tl.fromTo($(".pic", c), { autoAlpha: 0, scale: 0.5, x: from, rotation: i % 2 ? 12 : -12 }, { autoAlpha: 1, scale: 1, x: 0, rotation: 0, duration: 0.9, ease: "back.out(1.4)" }, at);
        tl.fromTo($("img", c), { scale: 1.25 }, { scale: 1.02, duration: sc.dur, ease: "power1.out" }, t0);
        tl.fromTo($(".ring", c), { rotation: i * 90 }, { rotation: i * 90 + 200, duration: sc.dur, ease: "none" }, t0);
        tl.fromTo($(".co", c), { scale: 0, rotation: 12 }, { scale: 1, rotation: 0, duration: 0.5, ease: "back.out(2.2)" }, at + 0.6);
        tl.fromTo([$(".n", c), $(".r", c)], { autoAlpha: 0, y: 3 * U }, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.12 }, at + 0.75);
        tl.fromTo($(".tag", c), { autoAlpha: 0, scale: 0.4 }, { autoAlpha: 1, scale: 1, duration: 0.5, ease: "back.out(2.5)" }, t0 + 1.9 + i * 0.5);
      });
      const amp = $(".amp", s);
      if (amp) tl.fromTo(amp, { autoAlpha: 0, scale: 2.4, rotation: -20 }, { autoAlpha: 1, scale: 1, rotation: 0, duration: 0.45, ease: "power4.out" }, t0 + 1.1);
    }

    // ---- SPEAKERS (+ optional host, same layout)
    const personIntro = (person, id, i, count) => {
      const s = el(id), sc = scene(id), t0 = sc.start;
      wipe(t0);
      if (count) tl.set(".hud-count .n", { textContent: count }, t0);
      const vertical = FORMAT === "9x16";
      tl.fromTo($(".photo-wrap", s), { scale: 0.55, autoAlpha: 0, rotation: -12 }, { scale: 1, autoAlpha: 1, rotation: 0, duration: 0.8, ease: "back.out(1.4)" }, t0 + 0.1);
      tl.fromTo($(".photo img", s), { scale: 1.25 }, { scale: 1.02, duration: sc.dur, ease: "power1.out" }, t0);
      tl.fromTo($$(".ring", s), { rotation: i * 40 }, { rotation: i * 40 + 200, duration: sc.dur, ease: "none" }, t0);
      tl.fromTo($(".idx", s), { scale: 0 }, { scale: 1, duration: 0.5, ease: "back.out(2.5)" }, t0 + 0.5);
      tl.fromTo($(".co", s), { scale: 0, rotation: 12 }, { scale: 1, rotation: 0, duration: 0.5, ease: "back.out(2.2)" }, t0 + 0.65);
      tl.fromTo($(".sp-label", s), { autoAlpha: 0, x: vertical ? 0 : -3 * U }, { autoAlpha: 1, x: 0, duration: 0.4 }, t0 + 0.2);
      tl.fromTo($(".sp-name .in", s), { yPercent: 110 }, { yPercent: 0, duration: 0.55, ease: "power4.out" }, t0 + 0.28);
      tl.fromTo($(".sp-role", s), { autoAlpha: 0, y: 2 * U }, { autoAlpha: 1, y: 0, duration: 0.45 }, t0 + 0.5);
      const talkChars = $$(".sp-talk .ch", s);
      const q = $$(".sp-talk .q", s);
      tl.fromTo(q[0], { autoAlpha: 0, scale: 2 }, { autoAlpha: 1, scale: 1, duration: 0.25 }, t0 + 0.8);
      const tdur = Math.min(1.5, talkChars.length / 42);
      typer(talkChars, t0 + 0.85, tdur);
      tl.fromTo(q[1], { autoAlpha: 0, scale: 2 }, { autoAlpha: 1, scale: 1, duration: 0.25 }, t0 + 0.85 + tdur);
      const hookAt = t0 + 0.95 + tdur;
      tl.fromTo($(".sp-hook", s), { autoAlpha: 0, y: 2 * U }, { autoAlpha: 1, y: 0, duration: 0.5 }, hookAt);
      motifTimeline(tl, typer, person.motif, $(".motif", s), hookAt + 0.35, t0 + sc.dur, cue);
      return { s, t0, sc };
    };
    ev.speakers.forEach((sp, i) => personIntro(sp, `speaker-${i}`, i, pad2(i + 1)));
    if (ev.host) {
      const { s, t0 } = personIntro(ev.host, "host", ev.speakers.length, null);
      tl.to(s, { scale: 1.12, autoAlpha: 0, filter: "blur(1.2vmin)", duration: 0.3, ease: "power2.in" }, t0 + 3.7);
    }

    // ---- LINEUP
    {
      const s = el("lineup"), t0 = scene("lineup").start;
      tl.fromTo([$(".kicker", s), $(".lineup-title", s)], { autoAlpha: 0, y: 3 * U }, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.1 }, t0 + 0.15);
      tl.fromTo($$(".face", s), { autoAlpha: 0, scale: 0.4, y: 4 * U }, { autoAlpha: 1, scale: 1, y: 0, duration: 0.6, stagger: 0.25, ease: "back.out(1.8)" }, t0 + 0.4);
      tl.fromTo($$(".face .ring", s), { rotation: 0 }, { rotation: 180, duration: 4, ease: "none" }, t0);
      tl.fromTo($$(".extras .chip", s), { autoAlpha: 0, y: 2 * U }, { autoAlpha: 1, y: 0, duration: 0.4, stagger: 0.18 }, t0 + 1.6);
      tl.to(s, { scale: 1.12, autoAlpha: 0, filter: "blur(1.2vmin)", duration: 0.3, ease: "power2.in" }, t0 + 3.7);
    }

    // ---- CTA
    if (scene("cta")) {
      const s = el("cta"), t0 = scene("cta").start;
      flash(cue.final_hit, 0.8, 0.5);
      shake(cue.final_hit, 1.6 * U);
      tl.fromTo($(".kicker", s), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 }, t0 + 0.1);
      tl.fromTo($(".cta-big .l1", s), { autoAlpha: 0, scale: 1.8 }, { autoAlpha: 1, scale: 1, duration: 0.35, ease: "power4.out" }, t0);
      tl.fromTo($(".cta-big .l2", s), { autoAlpha: 0, y: 4 * U }, { autoAlpha: 1, y: 0, duration: 0.5 }, t0 + 0.5);
      tl.fromTo($(".cta-when", s), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5 }, t0 + 1.0);
      const btn = $(".rsvp-btn", s);
      tl.fromTo(btn, { autoAlpha: 0, scale: 0.4 }, { autoAlpha: 1, scale: 1, duration: 0.6, ease: "back.out(2.2)" }, t0 + 1.5);
      for (let k = 0; k < 4; k++) {
        const at = t0 + 2 + k;
        tl.fromTo($(".rsvp-pulse", s), { scale: 1, opacity: 0.9 }, { scale: 1.35, opacity: 0, duration: 0.9, ease: "power2.out", immediateRender: false }, at);
        tl.fromTo(btn, { scale: 1.06 }, { scale: 1, duration: 0.4, ease: "power2.out", immediateRender: false }, at);
      }
      tl.fromTo($(".sponsor", s), { autoAlpha: 0, y: 2 * U }, { autoAlpha: 1, y: 0, duration: 0.5 }, t0 + 2.2);
    }

    // ---- SPONSORS (optional ending; `cue.sponsor_hits` is mirrored in music/synth.py)
    if (scene("sponsors")) {
      const s = el("sponsors"), t0 = scene("sponsors").start;
      flash(cue.final_hit, 0.8, 0.5);
      shake(cue.final_hit, 1.6 * U);
      tl.fromTo($(".kicker", s), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 }, t0 + 0.1);
      tl.fromTo($(".sps-title", s), { autoAlpha: 0, scale: 1.8 }, { autoAlpha: 1, scale: 1, duration: 0.35, ease: "power4.out" }, t0);
      const logos = $$(".logo", s);
      const hits = cue.sponsor_hits || logos.map((_, i) => t0 + 1 + i * 0.5);
      logos.forEach((l, i) => {
        const at = hits[i];
        tl.fromTo(l, { autoAlpha: 0, scale: 0.3, y: 4 * U }, { autoAlpha: 1, scale: 1, y: 0, duration: 0.18, ease: "power3.out" }, at - 0.12);
        tl.fromTo(l, { scale: 1.08 }, { scale: 1, duration: 0.5, ease: "elastic.out(1, 0.5)", immediateRender: false }, at + 0.06);
        flash(at, 0.18, 0.25);
      });
      tl.fromTo($$(".logo", s), { boxShadow: "0 0 0vmin rgba(239,125,55,0)" }, { boxShadow: "0 0 6vmin rgba(239,125,55,.35)", duration: 0.6, yoyo: true, repeat: 3, ease: "sine.inOut", immediateRender: false }, hits.at(-1) + 0.4);
      const qr = $(".qr", s);  // optional QR next to the first logo, pops in after the last logo lands
      if (qr) {
        tl.fromTo(qr, { autoAlpha: 0, scale: 0.4, rotation: 8 }, { autoAlpha: 1, scale: 1, rotation: 0, duration: 0.5, ease: "back.out(2)" }, hits.at(-1) + 0.5);
        flash(hits.at(-1) + 0.5, 0.12, 0.25);
      }
      const outro = $(".sps-outro", s);
      if (outro) {
        tl.fromTo(outro, { autoAlpha: 0, scale: 1.6, filter: "blur(1.5vmin)" }, { autoAlpha: 1, scale: 1, filter: "blur(0vmin)", duration: 0.4, ease: "power4.out" }, cue.end_hit - 0.1);
        flash(cue.end_hit, 0.5, 0.4);
        shake(cue.end_hit, 1.2 * U);
      }
    }
    return tl;
  }

  function motifTimeline(tl, typer, m, root, at, end, cue) {
    const U2 = 2 * U;
    const panel = root.firstElementChild;
    tl.fromTo(panel, { autoAlpha: 0, y: U2 }, { autoAlpha: 1, y: 0, duration: 0.4 }, at);
    if (m.type === "log") {
      const rows = $$(".row", root);
      rows.forEach((r, i) => {
        const a = at + 0.25 + i * 0.4;
        tl.fromTo(r, { autoAlpha: 0, x: -U2 }, { autoAlpha: 1, x: 0, duration: 0.25 }, a);
        tl.fromTo($(".ok", r), { scale: 0 }, { scale: 1, duration: 0.3, ease: "back.out(3)" }, a + 0.18);
        if (!m.lines[i].ok) {
          tl.to(r, { keyframes: { x: [0, -U, U, -U * 0.6, 0] }, duration: 0.3, ease: "none" }, a + 0.2);
          tl.to(panel, { borderColor: "rgba(255,77,94,.8)", duration: 0.15 }, a + 0.2);
        }
      });
    } else if (m.type === "frontier") {
      tl.fromTo($(".struck .bar", root), { scaleX: 0 }, { scaleX: 1, duration: 0.3, ease: "power2.inOut" }, at + 0.3);
      tl.to($(".struck", root), { opacity: 0.45, duration: 0.3 }, at + 0.5);
      typer($$(".code .ch", root), at + 0.5, 0.7);
      const chart = $(".chart", root), curve = $(".curve", chart);
      const len = curve.getTotalLength();
      tl.fromTo(chart, { autoAlpha: 0, scale: 0.9 }, { autoAlpha: 1, scale: 1, duration: 0.4 }, at + 0.15);
      tl.fromTo($$(".old", chart), { scale: 0, transformOrigin: "50% 50%" }, { scale: 1, duration: 0.3, stagger: 0.05, ease: "back.out(3)" }, at + 0.3);
      tl.fromTo(curve, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 0.8, ease: "power2.inOut" }, at + 0.7);
      tl.fromTo($(".new", chart), { scale: 0, transformOrigin: "50% 50%" }, { scale: 1, duration: 0.4, ease: "back.out(3)" }, at + 1.4);
      tl.fromTo($(".newring", chart), { scale: 1, opacity: 1, transformOrigin: "50% 50%" }, { scale: 3, opacity: 0, duration: 0.8 }, at + 1.5);
      tl.fromTo($(".lbl", chart), { autoAlpha: 0, x: -10 }, { autoAlpha: 1, x: 0, duration: 0.4 }, at + 1.55);
      tl.fromTo($(".stat", root), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 }, at + 1.3);
    } else if (m.type === "vms") {
      const ons = $$(".vm .on", root);
      const r = mulberry32(7);
      const order = ons.map((o) => [r(), o]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
      order.forEach((o, i) => tl.fromTo(o, { opacity: 0 }, { opacity: 1, duration: 0.12 }, at + 0.25 + i * 0.07));
      tl.to(ons, { opacity: 0.12, duration: 0.35, ease: "power2.in" }, at + 1.35);
      tl.to(ons, { opacity: 1, duration: 0.06, ease: "none" }, at + 1.9);
      const big = $(".big", root);
      tl.fromTo(big, { autoAlpha: 0, x: U2 }, { autoAlpha: 1, x: 0, duration: 0.4 }, at + 0.35);
      tl.fromTo($(".zz", root), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, at + 1.35);
      tl.fromTo($(".big .v", root), { scale: 1.3 }, { scale: 1, duration: 0.4, ease: "back.out(3)", immediateRender: false }, at + 1.9);
    } else if (m.type === "counters") {
      $$(".ctr", root).forEach((c, i) => {
        tl.fromTo(c, { autoAlpha: 0, y: U2, scale: 0.9 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.4, ease: "back.out(2)" }, at + i * 0.15);
        const v = $(".v", c), to = +v.dataset.to, o = { n: 0 };
        tl.fromTo(o, { n: 0 }, { n: to, duration: 1.3, ease: "power2.out", onUpdate: () => (v.textContent = Math.round(o.n)) }, at + 0.2 + i * 0.15);
        tl.fromTo(v, { scale: 1.25 }, { scale: 1, duration: 0.35, ease: "back.out(3)", immediateRender: false }, at + 1.5 + i * 0.15);
      });
    } else if (m.type === "panel") {
      // `cue.host_gavel` is mirrored in music/synth.py (gavel + impact)
      const hit = cue.host_gavel ?? at + 1.0;
      const faces = $$(".pn-f", root), live = $(".pn-live", root);
      tl.fromTo(faces, { autoAlpha: 0, scale: 0.3, y: U2 }, { autoAlpha: 1, scale: 1, y: 0, duration: 0.4, stagger: 0.12, ease: "back.out(2)" }, at);
      tl.fromTo($$(".pn-f .ring", root), { rotation: 0 }, { rotation: 240, duration: end - at, ease: "none" }, at);
      tl.fromTo(live, { autoAlpha: 0, scale: 2.2, rotation: -4 }, { autoAlpha: 1, scale: 1, rotation: -2, duration: 0.2, ease: "power4.in" }, hit - 0.2);
      tl.to(faces, { keyframes: { y: [0, -1.4 * U, 0] }, duration: 0.35, stagger: 0.05, ease: "power2.out" }, hit);
      tl.to(root, { keyframes: { x: [0, -0.7 * U, 0.6 * U, 0] }, duration: 0.25, ease: "none" }, hit);
      for (let k = 0; k < 3; k++) tl.fromTo($(".pn-live .dot", root), { opacity: 1 }, { opacity: 0.25, duration: 0.25, yoyo: true, repeat: 1, immediateRender: false }, hit + 0.3 + k * 0.5);
    } else if (m.type === "scope") {
      // `cue.gap` is mirrored in music/synth.py (buzzer on the gap, gavel on the stamp)
      const gapAt = cue.gap ?? at + 1.35;
      const logo = $(".sc-logo path", root), len = logo.getTotalLength();
      tl.fromTo(logo, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 0.6, ease: "power2.inOut" }, at + 0.1);
      tl.fromTo($(".sc-head .brand b", root), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, at + 0.15);
      tl.fromTo($$(".sc-head .ag", root), { autoAlpha: 0, y: -U }, { autoAlpha: 1, y: 0, duration: 0.3, stagger: 0.08 }, at + 0.2);
      const rows = $$(".sc-row:not(.sc-head)", root);
      const step = Math.min(0.32, (gapAt - 0.2 - (at + 0.35)) / rows.length);
      rows.forEach((r, i) => {
        const a = at + 0.35 + i * step;
        tl.fromTo($(".lb", r), { autoAlpha: 0, x: -U2 }, { autoAlpha: 1, x: 0, duration: 0.25 }, a);
        tl.fromTo($$(".mk", r), { autoAlpha: 0, scale: 0 }, { autoAlpha: 1, scale: 1, duration: 0.25, stagger: 0.06, ease: "back.out(3)" }, a + 0.08);
        if (r.classList.contains("gap")) {
          tl.to(r, { backgroundColor: "rgba(255,77,94,.16)", borderColor: "rgba(255,77,94,.75)", duration: 0.15 }, gapAt);
          tl.to(r, { keyframes: { x: [0, -U, U, -U * 0.6, U * 0.3, 0] }, duration: 0.35, ease: "none" }, gapAt);
          tl.to($(".lb", r), { color: "#ff4d5e", duration: 0.15 }, gapAt);
          tl.to(panel, { borderColor: "rgba(255,77,94,.8)", duration: 0.15 }, gapAt);
        }
      });
      const stamp = $(".sc-stamp", root);
      tl.fromTo(stamp, { autoAlpha: 0, scale: 2.6, rotation: 6 }, { autoAlpha: 1, scale: 1, rotation: -3, duration: 0.22, ease: "power4.in" }, gapAt + 0.15 - 0.22);
      tl.to(root, { keyframes: { x: [0, -0.6 * U, 0.5 * U, 0] }, duration: 0.25, ease: "none" }, gapAt + 0.15);
      tl.fromTo($(".sc-verdict .vt", root), { autoAlpha: 0, x: -U }, { autoAlpha: 1, x: 0, duration: 0.4 }, gapAt + 0.5);
      tl.fromTo($(".sc-verdict b", root), { scale: 1.3 }, { scale: 1, duration: 0.35, ease: "back.out(3)", immediateRender: false }, gapAt + 0.85);
    }
    // gentle hold drift so nothing looks frozen before the wipe
    tl.to(root, { y: -0.6 * U, duration: Math.max(0.1, end - at - 2), ease: "sine.inOut" }, at + 2);
  }

  // --------------------------------------------------------- BACKGROUND
  function makeBackground(ev) {
    const c = $("#bg"), g = c.getContext("2d");
    c.width = W; c.height = H;
    const grain = $("#grain"), gg = grain.getContext("2d");
    grain.width = Math.ceil(W / 2); grain.height = Math.ceil(H / 2);
    const r = mulberry32(42);
    const tiles = Array.from({ length: 4 }, () => {
      const t = document.createElement("canvas"); t.width = t.height = 256;
      const x = t.getContext("2d"), d = x.createImageData(256, 256);
      for (let i = 0; i < d.data.length; i += 4) { const v = r() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
      x.putImageData(d, 0, 0); return t;
    });
    const stars = Array.from({ length: 140 }, () => ({ x: r(), y: r() * 0.75, s: 0.6 + r() * 1.8, p: r() * 6.28, v: 0.004 + r() * 0.012 }));
    const g1 = $(".glow.g1"), g2 = $(".glow.g2");
    const bpm = ev.timing.bpm, beat = 60 / bpm, drop = ev.timing.cues.drop;
    const horizon = FORMAT === "9x16" ? 0.68 : FORMAT === "1x1" ? 0.64 : 0.62;
    const LIGHT = document.documentElement.dataset.theme === "light";
    const C = LIGHT
      ? { star: "#3a5a9a", starA: 0.28, floor: "47,111,181", floorA: 0.1, line: "226,103,31", lineA: 0.3, glowA: 0.45 }
      : { star: "#cfe6ff", starA: 0.55, floor: "53,124,197", floorA: 0.16, line: "239,125,55", lineA: 0.22, glowA: 0.55 };

    // `tp` is the music time driving the beat pulse (live mode passes it separately; < drop = no pulse).
    return (t, tp = t) => {
      g.clearRect(0, 0, W, H);
      const pulse = tp >= drop ? Math.exp(-((tp - drop) % beat) / 0.12) : 0;
      // stars
      for (const s of stars) {
        const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.3 + s.p));
        const x = ((s.x + t * s.v) % 1) * W, y = s.y * H * horizon;
        g.globalAlpha = C.starA * tw; g.fillStyle = C.star;
        g.beginPath(); g.arc(x, y, s.s * U * 0.12, 0, 6.283); g.fill();
      }
      // synthwave floor grid
      const hy = H * horizon, vx = W / 2;
      const grad = g.createLinearGradient(0, hy, 0, H);
      grad.addColorStop(0, `rgba(${C.floor},0)`);
      grad.addColorStop(1, `rgba(${C.floor},${C.floorA + 0.08 * pulse})`);
      g.globalAlpha = 1; g.fillStyle = grad; g.fillRect(0, hy, W, H - hy);
      g.lineWidth = Math.max(1, U * 0.18);
      const a = C.lineA + 0.25 * pulse;
      for (let i = -14; i <= 14; i++) {
        const xb = vx + i * W * 0.11;
        g.strokeStyle = `rgba(${C.line},${a * 0.8})`;
        g.beginPath(); g.moveTo(vx + i * W * 0.004, hy); g.lineTo(xb, H); g.stroke();
      }
      const speed = 0.5; // rows per second
      for (let k = 0; k < 14; k++) {
        const z = ((k + (t * speed) % 1) / 14);
        const yy = hy + (H - hy) * Math.pow(z, 2.2);
        g.strokeStyle = `rgba(${C.line},${a * Math.min(1, z * 2.2)})`;
        g.beginPath(); g.moveTo(0, yy); g.lineTo(W, yy); g.stroke();
      }
      // horizon glow line
      const hg = g.createLinearGradient(0, 0, W, 0);
      hg.addColorStop(0, "rgba(255,95,138,0)"); hg.addColorStop(0.5, `rgba(255,179,107,${C.glowA + 0.35 * pulse})`); hg.addColorStop(1, "rgba(255,95,138,0)");
      g.fillStyle = hg; g.fillRect(0, hy - U * 0.15, W, U * 0.3);
      // glows drift
      g1.style.transform = `translate(${Math.sin(t * 0.35) * 8 * U}px, ${Math.cos(t * 0.27) * 6 * U}px) scale(${1 + 0.05 * pulse})`;
      g2.style.transform = `translate(${Math.cos(t * 0.3) * 8 * U}px, ${Math.sin(t * 0.22) * 6 * U}px) scale(${1 + 0.06 * pulse})`;
      // film grain
      const tile = tiles[Math.floor(t * 30) % 4];
      gg.fillStyle = gg.createPattern(tile, "repeat");
      gg.fillRect(0, 0, grain.width, grain.height);
    };
  }
})();
