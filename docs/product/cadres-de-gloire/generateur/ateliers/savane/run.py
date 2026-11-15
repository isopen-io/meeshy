"""Rend un sous-ensemble : python3 run.py amb [amb5 amb4 ...]"""
import importlib, sys
mod = importlib.import_module(sys.argv[1])
only = set(sys.argv[2:])
for fn in mod.FRAMES:
    if not only or fn.__name__ in only:
        fn()
print("ok")
