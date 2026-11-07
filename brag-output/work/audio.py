"""Matchday brag soundtrack: 120 BPM, C major, F-G-Am-C. Music and effects on one grid from frame 0."""
import numpy as np
import wave

SR = 48000
DUR = 20.0
N = int(SR * DUR)
rng = np.random.default_rng(7)
BEAT = 0.5


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


NOTE = {n: i for i, n in enumerate(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'])}


def nm(s):  # 'C4' -> midi
    return NOTE[s[:-1]] + 12 * (int(s[-1]) + 1)


def tt(n):
    return np.arange(n) / SR


def fft_filter(x, lo=None, hi=None, order=4):
    """Zero-phase magnitude filter (smooth high-/low-pass) on a mono array."""
    n = len(x)
    size = 1 << (n - 1).bit_length()
    X = np.fft.rfft(x, size)
    f = np.fft.rfftfreq(size, 1 / SR)
    H = np.ones_like(f)
    if hi is not None:
        H *= 1 / np.sqrt(1 + (f / hi) ** (2 * order))
    if lo is not None:
        with np.errstate(divide='ignore'):
            H *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1e-3)) ** (2 * order))
    return np.fft.irfft(X * H, size)[:n]


def sweep_noise(dur, f0, f1, width=0.6, amp_env=None):
    """Noise through a band whose centre glides from f0 to f1 (block STFT)."""
    n = int(dur * SR)
    noise = rng.standard_normal(n + 2048)
    out = np.zeros(n + 2048)
    blk, hop = 1024, 512
    win = np.hanning(blk)
    f = np.fft.rfftfreq(blk, 1 / SR)
    for i in range(0, n, hop):
        p = i / max(1, n)
        fc = f0 * (f1 / f0) ** p
        seg = noise[i:i + blk] * win
        S = np.fft.rfft(seg)
        H = np.exp(-0.5 * (np.log(np.maximum(f, 1) / fc) / width) ** 2)
        out[i:i + blk] += np.fft.irfft(S * H, blk) * win
    out = out[:n]
    out /= np.max(np.abs(out)) + 1e-9
    if amp_env is not None:
        out *= amp_env(np.linspace(0, 1, n))
    return out


class Bus:
    def __init__(self):
        self.L = np.zeros(N)
        self.R = np.zeros(N)

    def add(self, sig, t0, gain=1.0, pan=0.0):
        i = int(round(t0 * SR))
        if i >= N:
            return
        if i < 0:
            sig = sig[-i:]
            i = 0
        sig = sig[: N - i]
        l = np.cos((pan + 1) * np.pi / 4) * np.sqrt(2)
        r = np.sin((pan + 1) * np.pi / 4) * np.sqrt(2)
        self.L[i:i + len(sig)] += sig * gain * l
        self.R[i:i + len(sig)] += sig * gain * r

    def add_st(self, l, r, t0, gain=1.0):
        i = int(round(t0 * SR))
        n = min(len(l), N - i)
        self.L[i:i + n] += l[:n] * gain
        self.R[i:i + n] += r[:n] * gain


# ---------------- instruments ----------------
def kick(length=0.45, f_lo=46, f_hi=150, k=26, decay=7.0):
    t = tt(int(length * SR))
    f = f_lo + (f_hi - f_lo) * np.exp(-t * k)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * decay)
    click = fft_filter(rng.standard_normal(len(t)), lo=1500, hi=6000) * np.exp(-t * 400) * 0.25
    s = body + click
    s[:48] *= np.linspace(0, 1, 48)
    return s


def boom():
    t = tt(int(1.6 * SR))
    f = 36 + 110 * np.exp(-t * 12)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 2.4)
    thump = fft_filter(rng.standard_normal(len(t)), hi=300) * np.exp(-t * 10) * 0.6
    s = body + thump
    s[:96] *= np.linspace(0, 1, 96)
    return s


def clap():
    n = int(0.35 * SR)
    t = tt(n)
    noise = fft_filter(rng.standard_normal(n), lo=900, hi=4200, order=2)
    env = np.zeros(n)
    for d in (0.0, 0.009, 0.019):
        env += np.where(t >= d, np.exp(-(t - d) * 160), 0)
    env += np.where(t >= 0.019, np.exp(-(t - 0.019) * 16) * 0.5, 0)
    s = noise * env
    return s / np.max(np.abs(s))


def hat(decay=40.0, length=0.12, lo=7000):
    n = int(length * SR)
    t = tt(n)
    s = fft_filter(rng.standard_normal(n), lo=lo, hi=14000) * np.exp(-t * decay)
    return s / np.max(np.abs(s))


def snare():
    n = int(0.25 * SR)
    t = tt(n)
    nz = fft_filter(rng.standard_normal(n), lo=1500, hi=7000, order=2) * np.exp(-t * 26)
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 35) * 0.6
    s = nz + tone
    return s / np.max(np.abs(s))


def crash(length=2.2):
    n = int(length * SR)
    t = tt(n)
    s = fft_filter(rng.standard_normal(n), lo=3000, hi=11000, order=2) * np.exp(-t * 2.1)
    s[:240] *= np.linspace(0, 1, 240)
    return s / np.max(np.abs(s))


def tom(freq=110):
    n = int(0.5 * SR)
    t = tt(n)
    f = freq * (1 + 0.6 * np.exp(-t * 30))
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)
    s[:96] *= np.linspace(0, 1, 96)
    return s


def pluck(freq, length=0.9, bright=1.0, decay=4.5):
    n = int(length * SR)
    t = tt(n)
    s = np.zeros(n)
    for k in range(1, 9):
        if freq * k > 14000:
            break
        s += (1 / k ** 1.25) * np.sin(2 * np.pi * freq * k * t + k * 0.3) * np.exp(-t * (decay + k * 2.6 / bright))
    s[:72] *= np.linspace(0, 1, 72)
    return s / 1.6


def chime(freq, length=1.6):
    n = int(length * SR)
    t = tt(n)
    s = np.sin(2 * np.pi * freq * t) * np.exp(-t * 3.2) + 0.35 * np.sin(2 * np.pi * freq * 2.0 * t) * np.exp(-t * 6) \
        + 0.12 * np.sin(2 * np.pi * freq * 3.01 * t) * np.exp(-t * 9)
    s[:48] *= np.linspace(0, 1, 48)
    return s / 1.3


def tick(freq=2093.0):
    n = int(0.06 * SR)
    t = tt(n)
    s = np.sin(2 * np.pi * freq * t) * np.exp(-t * 90)
    s[:24] *= np.linspace(0, 1, 24)
    return s


def saw(freq, n, phase=0.0):
    t = tt(n)
    x = (freq * t + phase) % 1.0
    return 2 * x - 1


def pad_chord(notes, length, cutoff, attack=0.12, release=0.5):
    n = int((length + release) * SR)
    t = tt(n)
    L = np.zeros(n)
    R = np.zeros(n)
    for m in notes:
        f = midi(m)
        for det, side in ((-7, 'L'), (6, 'R'), (0, 'B')):
            v = saw(f * 2 ** (det / 1200), n, phase=rng.random())
            if side == 'L':
                L += v
            elif side == 'R':
                R += v
            else:
                L += 0.7 * v
                R += 0.7 * v
    env = np.minimum(1, t / attack) * np.where(t > length, np.exp(-(t - length) / (release / 3)), 1)
    L = fft_filter(L * env, hi=cutoff, order=2)
    R = fft_filter(R * env, hi=cutoff, order=2)
    g = 1 / (len(notes) * 2.4)
    return L * g, R * g


def bass_note(freq, length):
    n = int((length + 0.05) * SR)
    t = tt(n)
    v = 0.6 * saw(freq, n) + 0.9 * np.sin(2 * np.pi * freq * t) + 0.5 * np.sin(2 * np.pi * freq * 0.5 * t)
    env = np.minimum(1, t / 0.004) * (0.55 + 0.45 * np.exp(-t * 14)) * np.where(t > length * 0.8, np.exp(-(t - length * 0.8) * 60), 1)
    return v * env


def whistle(length=0.34, f0=2350):
    n = int(length * SR)
    t = tt(n)
    trill = np.sin(2 * np.pi * 27 * t)
    f = f0 + 110 * trill
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * (0.75 + 0.25 * trill)
    breath = fft_filter(rng.standard_normal(n), lo=1800, hi=3200, order=2)
    breath /= np.max(np.abs(breath))
    env = np.minimum(1, t / 0.012) * np.where(t > length - 0.06, np.maximum(0, (length - t) / 0.06), 1)
    s = (tone + 0.18 * breath) * env
    return fft_filter(s, hi=5200, order=2)


# ---------------- arrangement ----------------
drums = Bus()
music = Bus()
fx = Bus()
send = Bus()  # reverb send
kick_times = []

CHORDS = {  # bar start -> (name, pad notes, bass root, arp tones)
    1.0: ('C', ['C4', 'E4', 'G4'], 'C3', ['G4', 'C5', 'E5', 'G5']),
    3.0: ('F', ['A3', 'C4', 'F4'], 'F2', ['F4', 'A4', 'C5', 'F5']),
    5.0: ('G', ['B3', 'D4', 'G4'], 'G2', ['G4', 'B4', 'D5', 'G5']),
    7.0: ('Am', ['A3', 'C4', 'E4'], 'A2', ['A4', 'C5', 'E5', 'A5']),
    9.0: ('C', ['G3', 'C4', 'E4'], 'C3', ['G4', 'C5', 'E5', 'G5']),
    11.0: ('F', ['A3', 'C4', 'F4'], 'F2', ['F4', 'A4', 'C5', 'F5']),
    13.0: ('G', ['B3', 'D4', 'G4'], 'G2', ['G4', 'B4', 'D5', 'G5']),
    15.0: ('Am', ['A3', 'C4', 'E4'], 'A2', ['A4', 'C5', 'E5', 'A5']),
    17.0: ('C', ['G3', 'C4', 'E4', 'C5'], 'C3', ['G4', 'C5', 'E5', 'G5']),
}

K = kick()
CL = clap()
HH = hat()
SH = hat(decay=70, length=0.06, lo=5000)
SN = snare()

# --- hook: whistle + boom on frame 0
fx.add(whistle(), 0.0, 0.075)
send.add(whistle(), 0.0, 0.05)
drums.add(boom(), 0.0, 0.85)
kick_times.append(0.0)

# --- bar A (1-3): half-time kick, soft hats, filtered pad swell
for tk in (1.0, 2.0):
    drums.add(K, tk, 0.62)
    kick_times.append(tk)
for i in range(8):
    t0 = 1.25 + i * 0.25 if False else 1.0 + i * 0.25
    if (i % 2) == 1:
        drums.add(HH, t0, 0.12, pan=0.2)
l, r = pad_chord([nm(x) for x in CHORDS[1.0][1]], 2.0, cutoff=700, attack=0.6)
music.add_st(l, r, 1.0, 0.9)
send.add_st(l, r, 1.0, 0.3)
# riser + snare build into the drop
rise = sweep_noise(1.0, 300, 7000, width=0.5, amp_env=lambda p: p ** 2.2)
fx.add(rise, 2.0, 0.10)
send.add(rise, 2.0, 0.06)
for i, t0 in enumerate([2.0, 2.25, 2.5, 2.625, 2.75, 2.875]):
    drums.add(SN, t0, 0.05 + 0.03 * i, pan=-0.1)

# --- groove 3.0 - 19.0
def groove(t_start, t_end, kick_gain=0.68):
    t0 = t_start
    while t0 < t_end - 1e-6:
        drums.add(K, t0, kick_gain)
        kick_times.append(t0)
        beat_in_bar = int(round((t0 - 1.0) / BEAT)) % 4
        if beat_in_bar in (1, 3):
            drums.add(CL, t0, 0.38, pan=0.05)
            send.add(CL, t0, 0.10)
        drums.add(HH, t0 + 0.25, 0.20, pan=0.25)
        drums.add(SH, t0 + 0.125, 0.07, pan=-0.3)
        drums.add(SH, t0 + 0.375, 0.07, pan=-0.3)
        t0 += BEAT


groove(3.0, 16.5)
# fill into the outro
for i, t0 in enumerate([16.5, 16.625, 16.75, 16.875]):
    drums.add(SN, t0, 0.08 + 0.04 * i)
    send.add(SN, t0, 0.03)
drums.add(K, 16.5, 0.8)
kick_times.append(16.5)
groove(17.0, 19.0, kick_gain=0.66)
# crashes on the drop, the outro and the final hit
for tc, g in ((3.0, 0.09), (17.0, 0.10), (19.0, 0.09)):
    drums.add(crash(), tc, g, pan=0.15)
    send.add(crash(), tc, 0.04)
drums.add(K, 19.0, 0.9)
kick_times.append(19.0)

# --- pads and bass from the drop
for b0 in sorted(CHORDS):
    if b0 < 3.0:
        continue
    name, notes, root, arp = CHORDS[b0]
    length = 2.0 if b0 < 17.0 else 3.0
    l, r = pad_chord([nm(x) for x in notes], length, cutoff=4200 if b0 < 17 else 5000, attack=0.05, release=0.6 if b0 < 17 else 0.4)
    music.add_st(l, r, b0, 0.85)
    send.add_st(l, r, b0, 0.35)
    # bass: 8ths, root with an octave lift on the last two
    f = midi(nm(root))
    if b0 < 17.0:
        for i in range(8):
            fr = f * (2 if i in (6,) else 1)
            music.add(bass_note(fr, 0.24), b0 + i * 0.25, 0.25)
    else:
        for i in range(8):
            music.add(bass_note(f, 0.24), b0 + i * 0.25, 0.25)
        music.add(bass_note(f, 0.9), 19.0, 0.32)

# final stab at 19.0: C chord pluck
for m, g in (('C4', 0.16), ('E4', 0.13), ('G4', 0.13), ('C5', 0.12)):
    s = pluck(midi(nm(m)), length=1.2, decay=3.0)
    music.add(s, 19.0, g)
    send.add(s, 19.0, g * 0.6)

# --- arp (plucks on 8ths) 3.0 - 19.0, muted while the saves play their own run
PATTERN = [0, 2, 1, 3, 2, 1, 3, 2]
for b0 in sorted(CHORDS):
    if b0 < 3.0:
        continue
    tones = CHORDS[b0][3]
    for i in range(8):
        t0 = b0 + i * 0.25
        if 7.4 <= t0 < 9.6 or t0 >= 19.0:
            continue
        m = nm(tones[PATTERN[i]])
        acc = 1.0 if i % 2 == 0 else 0.75
        s = pluck(midi(m), length=0.6, decay=6.0)
        pan = -0.25 if i % 2 == 0 else 0.25
        music.add(s, t0, 0.17 * acc, pan=pan)
        send.add(s, t0, 0.07 * acc, pan=-pan)

# outro stab at 17.0
for m, g in (('C5', 0.16), ('E5', 0.13), ('G5', 0.13), ('C6', 0.09)):
    s = chime(midi(nm(m)), 2.0)
    fx.add(s, 17.0, g)
    send.add(s, 17.0, g * 0.8)

# ---------------- effects in the same key and space ----------------
def tap_click(t0, g=0.05):
    fx.add(tick(2093.0), t0, g)
    send.add(tick(2093.0), t0, g * 0.6)


# 2: tap Keeper -> rising two-note chime (54 -> 72)
tap_click(5.0)
for t0, m in ((5.0, 'B5'), (5.125, 'G6')):
    s = chime(midi(nm(m)), 1.4)
    fx.add(s, t0, 0.075)
    send.add(s, t0, 0.07)

# 3: goals taps, then each save the next note up the pentatonic
for t0, m in ((7.5, 'A4'), (7.75, 'C5')):
    tap_click(t0)
    s = pluck(midi(nm(m)), length=0.7, decay=5.0)
    fx.add(s, t0, 0.15)
    send.add(s, t0, 0.08)
for t0, m in zip([8.0, 8.25, 8.5, 8.75, 9.0, 9.25], ['E5', 'G5', 'A5', 'C6', 'D6', 'E6']):
    tap_click(t0)
    s = pluck(midi(nm(m)), length=0.8, decay=4.5)
    fx.add(s, t0, 0.15)
    send.add(s, t0, 0.09)
# sparkle on 95
for t0, m in ((9.25, 'G6'), (9.375, 'C7')):
    s = chime(midi(nm(m)), 1.5)
    fx.add(s, t0, 0.04)
    send.add(s, t0, 0.06)
# save result + sheet down
tap_click(10.0)
down = sweep_noise(0.4, 1800, 250, width=0.5, amp_env=lambda p: np.sin(np.pi * p) ** 2)
fx.add(down, 10.05, 0.05)

# whooshes into cuts
for t_cut, d, g in ((7.0, 0.35, 0.04), (10.5, 0.4, 0.06), (14.0, 0.45, 0.07)):
    w = sweep_noise(d, 400, 4500, width=0.55, amp_env=lambda p: np.sin(np.pi * p * 0.5) ** 3)
    fx.add(w, t_cut - d, g)
    send.add(w, t_cut - d, g * 0.6)

# 4: highlights tick through the message, bubble flies, paste lands
for i, m in enumerate(['C6', 'E6', 'G6', 'C6', 'E6', 'G6']):
    t0 = 11.5 + i * 0.125
    s = chime(midi(nm(m)), 0.5)
    fx.add(s, t0, 0.025, pan=-0.3 + 0.12 * i)
    send.add(s, t0, 0.03)
fly = sweep_noise(0.42, 600, 3500, width=0.5, amp_env=lambda p: np.sin(np.pi * p) ** 2)
fx.add(fly, 12.35, 0.045, pan=0.3)
send.add(fly, 12.35, 0.03)
for m, g in (('F5', 0.10), ('A5', 0.09), ('C6', 0.08)):
    s = pluck(midi(nm(m)), length=1.0, decay=3.5)
    fx.add(s, 12.75, g)
    send.add(s, 12.75, g)

# 5: phones land in a fan
for t0, f in ((14.0, midi(nm('A2'))), (14.5, midi(nm('C3'))), (15.0, midi(nm('E3')))):
    fx.add(tom(f), t0, 0.22)
    send.add(tom(f), t0, 0.05)

# ---------------- sidechain, reverb, master ----------------
duck = np.ones(N)
t_all = tt(N)
for tk in kick_times:
    i = int(tk * SR)
    seg_t = t_all[: N - i]
    duck[i:] *= 1 - 0.45 * np.exp(-seg_t / 0.11)
music.L *= duck
music.R *= duck

# shared room: decaying noise IR, a little darker in the tail
ir_len = int(1.6 * SR)
ti = tt(ir_len)
irL = rng.standard_normal(ir_len) * np.exp(-ti / 0.38)
irR = rng.standard_normal(ir_len) * np.exp(-ti / 0.38)
irL = fft_filter(irL, lo=200, hi=6000)
irR = fft_filter(irR, lo=200, hi=6000)
irL[: int(0.012 * SR)] = 0
irR[: int(0.015 * SR)] = 0
irL /= np.sqrt(np.sum(irL ** 2))
irR /= np.sqrt(np.sum(irR ** 2))


def conv(x, h):
    size = 1 << (len(x) + len(h)).bit_length()
    return np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(h, size), size)[: len(x)]


revL = conv(send.L * duck, irL) * 0.55
revR = conv(send.R * duck, irR) * 0.55

L = drums.L + music.L + fx.L + revL
R = drums.R + music.R + fx.R + revR
# master tilt: a soft +3 dB shelf from ~4 kHz for presence and air
def shelf(x, fc=4000, db=3.0):
    size = 1 << (len(x) - 1).bit_length()
    X = np.fft.rfft(x, size)
    f = np.fft.rfftfreq(size, 1 / SR)
    g = 10 ** (db / 20)
    H = 1 + (g - 1) * (f ** 2 / (f ** 2 + fc ** 2))
    return np.fft.irfft(X * H, size)[: len(x)]


L = shelf(L)
R = shelf(R)
# gentle glue: soft clip
peak = max(np.max(np.abs(L)), np.max(np.abs(R)))
L /= peak
R /= peak
L = np.tanh(L * 1.3) / np.tanh(1.3)
R = np.tanh(R * 1.3) / np.tanh(1.3)
# tail fade on the last 0.6s
fade = np.ones(N)
fi = int(19.4 * SR)
fade[fi:] = np.cos(np.linspace(0, np.pi / 2, N - fi)) ** 2
L *= fade
R *= fade
st = np.stack([L, R], axis=1) * 0.89
pcm = (np.clip(st, -1, 1) * 32767).astype('<i2')
with wave.open('music.wav', 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('wrote music.wav', pcm.shape)
