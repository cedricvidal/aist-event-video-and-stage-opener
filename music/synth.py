# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy>=1.26", "scipy>=1.11"]
# ///
"""Synthesize an original 120 BPM synthwave music bed + SFX for a promo video.

Every hit is placed on the cue times from <event>/event.json so the audio lands
exactly on the animation. Output: <event>/out/music.wav (48 kHz stereo).

    uv run --script music/synth.py <event-folder>
"""

import json
import sys
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48_000
rng = np.random.default_rng(1234)


def lp(x, fc, order=2):
    return sosfilt(butter(order, fc, "low", fs=SR, output="sos"), x, axis=0)


def hp(x, fc, order=2):
    return sosfilt(butter(order, fc, "high", fs=SR, output="sos"), x, axis=0)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], "band", fs=SR, output="sos"), x, axis=0)


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def saw(f, n, maxf=9000.0, phase=0.0):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k in range(1, max(2, int(maxf / f)) + 1):
        out += np.sin(2 * np.pi * k * f * t + k * phase) / k
    return out * (2 / np.pi)


def square(f, n, maxf=6000.0):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k in range(1, max(2, int(maxf / f)) + 1, 2):
        out += np.sin(2 * np.pi * k * f * t) / k
    return out * (4 / np.pi)


def adsr(n, a=0.005, d=0.1, s=0.7, r=0.05):
    env = np.full(n, s)
    na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
    na = min(na, n)
    env[:na] = np.linspace(0, 1, na, endpoint=False)
    e = min(n, na + nd)
    env[na:e] = np.linspace(1, s, e - na, endpoint=False)
    if nr:
        env[max(0, n - nr):] *= np.linspace(1, 0, min(nr, n))
    return env


class Track:
    def __init__(self, dur):
        self.buf = np.zeros((int(dur * SR) + SR * 3, 2))
        self.events = []  # (t, sig, gain, pan), replayed per beat by --live

    def add(self, t, sig, gain=1.0, pan=0.0):
        self.events.append((t, sig, gain, pan))
        if sig.ndim == 1:
            left, right = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
            sig = np.stack([sig * left * 1.414, sig * right * 1.414], axis=1)
        i = int(round(t * SR))
        if i < 0:
            sig, i = sig[-i:], 0
        j = min(len(self.buf), i + len(sig))
        self.buf[i:j] += sig[: j - i] * gain


# ------------------------------------------------------------------ instruments
def kick():
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    f = 45 + 120 * np.exp(-t / 0.035)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.28)
    click = hp(rng.standard_normal(n), 3000) * np.exp(-t / 0.003) * 0.4
    return np.tanh(1.6 * (body + click)) * 0.9


def clap():
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    noise = bp(rng.standard_normal(n), 900, 4200)
    env = np.zeros(n)
    for k, off in enumerate((0, 0.011, 0.022)):
        m = t >= off
        env[m] += np.exp(-(t[m] - off) / (0.012 if k < 2 else 0.13))
    return noise * env * 0.6


def hat(open_=False):
    n = int((0.25 if open_ else 0.06) * SR)
    t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 7500) * np.exp(-t / (0.08 if open_ else 0.015)) * 0.35


def bass_note(f, dur):
    n = int(dur * SR)
    s = saw(f, n, 2500) + 0.6 * square(f / 2, n, 800)
    return lp(s, 900) * adsr(n, 0.004, 0.12, 0.55, 0.03) * 0.5


def pad_chord(freqs, dur, cutoff):
    n = int(dur * SR)
    left = np.zeros(n)
    right = np.zeros(n)
    for f in freqs:
        for det, side in ((-0.09, 0), (0.0, 2), (0.09, 1)):
            v = saw(f * 2 ** (det / 12), n, 5000, phase=rng.random() * 6.28)
            if side in (0, 2):
                left += v
            if side in (1, 2):
                right += v
    env = adsr(n, 0.25, 0.3, 0.85, 0.4)[:, None]
    st = np.stack([left, right], axis=1) / (len(freqs) * 2)
    return lp(st, cutoff) * env * 0.5


def pluck(f, dur=0.22):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = saw(f, n, 7000) * 0.6 + square(f, n, 5000) * 0.4
    return lp(s, 3200) * np.exp(-t / 0.09) * 0.32


def impact(size=1.0):
    n = int(2.2 * SR)
    t = np.arange(n) / SR
    f = 32 + 60 * np.exp(-t / 0.08)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (0.9 * size))
    crack = lp(rng.standard_normal(n), 5000) * np.exp(-t / 0.05)
    tail = lp(rng.standard_normal(n), 1800) * np.exp(-t / 0.5) * 0.25
    return np.tanh(2.2 * (sub + 0.6 * crack + tail)) * 0.8


def gavel():
    n = int(0.4 * SR)
    t = np.arange(n) / SR
    wood = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t / d) for f, a, d in ((190, 1.0, 0.07), (430, 0.7, 0.05), (960, 0.45, 0.03), (1880, 0.25, 0.02)))
    click = hp(rng.standard_normal(n), 2000) * np.exp(-t / 0.004)
    return np.tanh(1.8 * (wood + 0.6 * click)) * 0.9


def riser(dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = t / dur
    noise = hp(rng.standard_normal(n), 1500) * x**2.2
    f = 180 * 2 ** (x * 3)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR + 0.4 * np.sin(2 * np.pi * 6 * t)) * x**1.5 * 0.25
    return (noise * 0.35 + tone) * np.minimum(1, (1 - x) * 60)


def whoosh(dur=0.8):
    """Stereo noise sweep panned left→right, peaking in the middle (matches the wipe)."""
    n = int(dur * SR)
    x = np.linspace(0, 1, n)
    noise = rng.standard_normal(n)
    low, high = lp(noise, 900), hp(noise, 2500)
    bell = np.exp(-((x - 0.5) / 0.2) ** 2)
    mono = (low * (1 - x) + high * x * 0.7) * bell
    pan = x * 2 - 1
    return np.stack([mono * np.cos((pan + 1) * np.pi / 4), mono * np.sin((pan + 1) * np.pi / 4)], axis=1) * 0.9


def key_click():
    n = int(0.03 * SR)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * (2400 + rng.random() * 1400) * t) * np.exp(-t / 0.004)
    return (hp(rng.standard_normal(n), 3500) * np.exp(-t / 0.003) + 0.3 * tone) * (0.18 + 0.12 * rng.random())


def buzzer():
    parts = []
    for f in (155.6, 110.0):
        n = int(0.16 * SR)
        parts.append(np.tanh(2 * lp(square(f, n, 3000), 2200)) * adsr(n, 0.002, 0.02, 0.9, 0.02))
    return np.concatenate(parts) * 0.35


def glitch(dur=0.4):
    n = int(dur * SR)
    slice_n = int(0.03 * SR)
    src = square(90, slice_n, 4000) * 0.4 + rng.standard_normal(slice_n) * 0.3
    out = np.zeros(n)
    for i in range(0, n - slice_n, slice_n):
        if rng.random() < 0.75:
            out[i:i + slice_n] = np.round(src * (4 + rng.integers(0, 8))) / 8
    return lp(out, 6000) * 0.35


def reverb_ir(seconds=2.2, decay=0.55):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = rng.standard_normal((n, 2)) * np.exp(-t / decay)[:, None]
    ir = lp(ir, 6000)
    return ir / np.sqrt((ir**2).sum(axis=0))


# ------------------------------------------------------------------ arrangement
# Am – F – C – G (one chord per bar), midi numbers: (bass root, chord)
PROG = [
    (45, [57, 60, 64]),
    (41, [53, 57, 60]),
    (48, [55, 60, 64]),
    (43, [55, 59, 62]),
]


def main():
    ev_dir = Path(sys.argv[1])
    ev = json.loads((ev_dir / "event.json").read_text())
    T = ev["timing"]
    cue = T["cues"]
    dur = T["duration"]
    beat = 60 / T["bpm"]
    bar = beat * 4
    scene = {s["id"]: s for s in T["scenes"]}
    drop = cue["drop"]
    lineup = scene["lineup"]["start"]
    final = cue["final_hit"]

    drums, bass, pads, arps, fx, send = (Track(dur) for _ in range(6))
    fxsend = Track(dur)  # SFX reverb sends, kept apart so --live can split music from SFX

    # Am – F – C – G (one chord per bar), midi numbers
    prog = PROG
    n_bars = int(np.ceil(dur / bar))
    kicks = []

    extra = cue.get("groove_extra", [])  # optional [start, end) windows, e.g. a host scene

    def in_extra(t):
        return any(a <= t < b for a, b in extra)

    def groove_on(t):
        return (drop <= t < lineup + 2 * beat * 2) or in_extra(t) or (final <= t < cue["end_hit"])

    for b in range(n_bars):
        t0 = b * bar
        root, chord = prog[b % 4]
        # pad everywhere, darker before the drop
        cutoff = 700 if t0 < drop else (1600 if t0 >= lineup and t0 < final else 2600)
        pads.add(t0, pad_chord([midi(n) for n in chord], bar + 0.4, cutoff), 0.55 if t0 >= drop else 0.4)
        for k in range(16):
            t = t0 + k * beat / 4
            if t >= dur - 1.0:
                continue
            # drums
            if groove_on(t):
                if k % 4 == 0:
                    drums.add(t, kick(), 0.95)
                    kicks.append(t)
                if k % 8 == 4:
                    drums.add(t, clap(), 0.55)
                    send.add(t, clap(), 0.25)
                if k % 4 == 2:
                    drums.add(t, hat(open_=True), 0.3, pan=0.25)
                elif k % 2 == 1:
                    drums.add(t, hat(), 0.22, pan=-0.2)
            elif t < drop and k % 2 == 1 and t0 >= bar * 0:
                drums.add(t, hat(), 0.10 + 0.08 * (t / drop), pan=0.3)
            # bass: pumping 8ths once the groove is on, long notes in intro
            if groove_on(t) and k % 2 == 0:
                oct_ = 12 if k % 8 == 6 else 0
                bass.add(t, bass_note(midi(root - 12 + oct_ + 12), beat / 2 - 0.01), 0.9)
            elif t < drop and k == 0 and t0 >= 2 * bar:
                bass.add(t, bass_note(midi(root), bar - 0.05), 0.7)
            # arp during speakers + final
            if (scene["speaker-0"]["start"] <= t < lineup) or in_extra(t) or (final <= t < cue["end_hit"]):
                pattern = [0, 1, 2, 3, 2, 1, 0, 1]
                notes = [chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[0] + 24]
                f = midi(notes[pattern[k % 8]])
                p = pluck(f)
                arps.add(t, p, 0.55, pan=-0.35 if k % 2 else 0.35)
                arps.add(t + beat * 0.75, p, 0.22, pan=0.5 if k % 2 else -0.5)  # dotted-8th echo
                send.add(t, p, 0.35)

    # sidechain pump from the kick
    t_axis = np.arange(len(pads.buf)) / SR
    duck = np.ones(len(t_axis))
    for tk in kicks:
        i = int(tk * SR)
        seg = np.arange(0, int(0.3 * SR)) / SR
        j = min(len(duck), i + len(seg))
        duck[i:j] = np.minimum(duck[i:j], 1 - 0.65 * np.exp(-seg[: j - i] / 0.09))
    for tr in (pads, bass, arps):
        tr.buf *= duck[:, None]

    # ------------------------------------------------ SFX on animation cues
    lines = ev["open"]["lines"]
    starts, durs = [0.35, 1.4, 2.15], [0.9, 0.6, 0.35]  # mirrors src/timeline.js open scene
    for ln, s, d in zip(lines, starts, durs):
        n = len(ln["text"])
        for c in range(n):
            if ln["text"][c] != " " or rng.random() < 0.3:
                fx.add(s + d * c / n + rng.normal(0, 0.004), key_click(), 1.0, pan=rng.uniform(-0.2, 0.2))
    fx.add(cue["denied"], buzzer(), 0.9)
    fx.add(cue["denied"], impact(0.6), 0.55)
    fxsend.add(cue["denied"], impact(0.6), 0.2)
    fx.add(3.6, glitch(0.4), 0.8)
    for i in range(4):  # title words
        fx.add(cue["slam1"] + i * beat / 2, kick(), 0.8)
        fx.add(cue["slam1"] + i * beat / 2, clap(), 0.25)
    fx.add(cue["gavel"] - 1.0, riser(1.0), 0.6)
    fx.add(cue["gavel"], gavel(), 1.0)
    fx.add(cue["gavel"], impact(1.2), 0.8)
    fxsend.add(cue["gavel"], gavel(), 0.5)
    fx.add(drop - 1.5, riser(1.5), 0.7)
    for k in range(8):  # snare roll into the drop
        fx.add(drop - 1.0 + k * 0.125, clap(), 0.18 + 0.05 * k)
    fx.add(drop, impact(1.0), 0.8)
    fxsend.add(drop, impact(1.0), 0.25)
    for w in cue["wipes"]:
        fx.add(w - 0.4, whoosh(0.8), 0.55)
    if "gap" in cue:  # Scope "product gap" verdict; stamp lands 0.15s after (mirrors src/timeline.js)
        fx.add(cue["gap"], buzzer(), 0.45)
        fx.add(cue["gap"] + 0.15, gavel(), 0.8)
        fx.add(cue["gap"] + 0.15, impact(0.6), 0.4)
        fxsend.add(cue["gap"] + 0.15, gavel(), 0.35)
    if "host_gavel" in cue:  # host scene "live panel" stamp (mirrors src/timeline.js)
        fx.add(cue["host_gavel"], gavel(), 0.9)
        fx.add(cue["host_gavel"], impact(0.8), 0.5)
        fxsend.add(cue["host_gavel"], gavel(), 0.4)
    for t in cue.get("sponsor_hits", []):  # sponsor logos landing (mirrors src/timeline.js)
        fx.add(t, kick(), 0.7)
        fx.add(t, impact(0.7), 0.55)
        fxsend.add(t, impact(0.7), 0.25)
    fx.add(cue["riser_to"] - 2.0, riser(2.0), 0.75)
    for k in range(16):
        fx.add(final - 1.0 + k * 0.0625, clap(), 0.1 + 0.03 * k)
    fx.add(final, impact(1.3), 0.9)
    fxsend.add(final, impact(1.3), 0.3)
    fx.add(cue["end_hit"], impact(1.6), 0.75)
    fxsend.add(cue["end_hit"], impact(1.6), 0.4)
    # final chord ring-out
    pads.add(cue["end_hit"], pad_chord([midi(n) for n in (57, 60, 64, 69)], dur - cue["end_hit"] + 1, 1800), 0.6)

    # ------------------------------------------------ mix
    ir = reverb_ir()
    sends = send.buf + fxsend.buf
    wet = np.stack([fftconvolve(sends[:, c], ir[:, c])[: len(sends)] for c in range(2)], axis=1)
    mix = drums.buf * 0.9 + bass.buf * 0.8 + pads.buf * 0.55 + arps.buf * 0.5 + fx.buf * 0.85 + wet * 0.35
    mix = hp(mix, 28)
    mix = mix[: int(dur * SR)]
    fade = int(0.6 * SR)
    mix[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
    mix = np.tanh(mix * 1.1)
    k = 0.89 / np.abs(mix).max()
    mix *= k
    out = ev_dir / "out"
    out.mkdir(parents=True, exist_ok=True)
    wavfile.write(out / "music.wav", SR, (mix * 32767).astype(np.int16))
    print(f"wrote {out / 'music.wav'} ({dur:.1f}s)")

    if "--live" in sys.argv:
        stems = dict(drums=drums, bass=bass, pads=pads, arps=arps, send=send, fx=fx, fxsend=fxsend)
        live_stems(ev, out / "live", stems, ir, k)


# ------------------------------------------------------------------ live presenter stems
def live_beats(T):
    """Beats the presenter steps through (mirrored by src/live.js via live.json).

    The cold open (every scene up to the one holding the drop) is one beat; every later scene is
    its own beat. `from` is where its audio/animation starts (a one-beat lead for the wipe whoosh,
    two seconds for the riser into the final hit), `start` lands on a music beat, `hold` is the
    frame the presenter rests on."""
    cue, scenes = T["cues"], T["scenes"]
    first = next(i for i, s in enumerate(scenes) if s["start"] <= cue["drop"] < s["start"] + s["dur"])
    s0 = scenes[first]
    beats = [{"ids": [s["id"] for s in scenes[: first + 1]], "from": 0.0, "start": 0.0, "hold": s0["start"] + s0["dur"] - 0.5}]
    for i, s in enumerate(scenes[first + 1:], first + 1):
        last = i == len(scenes) - 1
        lead = 2.0 if s["start"] == cue["riser_to"] else 0.5
        beats.append({
            "ids": [s["id"]],
            "from": s["start"] - lead,
            "start": s["start"],
            "hold": T["duration"] - 0.05 if last else s["start"] + s["dur"] - 0.5,
        })
    return beats


def master(x, k):
    return np.tanh(hp(x, 28) * 1.1) * k


def wet_of(send, ir, n=None):
    n = n or len(send)
    return np.stack([fftconvolve(send[:, c], ir[:, c])[:n] for c in range(2)], axis=1)


def fold(buf, n):
    """Wrap everything past n samples back onto the start (seamless loop)."""
    out = buf[:n].copy()
    for i in range(n, len(buf), n):
        seg = buf[i:i + n]
        out[: len(seg)] += seg
    return out


def live_stems(ev, out, st, ir, k):
    T, cue = ev["timing"], ev["timing"]["cues"]
    beat = 60 / T["bpm"]
    bar = 4 * beat
    out.mkdir(parents=True, exist_ok=True)
    write = lambda name, x: wavfile.write(out / name, SR, (np.clip(x, -1, 1) * 32767).astype(np.int16))
    beats = live_beats(T)

    # 1) cold-open music (no SFX), up to where the loop takes over
    loop_at = beats[1]["start"]
    music = st["drums"].buf * 0.9 + st["bass"].buf * 0.8 + st["pads"].buf * 0.55 + st["arps"].buf * 0.5 + wet_of(st["send"].buf, ir) * 0.35
    intro = master(music, k)[: int((loop_at + 0.05) * SR)]
    write("intro.wav", intro)

    # 2) per-beat SFX: each beat gets its own slot with full tails
    slots, pos = [], 0
    for i, b in enumerate(beats):
        lo, hi = b["from"], beats[i + 1]["from"] if i + 1 < len(beats) else 1e9
        length = min(hi, T["duration"]) - lo + 3.0
        fx, send = Track(length), Track(length)
        for src, dst in ((st["fx"], fx), (st["fxsend"], send)):
            for t, sig, g, pan in src.events:
                if lo <= t < hi:
                    dst.add(t - lo, sig, g, pan)
        x = fx.buf * 0.85 + wet_of(send.buf, ir) * 0.35
        if i == len(beats) - 1:  # final chord ring-out (the loop fades out on end_hit)
            ring = Track(length)
            ring.add(cue["end_hit"] - lo, pad_chord([midi(n) for n in (57, 60, 64, 69)], 3.0, 1800), 0.6 * 0.55)
            x = x + ring.buf
        x = master(x, k)[: int(length * SR)]
        b["sfx"] = [pos / SR, len(x) / SR]
        slots.append(x)
        pos += len(x)
    write("sfx.wav", np.concatenate(slots))

    # 3) seamless 8-bar groove loop, bar 0 = Am so loop position = music time mod period
    nb = 8
    P = int(round(nb * bar * SR))
    drums, bass, pads, arps, send = (Track(nb * bar) for _ in range(5))
    kicks = []
    patterns = ([0, 1, 2, 3, 2, 1, 0, 1], [0, 2, 3, 2, 1, 2, 3, 1])
    for b in range(nb):
        t0 = b * bar
        root, chord = PROG[b % 4]
        pads.add(t0, pad_chord([midi(n) for n in chord], bar + 0.4, 2600), 0.55)
        notes = [chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[0] + 24]
        pattern = patterns[b // 4]
        for s16 in range(16):
            t = t0 + s16 * beat / 4
            if s16 % 4 == 0:
                drums.add(t, kick(), 0.95)
                kicks.append(t)
            if s16 % 8 == 4:
                drums.add(t, clap(), 0.55)
                send.add(t, clap(), 0.25)
            if s16 % 4 == 2:
                drums.add(t, hat(open_=True), 0.3, pan=0.25)
            elif s16 % 2 == 1:
                drums.add(t, hat(), 0.22, pan=-0.2)
            if s16 % 2 == 0:
                oct_ = 12 if s16 % 8 == 6 else 0
                bass.add(t, bass_note(midi(root + oct_), beat / 2 - 0.01), 0.9)
            p = pluck(midi(notes[pattern[s16 % 8]]))
            arps.add(t, p, 0.55, pan=-0.35 if s16 % 2 else 0.35)
            arps.add(t + beat * 0.75, p, 0.22, pan=0.5 if s16 % 2 else -0.5)
            send.add(t, p, 0.35)
    duck = np.ones(P)
    seg = np.arange(0, int(0.3 * SR)) / SR
    for tk in kicks:
        idx = (int(round(tk * SR)) + np.arange(len(seg))) % P
        duck[idx] = np.minimum(duck[idx], 1 - 0.65 * np.exp(-seg / 0.09))
    D, B, Pd, A, S = (fold(tr.buf, P) for tr in (drums, bass, pads, arps, send))
    wet = fold(wet_of(S, ir, len(S) + len(ir) - 1), P)
    loop = D * 0.9 + (B * 0.8 + Pd * 0.55 + A * 0.5) * duck[:, None] + wet * 0.35
    loop = np.tanh(hp(np.concatenate([loop, loop, loop]), 28)[2 * P:] * 1.1) * k  # circular high-pass
    write("loop.wav", loop)

    meta = {"bpm": T["bpm"], "loop_period": P / SR, "loop_at": loop_at, "intro_len": len(intro) / SR,
            "end_hit": cue["end_hit"], "duration": T["duration"], "beats": beats}
    (out / "live.json").write_text(json.dumps(meta, indent=2))
    print(f"wrote live stems to {out} ({len(beats)} beats)")


if __name__ == "__main__":
    main()
