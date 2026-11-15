"""Atelier « Trésor » — les quatorze cadres des Meeshes gardées.

python3 gen.py [nom ...]  -> out/tresor/*.svg + manifest.json ; puis node lib/render.mjs out/tresor
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from kit import write_manifest, MANIFEST  # noqa: E402
import f_cuir  # noqa: E402

FRAMES = {
    "bourse-a": f_cuir.bourse_a,
    "bourse-b": f_cuir.bourse_b,
    "escarcelle-a": f_cuir.escarcelle_a,
    "escarcelle-b": f_cuir.escarcelle_b,
}

for mod in ("f_coffret", "f_or"):
    try:
        m = __import__(mod)
        FRAMES.update(m.FRAMES)
    except ModuleNotFoundError:
        pass

if __name__ == "__main__":
    wanted = sys.argv[1:] or list(FRAMES)
    for name in wanted:
        FRAMES[name]()
    write_manifest()
    print("ok", len(wanted))
