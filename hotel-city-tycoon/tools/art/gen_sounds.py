#!/usr/bin/env python3
"""
The game's sound effects, synthesised.

No samples, no library — additive synthesis with the standard `wave` module.
Same reasoning as the art: perfect consistency, exact control, and the whole
set regenerates in under a second when a tone is wrong.

Every sound is short. A tycoon game plays its coin chime hundreds of times an
hour, and anything with a tail becomes unbearable by the second session.

Run: python3 tools/art/gen_sounds.py
"""
import math
import os
import struct
import wave

RATE = 22050          # plenty for short effects, half the bytes of 44.1k
OUT = "public/assets/audio"


def envelope(i, n, attack=0.01, release=0.6):
    """Attack-decay shape in samples. Keeps clicks off the start and end."""
    t = i / n
    a = min(1.0, t / attack) if attack > 0 else 1.0
    r = 1.0 - max(0.0, (t - (1 - release)) / release) if release > 0 else 1.0
    return a * max(0.0, r)


def tone(freq, seconds, *, kind="sine", amp=0.5, attack=0.01, release=0.6, detune=0.0):
    n = int(RATE * seconds)
    out = []
    for i in range(n):
        t = i / RATE
        phase = 2 * math.pi * freq * t
        if kind == "sine":
            v = math.sin(phase)
        elif kind == "triangle":
            v = 2 / math.pi * math.asin(math.sin(phase))
        elif kind == "square":
            v = 1.0 if math.sin(phase) >= 0 else -1.0
        elif kind == "noise":
            # Deterministic pseudo-noise, so builds are reproducible.
            v = ((i * 1103515245 + 12345) % 2000) / 1000.0 - 1.0
        else:
            v = math.sin(phase)
        if detune:
            v = (v + math.sin(2 * math.pi * (freq * (1 + detune)) * t)) * 0.5
        out.append(v * amp * envelope(i, n, attack, release))
    return out


def mix(*layers):
    n = max(len(layer) for layer in layers)
    out = [0.0] * n
    for layer in layers:
        for i, v in enumerate(layer):
            out[i] += v
    peak = max((abs(v) for v in out), default=1.0)
    if peak > 1.0:
        out = [v / peak for v in out]
    return out


def sequence(steps):
    """Notes one after another: [(freq, seconds, kind, amp), ...]"""
    out = []
    for freq, seconds, kind, amp in steps:
        out.extend(tone(freq, seconds, kind=kind, amp=amp, release=0.5))
    return out


def write(name, samples):
    os.makedirs(OUT, exist_ok=True)
    path = f"{OUT}/{name}.wav"
    with wave.open(path, "w") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(RATE)
        f.writeframes(b"".join(
            struct.pack("<h", int(max(-1.0, min(1.0, v)) * 32000)) for v in samples
        ))
    return path, os.path.getsize(path)


# ---------------------------------------------------------------- the set

def coin():
    """Bright two-note ping. Played constantly, so kept under 200ms."""
    return mix(
        tone(1180, 0.09, kind="sine", amp=0.5, release=0.7),
        tone(1760, 0.13, kind="sine", amp=0.35, attack=0.02, release=0.8),
    )


def level_up():
    """A rising major triad. The one sound allowed to feel like an occasion."""
    return sequence([(523, 0.10, "triangle", 0.45),
                     (659, 0.10, "triangle", 0.45),
                     (784, 0.10, "triangle", 0.45),
                     (1047, 0.26, "triangle", 0.5)])


def star():
    """Shimmer for a rating change — two close tones beating against each other."""
    return mix(
        tone(1320, 0.30, kind="sine", amp=0.35, attack=0.03, release=0.8, detune=0.006),
        tone(1980, 0.24, kind="sine", amp=0.2, attack=0.05, release=0.9),
    )


def bell():
    """Shift start and end. A front desk bell, not a doorbell."""
    return mix(
        tone(880, 0.42, kind="sine", amp=0.4, attack=0.005, release=0.9),
        tone(1320, 0.30, kind="sine", amp=0.18, attack=0.005, release=0.95),
        tone(2640, 0.12, kind="sine", amp=0.08, attack=0.002, release=0.9),
    )


def build():
    """A wooden thunk. Low, brief, no ring."""
    return mix(
        tone(150, 0.13, kind="triangle", amp=0.55, attack=0.002, release=0.85),
        tone(90, 0.16, kind="sine", amp=0.35, attack=0.002, release=0.9),
        tone(0, 0.04, kind="noise", amp=0.12, attack=0.001, release=0.95),
    )


def tap():
    """UI click. Almost subliminal on purpose."""
    return tone(660, 0.045, kind="sine", amp=0.3, attack=0.004, release=0.85)


def error():
    """A refusal. Falling, muted, never harsh."""
    return sequence([(320, 0.07, "triangle", 0.35), (240, 0.14, "triangle", 0.3)])


def alert():
    """Hazard. Two urgent pulses — the only sound that interrupts."""
    return sequence([(740, 0.11, "square", 0.22), (0, 0.05, "sine", 0.0),
                     (740, 0.13, "square", 0.22)])


def chime():
    """Welcome back. Warm, unhurried, plays once per session at most."""
    return sequence([(784, 0.14, "sine", 0.35),
                     (1047, 0.14, "sine", 0.35),
                     (1319, 0.34, "sine", 0.4)])


SOUNDS = {
    "coin": coin, "levelUp": level_up, "star": star, "bell": bell,
    "build": build, "tap": tap, "error": error, "alert": alert, "chime": chime,
}


if __name__ == "__main__":
    total = 0
    for name, fn in SOUNDS.items():
        path, size = write(name, fn())
        total += size
        print(f"  ✓ {path:<34} {size / 1024:5.1f} KB")
    print(f"\n  {len(SOUNDS)} sounds, {total / 1024:.1f} KB total")
