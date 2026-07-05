#!/usr/bin/env python3
"""Assemble /tmp/wwsgif frame pairs into docs/screenshots/collaboration.gif.

Each frame composites the two sessions side by side under "USER 1" / "USER 2"
captions, separated by a thin divider.
"""
import json
from pathlib import Path
from PIL import Image, ImageDraw

frames_meta = json.loads(Path("/tmp/wwsgif/frames.json").read_text())

PANE_W = 440  # each session pane, downscaled for README weight
GAP = 4
CAPTION_H = 22
BG = (11, 11, 11)
DIVIDER = (58, 58, 58)
CAPTIONS = ("USER 1", "USER 2")
CAPTION_FG = ((255, 176, 0), (51, 255, 51))  # match the peer-cursor palette

images, durations = [], []
for f in frames_meta:
    panes = []
    for path in (f["a"], f["b"]):
        im = Image.open(path)
        ratio = PANE_W / im.width
        panes.append(im.resize((PANE_W, int(im.height * ratio)), Image.LANCZOS))
    h = panes[0].height
    canvas = Image.new("RGB", (PANE_W * 2 + GAP, h + CAPTION_H), BG)
    draw = ImageDraw.Draw(canvas)
    for i, pane in enumerate(panes):
        x = i * (PANE_W + GAP)
        draw.text((x + 6, 5), CAPTIONS[i], fill=CAPTION_FG[i])
        canvas.paste(pane, (x, CAPTION_H))
    draw.rectangle([PANE_W, 0, PANE_W + GAP - 1, h + CAPTION_H], fill=DIVIDER)
    canvas = canvas.convert("P", palette=Image.ADAPTIVE, colors=128)
    images.append(canvas)
    durations.append(max(f["ms"], 30))

out = Path("docs/screenshots/collaboration.gif")
images[0].save(out, save_all=True, append_images=images[1:],
               duration=durations, loop=0, optimize=True)
print(f"{out} — {len(images)} frames, {out.stat().st_size // 1024} KB")
