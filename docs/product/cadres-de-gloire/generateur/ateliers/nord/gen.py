"""Atelier « Aurores du Nord » — 19 cadres de gloire (Ambassadeur V..I, Orateur A..C, Oracle A..C, Légende V..I, Mythe A..C).

python3 gen.py [nom ...]  -> out/nord/*.svg + manifest.json ; puis node lib/render.mjs out/nord
"""

import importlib
import sys
from pathlib import Path

ATL = Path(__file__).resolve().parent
sys.path.insert(0, str(ATL.parent.parent / "lib"))
sys.path.insert(0, str(ATL))

import common  # noqa: E402

MODULES = ["amb", "ora", "orc", "leg", "myt"]


def main(only):
    for mod in MODULES:
        try:
            m = importlib.import_module(mod)
        except ModuleNotFoundError:
            continue
        for fn in m.ALL:
            if not only or fn.__name__ in only:
                fn()
    if not only:
        common.write_manifest()


if __name__ == "__main__":
    main(set(sys.argv[1:]))
