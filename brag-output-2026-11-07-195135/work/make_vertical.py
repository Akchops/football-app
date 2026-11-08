"""Derives work/build_vertical.py (1080x1920, for Reels) from work/build.py (1920x1080).

Same scenes, timings, voice, music and effects. The layout moves for portrait (headlines on top, the phone
below, everything inside Instagram's safe area), and it uses the new Matchday logo from docs/brand on
claude/bold-bell-mv7bmj: flat panels, no glow on the mark, the lit panel never turned.
Run from brag-output-2026-11-07-195135/:  python3 work/make_vertical.py && python3 work/build_vertical.py
"""
import re

src = open('work/build.py').read()


def sub(text, a, b, count=1):
    assert a in text, f'missing: {a[:80]}'
    return text.replace(a, b, count)


s = src
s = sub(s, "OUT = 'composition'", "OUT = 'composition-vertical'")
s = sub(s, ".col { position: absolute; left: 240px; width: 760px; }", ".col { position: absolute; left: 60px; width: 960px; text-align: center; }")
s = sub(s, "S, SB, BZ = 1.054, 42, 14", "S, SB, BZ = 0.93, 42, 14")
s = sub(s, "PCX, PCY = 1410, 540", "PCX, PCY = 540, 1052.5  # phone top at 625, bottom at 1480")
s = sub(s, 'style="left:0;top:0;width:1920px;height:1080px;transform-origin:{PCX}px 600px"',
        'style="left:0;top:0;width:1080px;height:1920px;transform-origin:{PCX}px {r(PY + PH)}px"')
s = s.replace('data-width="1920" data-height="1080"', 'data-width="1080" data-height="1920"')
s = s.replace('width: 1920px; height: 1080px', 'width: 1080px; height: 1920px')
s = s.replace('content="width=1920, height=1080"', 'content="width=1080, height=1920"')

# ---------------------------------------------------------------- the new Matchday logo (docs/brand/logo/symbol.svg)
NEW_LOGO = """
# The new mark, from docs/brand/logo/symbol.svg on claude/bold-bell-mv7bmj: flat greys, the lit panel top right.
LOGO_PATHS = [
    ('M227.24,90.02L191.05,40.22L132.50,21.19L132.50,55.49L194.62,100.62Z', '#30D27C'),
    ('M25.98,160.15L62.17,209.95L82.33,182.21L58.60,109.18L25.98,98.58Z', '#35393E'),
    ('M173.67,182.21L193.83,209.95L230.02,160.15L230.02,98.58L197.40,109.18Z', '#2A2E32'),
    ('M186.55,215.24L166.39,187.50L89.61,187.50L69.45,215.24L128.00,234.27Z', '#2A2E32'),
    ('M128.00,63.34L67.46,107.33L90.58,178.50L165.42,178.50L188.54,107.33Z', '#35393E'),
    ('M61.38,100.62L123.50,55.49L123.50,21.19L64.95,40.22L28.76,90.02Z', '#3B3F45'),
]


def logo_svg(uid, size):
    paths = ''.join(f'<path d="{d}" fill="{f}"/>' for d, f in LOGO_PATHS)
    return f'<svg viewBox="22 21.7 212 212" width="{size}" height="{size}" style="display:block">{paths}</svg>'
"""
s = sub(s, "\n# ---------------------------------------------------------------- phone geometry", NEW_LOGO + "\n# ---------------------------------------------------------------- phone geometry")
s = sub(s, "letter-spacing: -0.005em; }", "letter-spacing: -0.005em; }\n.wordmark { letter-spacing: 0.02em; }")

blocks = re.split(r'\n(?=# ================================================================ )', s)
by = {b.split('\n', 1)[0].replace('# ================================================================ ', ''): i for i, b in enumerate(blocks)}


def edit(key, fn):
    i = next(i for k, i in by.items() if k.startswith(key))
    blocks[i] = fn(blocks[i])


def this_run(b):
    b = sub(b, ".kicker { position: absolute; left: 240px; top: 150px; width: 470px; border-radius: 22px; overflow: hidden; }",
            ".kicker { position: absolute; left: 280px; top: 214px; width: 520px; border-radius: 22px; overflow: hidden; }")
    b = sub(b, ".h { font-size: 104px; line-height: 0.92; }", ".h { font-size: 80px; line-height: 0.92; }")
    b = sub(b, ".sub { font-size: 40px;", ".sub { font-size: 36px;")
    b = sub(b, "WHO_W = 600", "WHO_W = 900")
    return b


edit('this run', this_run)


def hook(b):
    # stacked cards under a two-line question
    b = sub(b, "#hk-brand {{ left: 0; width: 1920px; top: 92px;", "#hk-brand {{ left: 0; width: 1080px; top: 215px;")
    b = sub(b, "#hk-title {{ left: 0; width: 1920px; top: 190px; text-align: center; font-size: 200px; line-height: 1; }}",
            "#hk-title {{ left: 0; width: 1080px; top: 300px; text-align: center; font-size: 176px; line-height: 0.95; }}")
    b = sub(b, ".who {{ position: absolute; top: 560px; width: {WHO_W}px;", ".who {{ position: absolute; width: {WHO_W}px;")
    b = sub(b, "#hk-player {{ left: 336px; }}", "#hk-player {{ left: 90px; top: 740px; }}")
    b = sub(b, "#hk-academy {{ left: 984px; }}", "#hk-academy {{ left: 90px; top: 1030px; }}")
    b = sub(b, '''<div id="hk-title" class="abs display"><span data-layout-allow-overflow class="ln"><span>Who's this <span class="green">for?</span></span></span></div>''',
            '''<div id="hk-title" class="abs display"><span data-layout-allow-overflow class="ln"><span>Who's this</span></span><span data-layout-allow-overflow class="ln green"><span>for?</span></span></div>''')
    b = sub(b, '<span data-layout-allow-overflow class="ln word"><span>Matchday</span></span>', '<span data-layout-allow-overflow class="ln word wordmark"><span>Matchday</span></span>')
    b = sub(b, "CX, CY = 336 + WHO_W / 2, 560 + WHO_PH / 2", "CX, CY = 90 + WHO_W / 2, 740 + WHO_PH / 2")
    b = sub(b, "{'x': 240 - 336, 'y': 150 - 560, 'scale': r(470 / WHO_W),", "{'x': 280 - 90, 'y': 214 - 740, 'scale': r(520 / WHO_W),")
    b = sub(b, "tl.to('#hk-academy', {'y': 40, 'opacity': 0,", "tl.to('#hk-academy', {'y': 60, 'opacity': 0,")
    return b


edit('1. hook', hook)


def player(b):
    b = sub(b, 'id="pl-h" class="col h display" style="top:330px"', 'id="pl-h" class="col h display" style="top:388px"')
    # the kicker card already says "works on this phone with no account", so portrait drops the repeat
    b = re.sub(r'\n<div id="pl-sub"[^\n]*</div>', '', b)
    b = sub(b, "tl.lines_in('#pl-sub', 0.55)\n", "")
    b = sub(b, "tl.lines_out('#pl-sub', 3.82)\n", "")
    b = sub(b, "tl.fromto('#pl-wrap', {'y': 1100}", "tl.fromto('#pl-wrap', {'y': 1350}")
    b = sub(b, "tl.to('#pl-wrap', {'y': 1150,", "tl.to('#pl-wrap', {'y': 1400,")
    return b


edit('2. player', player)


def academy(b):
    b = sub(b, 'id="ac-h" class="col h display" style="top:350px;font-size:112px"', 'id="ac-h" class="col h display" style="top:408px;font-size:96px"')
    b = re.sub(r'\n<div id="ac-sub"[^\n]*</div>', '', b)
    b = sub(b, "tl.lines_in('#ac-sub', 0.7, stagger=0.08)\n", "")
    b = sub(b, "tl.lines_out('#ac-sub', 3.62)\n", "")
    b = sub(b, "{'opacity': 1, 'scale': 1.22, 'x': -34, 'y': 10,", "{'opacity': 1, 'scale': 1.22, 'x': 0, 'y': 10,")
    b = sub(b, "tl.fromto('#ac-wrap', {'y': 1100}", "tl.fromto('#ac-wrap', {'y': 1350}")
    return b


edit('3. academy', academy)


def link(b):
    b = sub(b, "    return {'x': r(cx - PCX), 'y': r(cy - 600 + s * 60), 'scale': s}",
            "    oy = PY + PH  # the wrapper's transform origin\n    return {'x': r(cx - PCX), 'y': r(cy - oy - s * (PCY - oy)), 'scale': s}")
    b = sub(b, "FAM = place(640, 590, 0.8)", "FAM = place(285, 905, 0.6)")
    b = sub(b, "ACA = place(1280, 590, 0.8)", "ACA = place(795, 905, 0.6)")
    b = sub(b, "#lk-cap { left: 0; width: 1920px; top: 46px; text-align: center; font-size: 100px; line-height: 1; }",
            "#lk-cap { left: 0; width: 1080px; top: 228px; text-align: center; font-size: 104px; line-height: 0.95; }")
    b = sub(b, '''<span data-layout-allow-overflow class="ln"><span>Families say <span class="green">yes first.</span></span></span>''',
            '''<span data-layout-allow-overflow class="ln"><span>Families say</span></span><span data-layout-allow-overflow class="ln green"><span>yes first.</span></span>''')
    b = sub(b, ".lk-label { position: absolute; top: 996px; width: 600px;", ".lk-label { position: absolute; top: 1188px; width: 460px;")
    b = sub(b, "font-size: 38px; letter-spacing: 0.14em;", "font-size: 32px; letter-spacing: 0.14em;")
    b = sub(b, 'class="lk-label" style="left:340px"', 'class="lk-label" style="left:55px"')
    b = sub(b, 'class="lk-label" style="left:980px"', 'class="lk-label" style="left:565px"')
    b = sub(b, 'viewBox="0 0 1920 1080"', 'viewBox="0 0 1080 1920"')
    b = sub(b, 'x1="836" y1="590" x2="1084" y2="590"', 'x1="414" y1="905" x2="666" y2="905"')
    b = sub(b, 'stroke-dasharray="248" stroke-dashoffset="248"', 'stroke-dasharray="252" stroke-dashoffset="252"')
    b = sub(b, '<circle id="lk-a" cx="836" cy="590"', '<circle id="lk-a" cx="414" cy="905"')
    b = sub(b, '<circle id="lk-b" cx="1084" cy="590"', '<circle id="lk-b" cx="666" cy="905"')
    b = sub(b, '<circle id="lk-dot" cx="836" cy="590"', '<circle id="lk-dot" cx="414" cy="905"')
    b = sub(b, "{'strokeDashoffset': 248}, {'strokeDashoffset': 0,", "{'strokeDashoffset': 252}, {'strokeDashoffset': 0,")
    b = sub(b, "{'x': 0}, {'x': 248, 'duration': 0.4,", "{'x': 0}, {'x': 252, 'duration': 0.4,")
    # the phones are small in portrait, so the consent line lifts out bigger to stay readable
    b = sub(b, "{'opacity': 1, 'scale': 1.75, 'x': 0, 'duration': 0.4,", "{'opacity': 1, 'scale': 2.9, 'x': 40, 'duration': 0.4,")
    b = sub(b, "tl.fromto('#lf-ok', {'scale': 1.75}, {'scale': 1.84,", "tl.fromto('#lf-ok', {'scale': 2.9}, {'scale': 3.0,")
    b = sub(b, "tl.fromto('#lf-ok', {'scale': 1.84}, {'scale': 1.75,", "tl.fromto('#lf-ok', {'scale': 3.0}, {'scale': 2.9,")
    b = sub(b, "tl.to('#lf-ok', {'scale': 1, 'duration': 0.18,", "tl.to('#lf-ok', {'scale': 1, 'x': 0, 'duration': 0.18,")
    return b


edit('4. link', link)


def picks(b):
    b = sub(b, 'id="pk-h" class="col h display" style="top:330px;font-size:112px"', 'id="pk-h" class="col h display" style="top:228px;font-size:104px"')
    b = sub(b, 'id="pk-sub" class="col sub" style="top:580px"', 'id="pk-sub" class="col sub" style="top:446px"')
    b = sub(b, "{'opacity': 1, 'scale': 1.3, 'x': -34, 'y': 0,", "{'opacity': 1, 'scale': 1.3, 'x': 0, 'y': 0,")
    b = sub(b, "{'opacity': 1, 'scale': 1.24, 'x': -34, 'y': 0,", "{'opacity': 1, 'scale': 1.24, 'x': 0, 'y': 0,")
    b = sub(b, "tl.to('#pk-wrap', {'y': 1150,", "tl.to('#pk-wrap', {'y': 1400,")
    return b


edit('5. picks', picks)


def outro(b):
    b = sub(b, "#ou-logo { left: 840px; top: 250px; width: 240px; height: 240px; }", "#ou-logo { left: 410px; top: 630px; width: 260px; height: 260px; }")
    b = sub(b, "#ou-word { left: 0; width: 1920px; top: 590px; text-align: center; font-size: 190px; line-height: 0.9; }",
            "#ou-word { left: 0; width: 1080px; top: 1010px; text-align: center; font-size: 180px; line-height: 0.9; }")
    b = sub(b, "#ou-tag { left: 0; width: 1920px; top: 790px;", "#ou-tag { left: 0; width: 1080px; top: 1200px;")
    b = sub(b, "#ou-cta { left: 0; width: 1920px; top: 880px; text-align: center; font-size: 34px;",
            "#ou-cta { left: 0; width: 1080px; top: 1285px; text-align: center; font-size: 31px;")
    b = sub(b, "CIRC = 2 * 3.14159265 * 205", "CIRC = 2 * 3.14159265 * 225")
    b = sub(b, 'viewBox="0 0 1920 1080"', 'viewBox="0 0 1080 1920"')
    b = sub(b, 'x1="0" y1="370" x2="1920" y2="370"', 'x1="0" y1="760" x2="1080" y2="760"')
    b = sub(b, 'cx="960" cy="370" r="205"', 'cx="540" cy="760" r="225"')
    b = sub(b, 'transform="rotate(-90 960 370)"', 'transform="rotate(-90 540 760)"')
    b = sub(b, "logo_svg('oulogo', 240)", "logo_svg('oulogo', 260)")
    b = sub(b, 'id="ou-word" class="abs display"', 'id="ou-word" class="abs display wordmark"')
    b = sub(b, "tl.fromto('#oulogo-halo', {'opacity': 1}, {'opacity': 0.55, 'duration': 1.2, 'ease': 'power2.out'}, 0.55)\n", "")
    b = sub(b, "{'scale': 0.4, 'rotation': -40, 'opacity': 0}, {'scale': 1, 'rotation': 0, 'opacity': 1, 'duration': 0.5, 'ease': 'back.out(1.8)'}",
            "{'scale': 0.5, 'opacity': 0}, {'scale': 1, 'opacity': 1, 'duration': 0.55, 'ease': 'back.out(1.6)'}")
    return b


edit('6. outro', outro)


def background(b):
    b = sub(b, "#bg-glow { left: 510px; top: -340px;", "#bg-glow { left: -360px; top: 152px;")
    b = sub(b, "#bg-circle { left: 940px; top: 70px; width: 940px; height: 940px;", "#bg-circle { left: 110px; top: 622px; width: 860px; height: 860px;")
    b = sub(b, "{'x': -450, 'y': 40, 'scale': 1.2, 'duration': 0.55, 'ease': 'power3.inOut'}, 11.65)", "{'x': 0, 'y': -147, 'scale': 1.2, 'duration': 0.55, 'ease': 'power3.inOut'}, 11.65)")
    b = sub(b, "{'x': -450, 'y': 50, 'scale': 1.05, 'duration': 0.55, 'ease': 'power3.inOut'}, 11.65)", "{'x': 0, 'y': -147, 'scale': 1.05, 'duration': 0.55, 'ease': 'power3.inOut'}, 11.65)")
    b = sub(b, "tl.fromto('#bg-glow', {'x': -450, 'y': 40, 'scale': 1.2}, {'x': 0, 'y': 0, 'scale': 1,", "tl.fromto('#bg-glow', {'x': 0, 'y': -147, 'scale': 1.2}, {'x': 0, 'y': 0, 'scale': 1,")
    b = sub(b, "tl.fromto('#bg-circle', {'x': -450, 'y': 50, 'scale': 1.05}, {'x': 0, 'y': 0, 'scale': 1,", "tl.fromto('#bg-circle', {'x': 0, 'y': -147, 'scale': 1.05}, {'x': 0, 'y': 0, 'scale': 1,")
    b = sub(b, "{'x': -450, 'y': -190, 'scale': 0.75, 'duration': 0.7, 'ease': 'power2.inOut'}, 19.95)", "{'x': 0, 'y': -292, 'scale': 0.75, 'duration': 0.7, 'ease': 'power2.inOut'}, 19.95)")
    # brand rule: no glow on the logo, so the glow leaves before the logo lands
    b = sub(b, "scene_file('bg', TOTAL, css, body, tl)", "tl.to('#bg-glow', {'opacity': 0, 'duration': 0.45, 'ease': 'power2.out'}, 20.05)\nscene_file('bg', TOTAL, css, body, tl)")
    return b


edit('background', background)

out = '\n'.join(blocks)
out = out.replace('Run from brag-output-2026-11-07-195135/:  python3 work/build.py', 'Generated by work/make_vertical.py; run from brag-output-2026-11-07-195135/:  python3 work/build_vertical.py')
open('work/build_vertical.py', 'w').write(out)
print('wrote work/build_vertical.py')
