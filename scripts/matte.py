#!/usr/bin/env python3
"""Batch background removal: matte.py <model> <in_dir_or_file> <out_dir_or_file>"""
import sys, pathlib
from rembg import remove, new_session
from PIL import Image

model, src, dst = sys.argv[1], pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3])
session = new_session(model)

def one(inp, outp):
    img = Image.open(inp)
    out = remove(img, session=session)
    out.save(outp)

if src.is_dir():
    dst.mkdir(parents=True, exist_ok=True)
    files = sorted(src.glob('*.png'))
    for i, f in enumerate(files):
        one(f, dst / f.name)
        if i % 25 == 0:
            print(f'{i}/{len(files)}', flush=True)
    print(f'{len(files)}/{len(files)} done')
else:
    one(src, dst)
    print('done')
