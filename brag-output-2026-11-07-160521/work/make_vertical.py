"""Derives work/build_vertical.py (1080x1920, for Reels) from work/build.py (1920x1080).

Same scenes, timings, voice, music and effects; only the layout moves: headlines on top, the phone
below, everything inside Instagram's safe area (clear of the top bar and the caption/buttons at the bottom).
Run from brag-output-2026-11-07-160521/:  python3 work/make_vertical.py && python3 work/build_vertical.py
"""
import re

src = open('work/build.py').read()


def sub(text, a, b, count=1):
    assert a in text, f'missing: {a[:70]}'
    return text.replace(a, b, count)


# ---------------------------------------------------------------- canvas, phone geometry, shared css
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

blocks = re.split(r'\n(?=# ================================================================ )', s)
by = {b.split('\n', 1)[0].replace('# ================================================================ ', ''): i for i, b in enumerate(blocks)}


def edit(key, fn):
    i = next(i for k, i in by.items() if k.startswith(key))
    blocks[i] = fn(blocks[i])


# ---------------------------------------------------------------- 1. hook: the 0 on top, the lines under it
def hook(b):
    b = sub(b, "#hk-zero { left: 100px; top: 70px; width: 700px; height: 940px; text-align: center; }",
            "#hk-zero { left: 0; top: 215px; width: 1080px; text-align: center; }")
    b = sub(b, "font-size: 860px; line-height: 0.86;", "font-size: 560px; line-height: 0.86;")
    b = sub(b, "#hk-lines { left: 755px; top: 222px; font-size: 150px; line-height: 0.9; }",
            "#hk-lines { left: 0; width: 1080px; top: 800px; font-size: 138px; line-height: 0.9; text-align: center; }")
    b = sub(b, "tl.to('#hk-zero', {'x': -160, 'opacity': 0,", "tl.to('#hk-zero', {'y': -120, 'opacity': 0,")
    return b


edit('1. hook', hook)


def col(b):
    b = sub(b, ".brand { top: 236px; display: flex; align-items: center; gap: 22px; }",
            ".brand { top: 205px; display: flex; justify-content: center; align-items: center; gap: 16px; }")
    b = sub(b, ".brand .word { font-size: 104px; line-height: 1; padding-top: 6px; }", ".brand .word { font-size: 76px; line-height: 1; padding-top: 4px; }")
    b = sub(b, ".h2 { top: 380px; font-size: 104px; line-height: 0.92; }", ".h2 { top: 312px; font-size: 84px; line-height: 0.92; }")
    b = sub(b, ".cap { top: 712px; font-size: 40px;", ".cap { top: 562px; font-size: 34px;")
    b = sub(b, ".h3 { top: 300px; font-size: 156px; line-height: 0.9; }", ".h3 { top: 228px; font-size: 128px; line-height: 0.9; }")
    b = sub(b, ".sub { font-size: 40px;", ".sub { font-size: 36px;")
    return b


edit('shared left-column css', col)


def reveal(b):
    b = sub(b, "logo_svg('rvlogo', 96)", "logo_svg('rvlogo', 64)")
    b = sub(b, "tl.fromto('#rv-wrap', {'y': 1100}", "tl.fromto('#rv-wrap', {'y': 1350}")
    return b


edit('2. reveal', reveal)


def saves(b):
    b = sub(b, 'class="col sub" style="top:600px;width:640px"', 'class="col sub" style="top:476px"')
    b = sub(b, "{'scale': 1.08, 'y': -30, 'duration': 0.6", "{'scale': 1.05, 'y': 0, 'duration': 0.6")
    return b


edit('3. saves', saves)


def breakdown(b):
    b = sub(b, 'class="col h3 display" style="font-size:150px"', 'class="col h3 display" style="font-size:124px"')
    b = sub(b, 'class="col sub" style="top:600px"', 'class="col sub" style="top:476px"')
    b = sub(b, "{'opacity': 1, 'scale': 1.65, 'x': -20, 'y': -6,", "{'opacity': 1, 'scale': 1.65, 'x': 0, 'y': -6,")
    return b


edit('4. breakdown', breakdown)


def paste(b):
    # the chat bubble sits over the lower half of the phone, then flies up into the paste box
    b = sub(b, "#ps-bubble { left: 240px; top: 500px; width: 680px; transform-origin: 50% 50%; opacity: 0; }",
            "#ps-bubble { left: 90px; top: 1120px; width: 900px; transform-origin: 50% 50%; opacity: 0; z-index: 20; }")
    b = sub(b, "#ps-bubble .msg { font-size: 34px;", "#ps-bubble .msg { font-size: 33px;")
    b = sub(b, 'class="col display" style="top:150px;font-size:112px;line-height:0.92"', 'class="col display" style="top:228px;font-size:100px;line-height:0.92"')
    b = sub(b, 'class="col sub" style="top:380px"', 'class="col sub" style="top:430px"')
    b = sub(b, "BX, BY = 240 + 340, 500 + 140", "BX, BY = 90 + 450, 1120 + 125")
    b = sub(b, "{'opacity': 1, 'scale': 1.58, 'x': -30, 'duration'", "{'opacity': 1, 'scale': 1.58, 'x': 0, 'duration'")
    b = sub(b, "tl.to('#ps-wrap', {'y': 1150,", "tl.to('#ps-wrap', {'y': 1400,")
    return b


edit('5. paste', paste)


def wrapped(b):
    b = sub(b, "WS, WBZ = 0.8, 11", "WS, WBZ = 0.62, 11")
    b = sub(b, "WRAPS = [('w-3', 590, 655, -8, 0.05, 1.0), ('w-7', 1330, 655, 8, 0.3, 1.0), ('w-4', 960, 640, 0, 0.55, 1.06)]",
            "WRAPS = [('w-3', 255, 1010, -8, 0.05, 1.0), ('w-7', 825, 1010, 8, 0.3, 1.0), ('w-4', 540, 985, 0, 0.55, 1.12)]")
    b = sub(b, "{'y': 900, 'rotation': rot * 2.2,", "{'y': 1100, 'rotation': rot * 2.2,")
    b = sub(b, "tl.to(f'#wr-p{i}', {'y': 1000,", "tl.to(f'#wr-p{i}', {'y': 1300,")
    b = sub(b, '"#wr-title { left: 0; width: 1920px; top: 66px; text-align: center; font-size: 110px; line-height: 1; }\\n#wr-title .ln { display: inline-block; vertical-align: top; }"',
            '"#wr-title { left: 0; width: 1080px; top: 228px; text-align: center; font-size: 88px; line-height: 1; }"')
    b = sub(b, "<span>Your year on the pitch,&nbsp;</span>", "<span>Your year on the pitch,</span>")
    return b


edit('6. wrapped', wrapped)


def outro(b):
    b = sub(b, "#ou-pitch { left: 0; top: 0; width: 1920px; height: 1080px; }", "#ou-pitch { left: 0; top: 0; width: 1080px; height: 1920px; }")
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
    return b


edit('7. outro', outro)


def background(b):
    b = sub(b, "#bg-ground { left: 0; top: 0; width: 1920px; height: 1080px; background: #000; }", "#bg-ground { left: 0; top: 0; width: 1080px; height: 1920px; background: #000; }")
    b = sub(b, "#bg-glow { left: 510px; top: -340px;", "#bg-glow { left: -360px; top: 150px;")
    b = sub(b, "#bg-circle { left: 940px; top: 70px; width: 940px; height: 940px;", "#bg-circle { left: 110px; top: 622px; width: 860px; height: 860px;")
    b = sub(b, "{'x': -450, 'y': 60, 'scale': 1.15, 'duration': 0.8, 'ease': 'power2.inOut'}, 18.85)", "{'x': 0, 'y': -70, 'scale': 1.15, 'duration': 0.8, 'ease': 'power2.inOut'}, 18.85)")
    b = sub(b, "{'x': -450, 'y': 100, 'scale': 1.19, 'duration': 0.8, 'ease': 'power2.inOut'}, 18.85)", "{'x': 0, 'y': -60, 'scale': 1.1, 'duration': 0.8, 'ease': 'power2.inOut'}, 18.85)")
    b = sub(b, "tl.fromto('#bg-glow', {'x': -450, 'y': 60, 'scale': 1.15}, {'x': -450, 'y': -190, 'scale': 0.75,",
            "tl.fromto('#bg-glow', {'x': 0, 'y': -70, 'scale': 1.15}, {'x': 0, 'y': -292, 'scale': 0.75,")
    return b


edit('background', background)

out = '\n'.join(blocks)
out = out.replace('Run from brag-output-2026-11-07-160521/:  python3 work/build.py', 'Generated by work/make_vertical.py; run from brag-output-2026-11-07-160521/:  python3 work/build_vertical.py')
open('work/build_vertical.py', 'w').write(out)
print('wrote work/build_vertical.py')
