"""Writes the Hyperframes composition for the Matchday player + academy overview brag.

Shares its helpers (phone geometry, text masks, taps) with the narrated run in ../brag-output-2026-11-07-160521.
Run from brag-output-2026-11-07-195135/:  python3 work/build.py
"""
import json
import os

OUT = 'composition'
os.makedirs(f'{OUT}/compositions', exist_ok=True)

# ---------------------------------------------------------------- shared look
FONTS = """
@font-face { font-family: 'Barlow Condensed'; font-weight: 700; src: url('assets/fonts/barlow-condensed-latin-700-normal.woff2') format('woff2'); }
@font-face { font-family: 'Barlow Condensed'; font-weight: 800; src: url('assets/fonts/barlow-condensed-latin-800-normal.woff2') format('woff2'); }
@font-face { font-family: 'Matchday Inter'; font-weight: 500; src: url('assets/fonts/Inter-Medium.otf') format('opentype'); }
@font-face { font-family: 'Matchday Inter'; font-weight: 600; src: url('assets/fonts/Inter-SemiBold.otf') format('opentype'); }
@font-face { font-family: 'Matchday Inter'; font-weight: 700; src: url('assets/fonts/Inter-Bold.otf') format('opentype'); }
@font-face { font-family: 'Matchday Inter'; font-weight: 800; src: url('assets/fonts/Inter-ExtraBold.otf') format('opentype'); }
"""

BASE_CSS = """
#root { position: absolute; inset: 0; color: #f2f2f7; font-family: 'Matchday Inter', sans-serif; -webkit-font-smoothing: antialiased; }
.display { font-family: 'Barlow Condensed', sans-serif; font-weight: 800; text-transform: uppercase; letter-spacing: -0.005em; }
.ln { display: block; overflow: hidden; padding: 0.04em 0.02em 0.02em; margin: -0.04em -0.02em -0.02em; }
.ln > span { display: inline-block; }
.green { color: #30d27c; }
.muted { color: #a1a1a8; }
.abs { position: absolute; }
.col { position: absolute; left: 240px; width: 760px; }
.phone { position: absolute; background: #0b0b0c; border-radius: 68px; padding: 14px;
  box-shadow: 0 0 0 1.5px rgba(255,255,255,0.16), inset 0 0 0 1.5px rgba(255,255,255,0.05), 0 40px 120px rgba(0,0,0,0.7); }
.screen { position: relative; width: 100%; height: 100%; border-radius: 54px; overflow: hidden; background: #000; isolation: isolate; }
.screen img { position: absolute; left: 0; width: 100%; display: block; opacity: 0; }
.screen img.on { opacity: 1; }
.sbar { position: absolute; left: 0; top: 0; right: 0; height: 42px; background: #000; z-index: 20; display: flex; align-items: center;
  justify-content: space-between; padding: 6px 34px 0 44px; font-weight: 600; font-size: 17px; color: #fff; }
.sbar .icons { display: flex; gap: 6px; align-items: center; }
.lift { position: absolute; z-index: 10; opacity: 0; }
.lift .wrap { position: relative; width: 100%; height: 100%; overflow: hidden; }
.lift .wrap img { position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: block; opacity: 0; }
.lift .wrap img.on { opacity: 1; }
.finger { position: absolute; left: 0; top: 0; width: 50px; height: 50px; margin: -25px 0 0 -25px; border-radius: 50%; z-index: 12; opacity: 0;
  background: rgba(255,255,255,0.32); border: 2.5px solid rgba(255,255,255,0.8); box-shadow: 0 6px 18px rgba(0,0,0,0.45); }
.ripple { position: absolute; left: 0; top: 0; width: 50px; height: 50px; margin: -25px 0 0 -25px; border-radius: 50%; z-index: 11; opacity: 0;
  border: 3px solid rgba(255,255,255,0.9); }
"""

SBAR = """<div class="sbar" data-layout-ignore><span>9:41</span><span class="icons">
<svg width="20" height="13" viewBox="0 0 20 13"><rect x="0" y="9" width="3.5" height="4" rx="1" fill="#fff"/><rect x="5.3" y="6" width="3.5" height="7" rx="1" fill="#fff"/><rect x="10.6" y="3" width="3.5" height="10" rx="1" fill="#fff"/><rect x="15.9" y="0" width="3.5" height="13" rx="1" fill="#fff"/></svg>
<svg width="18" height="13" viewBox="0 0 18 13"><path d="M9 12.5l2.6-3.1a4 4 0 0 0-5.2 0z M9 4.6a8.2 8.2 0 0 1 5.4 2l1.6-1.9A10.7 10.7 0 0 0 9 2.1 10.7 10.7 0 0 0 2 4.7l1.6 1.9a8.2 8.2 0 0 1 5.4-2z" fill="#fff"/></svg>
<svg width="28" height="13" viewBox="0 0 28 13"><rect x="0.5" y="0.5" width="24" height="12" rx="3.5" fill="none" stroke="rgba(255,255,255,0.45)"/><rect x="2.5" y="2.5" width="17" height="8" rx="2" fill="#fff"/><rect x="25.8" y="4.2" width="1.7" height="4.6" rx="0.8" fill="rgba(255,255,255,0.45)"/></svg>
</span></div>"""

PANELS = [
    '666.1,444.6 782.7,408.4 819.0,592.3 680.8,713.2 603.1,621.7',
    '603.1,621.7 680.8,713.2 512.4,814.3 353.5,721.0 420.0,621.7',
    '420.0,621.7 353.5,721.0 205.0,592.3 245.6,401.5 359.6,444.6',
    '359.6,444.6 245.6,401.5 323.3,231.3 510.7,209.7 512.4,337.6',
    '512.4,337.6 666.1,444.6 603.1,621.7 420.0,621.7 359.6,444.6',
]
LIT = '512.4,337.6 666.1,444.6 782.7,408.4 711.9,220.1 510.7,209.7'


def logo_svg(uid, size):
    polys = ''.join(f'<polygon points="{p}" fill="url(#lb-{uid})" stroke="rgba(255,255,255,0.10)" stroke-width="5"/>' for p in PANELS)
    return f'''<svg viewBox="176 176 672 672" width="{size}" height="{size}" style="overflow:visible;display:block">
<defs>
<linearGradient id="lb-{uid}" gradientUnits="userSpaceOnUse" x1="0" y1="209.7" x2="0" y2="814.3"><stop offset="0" stop-color="#2a2f35"/><stop offset="1" stop-color="#16191d"/></linearGradient>
<linearGradient id="ll-{uid}" gradientUnits="userSpaceOnUse" x1="0" y1="209.7" x2="0" y2="814.3"><stop offset="0" stop-color="#48E597"/><stop offset="1" stop-color="#30D27C"/></linearGradient>
<filter id="lh-{uid}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="16"/></filter>
</defs>
<polygon id="{uid}-halo" points="{LIT}" fill="#30D27C" opacity="0.55" filter="url(#lh-{uid})"/>
<g stroke="#000" stroke-width="15" stroke-linejoin="round"><polygon points="{LIT}" fill="url(#ll-{uid})"/>{polys}</g></svg>'''


# ---------------------------------------------------------------- phone geometry
S, SB, BZ = 1.054, 42, 14
SW = 390 * S
SH = 844 * S + SB
PW, PH = SW + 2 * BZ, SH + 2 * BZ
PCX, PCY = 1410, 540
PX, PY = PCX - PW / 2, PCY - PH / 2


def ax(x):
    return PX + BZ + x * S


def ay(y):
    return PY + BZ + SB + y * S


def r(v):
    return round(v, 2)



def tap_xy(name):
    x, y = P[name]
    return r(ax(x)), r(ay(y))


def phone_html(pfx, screens, lifts=''):
    imgs = '\n'.join(
        f'<img id="{pfx}-s-{key}" src="assets/img/{img}.jpg" alt="" style="top:{SB}px;z-index:{z}"{" class=on" if on else ""}>'
        for key, img, z, on in screens)
    return f'''<div id="{pfx}-wrap" class="abs" style="left:0;top:0;width:1920px;height:1080px;transform-origin:{PCX}px 600px">
<div class="phone" style="left:{r(PX)}px;top:{r(PY)}px;width:{r(PW)}px;height:{r(PH)}px">
<div class="screen" data-layout-allow-overflow>{SBAR}
{imgs}
</div></div>
{lifts}
<div id="{pfx}-finger" class="finger"></div>
</div>'''


def lift_html(pfx, name, box, imgs, radius=16, extra_style=''):
    x, y, w, h = box
    inner = '\n'.join(f'<img id="{pfx}-{name}-{k}" src="assets/img/{src}" alt=""{" class=on" if on else ""}>' for k, src, on in imgs)
    return f'''<div id="{pfx}-{name}" class="lift" style="left:{r(ax(x))}px;top:{r(ay(y))}px;width:{r(w * S)}px;height:{r(h * S)}px;transform-origin:50% 50%">
<div id="{pfx}-{name}-wrap" class="wrap" style="border-radius:{r(radius * S)}px;{extra_style}">{inner}</div></div>'''


class TL:
    """Collects GSAP calls for one scene."""

    def __init__(self):
        self.lines = []
        self.ripples = []

    def add(self, s):
        self.lines.append(s)

    def fromto(self, sel, a, b, t):
        self.lines.append(('fromTo', sel, a, b, r(t)))

    def to(self, sel, b, t):
        self.add(f'tl.to("{sel}", {json.dumps(b)}, {r(t)});')

    def set(self, sel, b, t):
        self.add(f'tl.set("{sel}", {json.dumps(b)}, {r(t)});')

    def lines_in(self, sel, t, stagger=0.07, dur=0.42):
        self.add(f'tl.fromTo("{sel} .ln > span", {{yPercent: 105}}, {{yPercent: 0, duration: {dur}, ease: "expo.out", stagger: {stagger}}}, {r(t)});')

    def lines_out(self, sel, t, stagger=0.03, dur=0.22):
        self.add(f'tl.to("{sel} .ln > span", {{yPercent: -105, duration: {dur}, ease: "power3.in", stagger: {stagger}}}, {r(t)});')

    def screen(self, pfx, key, t):
        self.set(f'#{pfx}-s-{key}', {'opacity': 1}, t)

    def screen_off(self, pfx, key, t):
        self.set(f'#{pfx}-s-{key}', {'opacity': 0}, t)

    def tap(self, pfx, name, t):
        x, y = tap_xy(name)
        i = len(self.ripples)
        rid = f'{pfx}-rp{i}'
        self.ripples.append(rid)
        self.set(f'#{rid}', {'x': x, 'y': y}, 0)
        # a ripple only exists from its tap on: never render its start state early
        self.add(f'tl.fromTo("#{rid}", {{scale: 1, opacity: 0.75}}, {{scale: 2.4, opacity: 0, duration: 0.45, ease: "power2.out", immediateRender: false}}, {r(t)});')
        self.fromto(f'#{pfx}-finger', {'scale': 1}, {'scale': 0.82, 'duration': 0.07, 'ease': 'power2.out'}, t - 0.07)
        self.fromto(f'#{pfx}-finger', {'scale': 0.82}, {'scale': 1, 'duration': 0.1, 'ease': 'power2.out'}, t)

    def finger_at(self, pfx, name, t):
        x, y = tap_xy(name)
        self.set(f'#{pfx}-finger', {'x': x, 'y': y}, t)

    def finger_move(self, pfx, a, b, t, dur):
        xa, ya = tap_xy(a)
        xb, yb = tap_xy(b)
        self.fromto(f'#{pfx}-finger', {'x': xa, 'y': ya}, {'x': xb, 'y': yb, 'duration': dur, 'ease': 'power2.inOut'}, t)

    def finger_show(self, pfx, t, dur=0.15):
        self.fromto(f'#{pfx}-finger', {'opacity': 0}, {'opacity': 1, 'duration': dur}, t)

    def finger_hide(self, pfx, t, dur=0.15):
        self.to(f'#{pfx}-finger', {'opacity': 0, 'duration': dur}, t)

    def js(self, comp_id):
        # Only the earliest fromTo on a target may render immediately; later ones wait for their
        # position, so a seek before them keeps the earliest tween's start state.
        first = {}
        for ln in self.lines:
            if isinstance(ln, tuple):
                sel, t = ln[1], ln[4]
                first[sel] = min(first.get(sel, t), t)
        out, seen = [], set()
        for ln in self.lines:
            if isinstance(ln, tuple):
                _, sel, a, b, t = ln
                b = dict(b)
                if t > first[sel] or sel in seen:
                    b['immediateRender'] = False
                else:
                    seen.add(sel)
                out.append(f'tl.fromTo("{sel}", {json.dumps(a)}, {json.dumps(b)}, {t});')
            else:
                out.append(ln)
        return 'const tl = gsap.timeline({ paused: true });\n' + '\n'.join(out) + f'\nwindow.__timelines["{comp_id}"] = tl;'

    def ripple_html(self):
        return '\n'.join(f'<div id="{rid}" class="ripple"></div>' for rid in self.ripples)


def scene_file(comp_id, dur, css, body, tl):
    html = f'''<template>
<style>
{FONTS}
{BASE_CSS}
{css}
</style>
<div id="root" data-composition-id="{comp_id}" data-width="1920" data-height="1080" data-duration="{dur}">
{body}
</div>
<script>
{tl.js(comp_id)}
</script>
</template>
'''
    with open(f'{OUT}/compositions/{comp_id}.html', 'w') as f:
        f.write(html)


def insert_ripples(body, pfx, tl):
    return body.replace(f'<div id="{pfx}-finger" class="finger"></div>', tl.ripple_html() + f'\n<div id="{pfx}-finger" class="finger"></div>')



# ================================================================ this run
P = {  # tap targets in app coordinates (390 x 844)
    'acPlayers': (195, 337), 'consent': (318, 483), 'accept': (81, 552), 'statsTab': (337, 797),
}

SCENES = [
    ('hook', 0.0, 3.6),
    ('player', 3.6, 7.75),
    ('academy', 7.75, 11.65),
    ('link', 11.65, 14.95),
    ('picks', 14.95, 20.2),
    ('outro', 20.2, 24.5),
]
TOTAL = 24.5
VO = [  # id, start, measured duration
    ('vo1', 0.30, 3.01), ('vo2', 3.65, 3.73), ('vo3', 7.80, 3.58),
    ('vo4', 11.75, 2.84), ('vo5', 15.05, 4.74), ('vo6', 20.55, 2.15),
]

COL_CSS = """
.kicker { position: absolute; left: 240px; top: 150px; width: 470px; border-radius: 22px; overflow: hidden; }
.kicker img { display: block; width: 100%; }
.h { font-size: 104px; line-height: 0.92; }
.sub { font-size: 40px; font-weight: 500; color: #a1a1a8; line-height: 1.3; }
"""

# who-card sizes at 600px wide in the hook
WHO_W = 600
WHO_PH = r(WHO_W * 96.77 / 350)
WHO_AH = r(WHO_W * 114.95 / 350)

# ================================================================ 1. hook (0 - 3.6)
tl = TL()
css = COL_CSS + f"""
#hk-brand {{ left: 0; width: 1920px; top: 92px; display: flex; justify-content: center; align-items: center; gap: 16px; }}
#hk-brand .word {{ font-family: 'Barlow Condensed'; font-weight: 700; font-size: 50px; letter-spacing: 0.08em; color: #a1a1a8; text-transform: uppercase; }}
#hk-title {{ left: 0; width: 1920px; top: 190px; text-align: center; font-size: 200px; line-height: 1; }}
.who {{ position: absolute; top: 560px; width: {WHO_W}px; border-radius: 28px; overflow: hidden; opacity: 0; }}
.who img {{ display: block; width: 100%; }}
#hk-player {{ left: 336px; }}
#hk-academy {{ left: 984px; }}
#hk-ring {{ position: absolute; left: 0; top: 0; width: 60px; height: 60px; margin: -30px 0 0 -30px; border-radius: 50%; border: 3px solid rgba(255,255,255,0.9); opacity: 0; }}
#hk-finger {{ position: absolute; left: 0; top: 0; width: 56px; height: 56px; margin: -28px 0 0 -28px; border-radius: 50%; opacity: 0;
  background: rgba(255,255,255,0.32); border: 2.5px solid rgba(255,255,255,0.85); box-shadow: 0 6px 18px rgba(0,0,0,0.45); }}
"""
body = f'''<div id="hk-brand" class="abs"><span data-layout-allow-overflow class="ln" style="padding:6px;margin:-6px"><span>{logo_svg('hklogo', 60)}</span></span><span data-layout-allow-overflow class="ln word"><span>Matchday</span></span></div>
<div id="hk-title" class="abs display"><span data-layout-allow-overflow class="ln"><span>Who's this <span class="green">for?</span></span></span></div>
<div id="hk-player" class="who"><img src="assets/img/who-player.png" alt=""></div>
<div id="hk-academy" class="who"><img src="assets/img/who-academy.png" alt=""></div>
<div id="hk-ring"></div><div id="hk-finger"></div>'''
tl.lines_in('#hk-brand', 0.05, stagger=0.06)
tl.lines_in('#hk-title', 0.3, dur=0.5)
tl.fromto('#hk-player', {'y': 60, 'opacity': 0}, {'y': 0, 'opacity': 1, 'duration': 0.5, 'ease': 'back.out(1.4)'}, 0.95)
tl.fromto('#hk-academy', {'y': 60, 'opacity': 0}, {'y': 0, 'opacity': 1, 'duration': 0.5, 'ease': 'back.out(1.4)'}, 1.15)
# tap "Me or my child"
CX, CY = 336 + WHO_W / 2, 560 + WHO_PH / 2
tl.set('#hk-finger', {'x': CX, 'y': CY}, 0)
tl.set('#hk-ring', {'x': CX, 'y': CY}, 0)
tl.fromto('#hk-finger', {'opacity': 0}, {'opacity': 1, 'duration': 0.15}, 2.55)
tl.fromto('#hk-finger', {'scale': 1}, {'scale': 0.82, 'duration': 0.07}, 2.78)
tl.fromto('#hk-finger', {'scale': 0.82}, {'scale': 1, 'duration': 0.1}, 2.85)
tl.add('tl.fromTo("#hk-ring", {scale: 1, opacity: 0.75}, {scale: 2.6, opacity: 0, duration: 0.45, ease: "power2.out", immediateRender: false}, 2.85);')
tl.to('#hk-finger', {'opacity': 0, 'duration': 0.15}, 3.0)
tl.fromto('#hk-player', {'boxShadow': '0 0 0 0px rgba(48,210,124,0), 0 0 0px rgba(48,210,124,0)'},
          {'boxShadow': '0 0 0 3px rgba(48,210,124,0.9), 0 0 40px rgba(48,210,124,0.35)', 'duration': 0.2}, 2.88)
tl.to('#hk-academy', {'opacity': 0.35, 'duration': 0.15}, 2.88)
# carry the chosen card into the next scene's kicker spot
tl.lines_out('#hk-title', 3.05)
tl.lines_out('#hk-brand', 3.05)
tl.to('#hk-academy', {'y': 40, 'opacity': 0, 'duration': 0.24, 'ease': 'power3.in'}, 3.05)
tl.to('#hk-player', {'x': 240 - 336, 'y': 150 - 560, 'scale': r(470 / WHO_W), 'transformOrigin': '0% 0%', 'duration': 0.45, 'ease': 'power3.inOut'}, 3.1)
scene_file('hook', 3.6, css, body, tl)

# ================================================================ 2. player (3.6 - 7.75)
pfx = 'pl'
tl = TL()
screens = [('home', 'home-clean', 1, True), ('rating', 'r-step8', 2, False)]
lift = lift_html(pfx, 'card', (16, 538.9, 358, 70), [('c', 'card-r-step8.png', True)])
body = f'''<div id="pl-kick" class="kicker" style="box-shadow:0 0 0 3px rgba(48,210,124,0.9), 0 0 40px rgba(48,210,124,0.35)"><img src="assets/img/who-player.png" alt=""></div>
<div id="pl-h" class="col h display" style="top:330px"><span data-layout-allow-overflow class="ln"><span>Every match,</span></span><span data-layout-allow-overflow class="ln"><span>rated for your</span></span><span data-layout-allow-overflow class="ln green"><span>position.</span></span></div>
<div id="pl-sub" class="col sub" style="top:660px"><span data-layout-allow-overflow class="ln"><span>Works on this phone with no account.</span></span></div>
{phone_html(pfx, screens, lift)}'''
tl.fromto('#pl-wrap', {'y': 1100}, {'y': 0, 'duration': 0.7, 'ease': 'back.out(1.1)'}, 0)
tl.lines_in('#pl-h', 0.12, stagger=0.07)
tl.lines_in('#pl-sub', 0.55)
tl.fromto('#pl-s-rating', {'yPercent': 100, 'opacity': 1}, {'yPercent': 0, 'opacity': 1, 'duration': 0.38, 'ease': 'power3.out'}, 1.0)
tl.fromto('#pl-card', {'opacity': 0, 'scale': 1, 'x': 0, 'y': 0}, {'opacity': 1, 'scale': 1.36, 'x': -26, 'y': -8, 'duration': 0.45, 'ease': 'back.out(1.6)'}, 1.45)
tl.fromto('#pl-card-wrap', {'boxShadow': '0 0px 0px rgba(0,0,0,0), 0 0 0px rgba(48,210,124,0)'},
          {'boxShadow': '0 24px 60px rgba(0,0,0,0.65), 0 0 46px rgba(48,210,124,0.5)', 'duration': 0.35}, 1.55)
tl.to('#pl-card', {'scale': 1, 'x': 0, 'y': 0, 'duration': 0.16, 'ease': 'power2.inOut'}, 3.58)
tl.set('#pl-card', {'opacity': 0}, 3.76)
tl.lines_out('#pl-h', 3.8)
tl.lines_out('#pl-sub', 3.82)
tl.to('#pl-kick', {'x': -60, 'opacity': 0, 'duration': 0.24, 'ease': 'power3.in'}, 3.8)
tl.to('#pl-wrap', {'y': 1150, 'duration': 0.34, 'ease': 'power3.in'}, 3.8)
body = insert_ripples(body, pfx, tl)
scene_file('player', 4.15, COL_CSS, body, tl)

# ================================================================ 3. academy (7.75 - 11.65)
pfx = 'ac'
tl = TL()
screens = [('home', 'ac-home', 1, True), ('players', 'ac-players', 2, False)]
lift = lift_html(pfx, 'hero', (16, 56, 358, 232.84), [('c', 'ac-hero.png', True)], radius=20)
body = f'''<div id="ac-kick" class="kicker"><img src="assets/img/who-academy.png" alt=""></div>
<div id="ac-h" class="col h display" style="top:350px;font-size:112px"><span data-layout-allow-overflow class="ln"><span>Squads, staff</span></span><span data-layout-allow-overflow class="ln green"><span>and players.</span></span></div>
<div id="ac-sub" class="col sub" style="top:600px"><span data-layout-allow-overflow class="ln"><span>Verified by Matchday.</span></span><span data-layout-allow-overflow class="ln"><span>Shared with your coaches.</span></span></div>
{phone_html(pfx, screens, lift)}'''
tl.fromto('#ac-kick', {'x': -40, 'opacity': 0}, {'x': 0, 'opacity': 1, 'duration': 0.45, 'ease': 'expo.out'}, 0.0)
tl.fromto('#ac-wrap', {'y': 1100}, {'y': 0, 'duration': 0.7, 'ease': 'back.out(1.1)'}, 0)
tl.lines_in('#ac-h', 0.1, stagger=0.08)
tl.lines_in('#ac-sub', 0.7, stagger=0.08)
tl.fromto('#ac-hero', {'opacity': 0, 'scale': 1, 'x': 0, 'y': 0}, {'opacity': 1, 'scale': 1.22, 'x': -34, 'y': 10, 'duration': 0.45, 'ease': 'back.out(1.5)'}, 1.2)
tl.fromto('#ac-hero-wrap', {'boxShadow': '0 0px 0px rgba(0,0,0,0), 0 0 0 0px rgba(255,255,255,0)'},
          {'boxShadow': '0 26px 64px rgba(0,0,0,0.7), 0 0 0 1.5px rgba(255,255,255,0.12)', 'duration': 0.45}, 1.2)
tl.to('#ac-hero', {'scale': 1, 'x': 0, 'y': 0, 'duration': 0.16, 'ease': 'power2.inOut'}, 2.25)
tl.set('#ac-hero', {'opacity': 0}, 2.42)
tl.finger_at(pfx, 'acPlayers', 2.3)
tl.finger_show(pfx, 2.3)
tl.tap(pfx, 'acPlayers', 2.6)
tl.fromto('#ac-s-players', {'xPercent': 100, 'opacity': 1}, {'xPercent': 0, 'opacity': 1, 'duration': 0.36, 'ease': 'power3.out'}, 2.65)
tl.finger_hide(pfx, 2.75)
tl.lines_out('#ac-h', 3.6)
tl.lines_out('#ac-sub', 3.62)
tl.to('#ac-kick', {'x': -60, 'opacity': 0, 'duration': 0.24, 'ease': 'power3.in'}, 3.6)
body = insert_ripples(body, pfx, tl)
scene_file('academy', 3.9, COL_CSS, body, tl)

# ================================================================ 4. link (11.65 - 14.95): the family says yes
tl = TL()
# two phones side by side, both built on the shared geometry and placed by transform
def place(cx, cy, s):
    return {'x': r(cx - PCX), 'y': r(cy - 600 + s * 60), 'scale': s}


FAM = place(640, 590, 0.8)
ACA = place(1280, 590, 0.8)
fam = phone_html('lf', [('invite', 'family-invite', 1, True), ('consent', 'family-consent', 2, False)],
                 lift_html('lf', 'ok', (32, 447.23, 326, 71.59), [('off', 'consent-off.png', True), ('on', 'consent-on.png', False)], radius=14))
aca = phone_html('la', [('players', 'ac-players', 1, True), ('everyone', 'ac-everyone', 2, False)],
                 f'<div id="la-hl" class="lift" style="left:{r(ax(16))}px;top:{r(ay(77.86))}px;width:{r(358 * S)}px;height:{r(61 * S)}px;'
                 f'border-radius:{r(14 * S)}px;border:3px solid #30d27c;box-shadow:0 0 30px rgba(48,210,124,0.55)"></div>')
css = """
#lk-cap { left: 0; width: 1920px; top: 46px; text-align: center; font-size: 100px; line-height: 1; }
.lk-label { position: absolute; top: 996px; width: 600px; text-align: center; font-family: 'Barlow Condensed'; font-weight: 700; font-size: 38px; letter-spacing: 0.14em; text-transform: uppercase; color: #a1a1a8; }
#lk-svg { left: 0; top: 0; width: 1920px; height: 1080px; }
"""
body = f'''<div id="lk-cap" class="abs display"><span data-layout-allow-overflow class="ln"><span>Families say <span class="green">yes first.</span></span></span></div>
<svg id="lk-svg" class="abs" viewBox="0 0 1920 1080">
<line id="lk-line" x1="836" y1="590" x2="1084" y2="590" stroke="#30d27c" stroke-width="5" stroke-linecap="round" stroke-dasharray="248" stroke-dashoffset="248"/>
<circle id="lk-a" cx="836" cy="590" r="9" fill="#30d27c" opacity="0"/><circle id="lk-b" cx="1084" cy="590" r="9" fill="#30d27c" opacity="0"/>
<circle id="lk-dot" cx="836" cy="590" r="14" fill="#7ff5b3" opacity="0"/>
</svg>
{fam}
{aca}
<div id="lk-l1" class="lk-label" style="left:340px"><span data-layout-allow-overflow class="ln"><span>The family</span></span></div>
<div id="lk-l2" class="lk-label" style="left:980px"><span data-layout-allow-overflow class="ln"><span>The academy</span></span></div>'''
tl.fromto('#la-wrap', {'x': 0, 'y': 0, 'scale': 1}, {**ACA, 'duration': 0.55, 'ease': 'power3.inOut'}, 0)
tl.fromto('#la-s-players', {'yPercent': 0}, {'yPercent': -100, 'duration': 0.4, 'ease': 'power3.inOut'}, 0.3)
tl.fromto('#la-s-everyone', {'yPercent': 100, 'opacity': 1}, {'yPercent': 0, 'opacity': 1, 'duration': 0.4, 'ease': 'power3.inOut'}, 0.3)
tl.fromto('#lf-wrap', {'x': FAM['x'] - 1200, 'y': FAM['y'], 'scale': 0.8}, {**FAM, 'duration': 0.6, 'ease': 'power3.out'}, 0.05)
tl.lines_in('#lk-cap', 0.12, dur=0.5)
tl.lines_in('#lk-l1', 0.6)
tl.lines_in('#lk-l2', 0.66)
# tick consent, then Accept
tl.finger_at('lf', 'consent', 0.7)
tl.finger_show('lf', 0.7)
tl.fromto('#lf-ok', {'opacity': 0, 'scale': 1, 'x': 0}, {'opacity': 1, 'scale': 1.75, 'x': 0, 'duration': 0.4, 'ease': 'back.out(1.5)'}, 0.62)
tl.fromto('#lf-ok-wrap', {'boxShadow': '0 0px 0px rgba(0,0,0,0), 0 0 0 0px rgba(48,210,124,0)'},
          {'boxShadow': '0 22px 56px rgba(0,0,0,0.75), 0 0 0 2px rgba(48,210,124,0.45)', 'duration': 0.42}, 0.62)
tl.tap('lf', 'consent', 1.0)
tl.screen('lf', 'consent', 1.03)
tl.set('#lf-ok-off', {'opacity': 0}, 1.03)
tl.set('#lf-ok-on', {'opacity': 1}, 1.03)
tl.fromto('#lf-ok', {'scale': 1.75}, {'scale': 1.84, 'duration': 0.1, 'ease': 'power2.out'}, 1.03)
tl.fromto('#lf-ok', {'scale': 1.84}, {'scale': 1.75, 'duration': 0.25, 'ease': 'power2.inOut'}, 1.13)
tl.to('#lf-ok', {'scale': 1, 'duration': 0.18, 'ease': 'power2.inOut'}, 1.62)
tl.set('#lf-ok', {'opacity': 0}, 1.8)
tl.finger_move('lf', 'consent', 'accept', 1.4, 0.35)
tl.tap('lf', 'accept', 1.95)
tl.finger_hide('lf', 2.1)
tl.fromto('#lk-a', {'opacity': 0}, {'opacity': 1, 'duration': 0.12}, 2.0)
tl.fromto('#lk-line', {'strokeDashoffset': 248}, {'strokeDashoffset': 0, 'duration': 0.32, 'ease': 'power2.inOut'}, 2.0)
tl.fromto('#lk-dot', {'opacity': 0}, {'opacity': 1, 'duration': 0.08}, 2.02)
tl.fromto('#lk-dot', {'x': 0}, {'x': 248, 'duration': 0.4, 'ease': 'power2.inOut'}, 2.05)
tl.to('#lk-dot', {'opacity': 0, 'duration': 0.12}, 2.42)
tl.fromto('#lk-b', {'opacity': 0}, {'opacity': 1, 'duration': 0.12}, 2.3)
tl.fromto('#la-hl', {'opacity': 0}, {'opacity': 1, 'duration': 0.2}, 2.4)
# leave: the family phone slides away, the academy phone comes back to centre stage for the picks
tl.lines_out('#lk-cap', 2.95)
tl.lines_out('#lk-l1', 2.95)
tl.lines_out('#lk-l2', 2.97)
tl.to('#la-hl', {'opacity': 0, 'duration': 0.15}, 2.92)
tl.to('#lk-svg', {'opacity': 0, 'duration': 0.2}, 2.95)
tl.to('#lf-wrap', {'x': FAM['x'] - 1200, 'duration': 0.33, 'ease': 'power3.in'}, 2.95)
tl.to('#la-wrap', {'x': 0, 'y': 0, 'scale': 1, 'duration': 0.35, 'ease': 'power3.inOut'}, 2.95)
body = insert_ripples(body, 'lf', tl)
scene_file('link', 3.3, css, body, tl)

# ================================================================ 5. picks (14.95 - 20.2)
pfx = 'pk'
tl = TL()
screens = [('everyone', 'ac-everyone', 1, True), ('leaders', 'ac-leaders', 2, False), ('pick', 'ac-pick-open', 3, False), ('table', 'ac-table', 4, False)]
lifts = (lift_html(pfx, 'top', (16, 74, 358, 244), [('c', 'ac-top3.png', True)], radius=14)
         + lift_html(pfx, 'tbl', (16, 244.95, 358, 322.58), [('c', 'ac-table-crop.png', True)], radius=14))
body = f'''<div id="pk-h" class="col h display" style="top:330px;font-size:112px"><span data-layout-allow-overflow class="ln"><span>Pick teams from</span></span><span data-layout-allow-overflow class="ln green"><span>real numbers.</span></span></div>
<div id="pk-sub" class="col sub" style="top:580px"><span data-layout-allow-overflow class="ln"><span>From each player's own Matchday.</span></span></div>
{phone_html(pfx, screens, lifts)}'''
tl.finger_at(pfx, 'statsTab', 0.0)
tl.finger_show(pfx, 0.0, 0.1)
tl.tap(pfx, 'statsTab', 0.15)
tl.fromto('#pk-s-leaders', {'xPercent': 100, 'opacity': 1}, {'xPercent': 0, 'opacity': 1, 'duration': 0.36, 'ease': 'power3.out'}, 0.2)
tl.finger_hide(pfx, 0.3)
tl.lines_in('#pk-h', 0.15, stagger=0.08)
tl.lines_in('#pk-sub', 0.55)
tl.fromto('#pk-top', {'opacity': 0, 'scale': 1, 'x': 0, 'y': 0}, {'opacity': 1, 'scale': 1.3, 'x': -34, 'y': 0, 'duration': 0.45, 'ease': 'back.out(1.5)'}, 0.9)
tl.fromto('#pk-top-wrap', {'boxShadow': '0 0px 0px rgba(0,0,0,0), 0 0 0 0px rgba(255,255,255,0)'},
          {'boxShadow': '0 26px 64px rgba(0,0,0,0.7), 0 0 0 1.5px rgba(255,255,255,0.12)', 'duration': 0.45}, 0.9)
tl.to('#pk-top', {'scale': 1, 'x': 0, 'y': 0, 'duration': 0.16, 'ease': 'power2.inOut'}, 2.05)
tl.set('#pk-top', {'opacity': 0}, 2.22)
tl.fromto('#pk-s-pick', {'yPercent': 100, 'opacity': 1}, {'yPercent': 0, 'opacity': 1, 'duration': 0.38, 'ease': 'power3.out'}, 2.3)
tl.fromto('#pk-s-table', {'xPercent': 100, 'opacity': 1}, {'xPercent': 0, 'opacity': 1, 'duration': 0.36, 'ease': 'power3.out'}, 3.15)
tl.fromto('#pk-tbl', {'opacity': 0, 'scale': 1, 'x': 0, 'y': 0}, {'opacity': 1, 'scale': 1.24, 'x': -34, 'y': 0, 'duration': 0.45, 'ease': 'back.out(1.5)'}, 3.55)
tl.fromto('#pk-tbl-wrap', {'boxShadow': '0 0px 0px rgba(0,0,0,0), 0 0 0 0px rgba(48,210,124,0)'},
          {'boxShadow': '0 26px 64px rgba(0,0,0,0.7), 0 0 0 1.5px rgba(48,210,124,0.35)', 'duration': 0.45}, 3.55)
tl.lines_out('#pk-h', 4.95)
tl.lines_out('#pk-sub', 4.97)
tl.to('#pk-tbl', {'opacity': 0, 'duration': 0.15}, 4.93)
tl.to('#pk-wrap', {'y': 1150, 'duration': 0.3, 'ease': 'power3.in'}, 4.95)
body = insert_ripples(body, pfx, tl)
scene_file('picks', 5.25, COL_CSS, body, tl)

# ================================================================ 6. outro (20.2 - 24.5)
tl = TL()
css = """
#ou-pitch { left: 0; top: 0; width: 1920px; height: 1080px; }
#ou-logo { left: 840px; top: 250px; width: 240px; height: 240px; }
#ou-word { left: 0; width: 1920px; top: 590px; text-align: center; font-size: 190px; line-height: 0.9; }
#ou-tag { left: 0; width: 1920px; top: 790px; text-align: center; font-size: 52px; font-weight: 600; letter-spacing: -0.015em; }
#ou-cta { left: 0; width: 1920px; top: 880px; text-align: center; font-size: 34px; font-weight: 500; color: #a1a1a8; }
#ou-cta .dot { color: #30d27c; padding: 0 14px; }
"""
CIRC = 2 * 3.14159265 * 205
body = f'''<svg id="ou-pitch" class="abs" viewBox="0 0 1920 1080">
<line id="ou-line" x1="0" y1="370" x2="1920" y2="370" stroke="rgba(255,255,255,0.18)" stroke-width="4"/>
<circle id="ou-circle" cx="960" cy="370" r="205" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="4" stroke-dasharray="{r(CIRC)}" stroke-dashoffset="{r(CIRC)}" transform="rotate(-90 960 370)"/>
</svg>
<div id="ou-logo" class="abs">{logo_svg('oulogo', 240)}</div>
<div id="ou-word" class="abs display"><span data-layout-allow-overflow class="ln"><span>Matchday</span></span></div>
<div id="ou-tag" class="abs"><span data-layout-allow-overflow class="ln"><span>For the player. <span class="green">For the academy.</span></span></span></div>
<div id="ou-cta" class="abs"><span data-layout-allow-overflow class="ln"><span>Runs in your phone's browser<span class="dot">·</span>Works with no signal</span></span></div>'''
tl.fromto('#ou-logo', {'scale': 0.4, 'rotation': -40, 'opacity': 0}, {'scale': 1, 'rotation': 0, 'opacity': 1, 'duration': 0.5, 'ease': 'back.out(1.8)'}, 0.33)
tl.fromto('#oulogo-halo', {'opacity': 1}, {'opacity': 0.55, 'duration': 1.2, 'ease': 'power2.out'}, 0.55)
tl.fromto('#ou-circle', {'strokeDashoffset': r(CIRC)}, {'strokeDashoffset': 0, 'duration': 0.8, 'ease': 'power2.inOut'}, 0.3)
tl.fromto('#ou-line', {'scaleX': 0, 'transformOrigin': '50% 50%'}, {'scaleX': 1, 'transformOrigin': '50% 50%', 'duration': 0.7, 'ease': 'power2.inOut'}, 0.3)
tl.lines_in('#ou-word', 0.45, dur=0.5)
tl.lines_in('#ou-tag', 1.02, dur=0.45)
tl.lines_in('#ou-cta', 1.3, dur=0.45)
scene_file('outro', 4.3, css, body, tl)

# ================================================================ background (0 - TOTAL): glow + centre circle
tl = TL()
css = """
#bg-ground { left: 0; top: 0; width: 1920px; height: 1080px; background: #000; }
#bg-glow { left: 510px; top: -340px; width: 1800px; height: 1800px; opacity: 0; }
#bg-glow-in { width: 100%; height: 100%; border-radius: 50%;
  background: radial-gradient(closest-side, rgba(48,210,124,0.22), rgba(48,210,124,0.08) 45%, rgba(48,210,124,0) 100%); }
#bg-circle { left: 940px; top: 70px; width: 940px; height: 940px; border-radius: 50%; border: 4px solid rgba(255,255,255,1); opacity: 0; }
"""
body = '<div id="bg-ground" class="abs"></div><div id="bg-circle" class="abs"></div><div id="bg-glow" class="abs"><div id="bg-glow-in"></div></div>'
tl.fromto('#bg-glow', {'opacity': 0}, {'opacity': 1, 'duration': 0.8, 'ease': 'power2.out'}, 3.6)
tl.fromto('#bg-circle', {'opacity': 0}, {'opacity': 0.08, 'duration': 0.8, 'ease': 'power2.out'}, 3.6)
tl.fromto('#bg-glow', {'x': 0, 'y': 0, 'scale': 1}, {'x': -450, 'y': 40, 'scale': 1.2, 'duration': 0.55, 'ease': 'power3.inOut'}, 11.65)
tl.fromto('#bg-circle', {'x': 0, 'y': 0, 'scale': 1}, {'x': -450, 'y': 50, 'scale': 1.05, 'duration': 0.55, 'ease': 'power3.inOut'}, 11.65)
tl.fromto('#bg-glow', {'x': -450, 'y': 40, 'scale': 1.2}, {'x': 0, 'y': 0, 'scale': 1, 'duration': 0.35, 'ease': 'power3.inOut'}, 14.6)
tl.fromto('#bg-circle', {'x': -450, 'y': 50, 'scale': 1.05}, {'x': 0, 'y': 0, 'scale': 1, 'duration': 0.35, 'ease': 'power3.inOut'}, 14.6)
tl.to('#bg-circle', {'opacity': 0, 'duration': 0.3}, 19.95)
tl.fromto('#bg-glow', {'x': 0, 'y': 0, 'scale': 1}, {'x': -450, 'y': -190, 'scale': 0.75, 'duration': 0.7, 'ease': 'power2.inOut'}, 19.95)
audio = json.load(open('work/audio-data.json'))
bass = [(f['bands'][0] + f['bands'][1]) / 2 for f in audio['frames']]
lo, hi = sorted(bass)[int(len(bass) * 0.1)], sorted(bass)[int(len(bass) * 0.95)]
t = 3.65
while t < TOTAL - 0.05:
    v = max(bass[int(t * 30):int((t + 0.1) * 30) + 1])
    n = max(0.0, min(1.0, (v - lo) / (hi - lo)))
    tl.to('#bg-glow-in', {'opacity': r(0.72 + 0.28 * n), 'scale': r(1 + 0.035 * n), 'duration': 0.1, 'ease': 'none'}, t)
    t = round(t + 0.1, 2)
scene_file('bg', TOTAL, css, body, tl)

# ================================================================ root: scenes, voice, music, effects
SFX = [  # file, start, volume
    ('impact/impactSoft_heavy_003', 0.28, 0.6),
    ('interface/drop_001', 0.95, 0.5), ('interface/drop_002', 1.15, 0.5),
    ('interface/click_002', 2.85, 0.6),
    ('impact/impactSoft_medium_002', 3.6 + 0.45, 0.4),
    ('interface/bong_001', 3.6 + 1.55, 0.45),
    ('interface/drop_002', 7.75 + 1.2, 0.45),
    ('interface/click_005', 7.75 + 2.6, 0.6),
    ('casino/card-slide-1', 11.65 + 0.05, 0.35),
    ('interface/switch_002', 11.65 + 1.0, 0.5),
    ('interface/click_003', 11.65 + 1.95, 0.6),
    ('interface/bong_001', 11.65 + 2.4, 0.45),
    ('interface/click_005', 14.95 + 0.15, 0.55),
    ('interface/drop_001', 14.95 + 0.9, 0.45),
    ('casino/card-slide-1', 14.95 + 2.3, 0.3),
    ('interface/click_002', 14.95 + 3.15, 0.5),
    ('interface/drop_002', 14.95 + 3.55, 0.45),
    ('impact/impactBell_heavy_000', 20.2 + 0.36, 0.55),
]
MASTER = 0.85
music_lane = {'version': 1, 'lanes': [{'target': 'volume', 'points': [
    {'t': 0, 'v': 1}, {'t': 0.25, 'v': 0.33}, {'t': 22.75, 'v': 0.33}, {'t': 23.05, 'v': 0.85}]}]}
audio_tags = [
    f'<audio id="music" data-start="0" data-duration="{TOTAL}" data-track-index="10" data-volume="{r(0.45 * MASTER)}" data-fade-out="0.4" '
    f'data-automation="{json.dumps(music_lane).replace(chr(34), "&quot;")}" src="assets/music/happy-beats-business-moves-vol-1-by-ende-dot-app.mp3"></audio>']
for vid, st, d in VO:
    audio_tags.append(f'<audio id="{vid}" data-start="{st}" data-duration="{d}" data-track-index="3" data-volume="{r(MASTER)}" src="assets/vo/{vid}.wav"></audio>')
for i, (f, st, vol) in enumerate(SFX):
    audio_tags.append(f'<audio id="sfx{i}" data-start="{r(st)}" data-track-index="{11 + i}" data-volume="{r(vol * MASTER)}" src="assets/sfx/{f}.ogg"></audio>')

hosts = [f'<div id="bg" data-composition-id="bg" data-composition-src="compositions/bg.html" data-start="0" data-duration="{TOTAL}" data-track-index="0" data-track-kind="graphics" data-width="1920" data-height="1080" style="z-index:0"></div>']
for z, (cid, st, en) in enumerate(SCENES, start=1):
    hosts.append(f'<div id="{cid}" data-composition-id="{cid}" data-composition-src="compositions/{cid}.html" data-start="{st}" data-duration="{r(en - st)}" '
                 f'data-track-index="{1 if z % 2 else 2}" data-track-kind="graphics" data-width="1920" data-height="1080" style="z-index:{z}"></div>')

variables = [
    {"id": "color-ground", "type": "color", "label": "Background", "default": "#000000"},
    {"id": "color-ink", "type": "color", "label": "Text", "default": "#f2f2f7"},
    {"id": "color-accent", "type": "color", "label": "Accent", "default": "#30d27c"},
    {"id": "font-display", "type": "string", "label": "Display font", "default": "Barlow Condensed"},
]
index = f'''<!doctype html>
<html lang="en" data-composition-variables='{json.dumps(variables)}'>
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1920, height=1080" />
<script src="assets/vendor/gsap.min.js"></script>
<style>
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
html, body {{ margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #000; }}
#root {{ width: 100%; height: 100%; position: relative; }}
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="{TOTAL}" data-width="1920" data-height="1080">
{chr(10).join(hosts)}
{chr(10).join(audio_tags)}
</div>
<script>
window.__timelines = window.__timelines || {{}};
window.__timelines["main"] = gsap.timeline({{ paused: true }});
</script>
</body>
</html>
'''
with open(f'{OUT}/index.html', 'w') as f:
    f.write(index)
print('wrote', OUT)
