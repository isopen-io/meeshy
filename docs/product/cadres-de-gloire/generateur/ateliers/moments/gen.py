"""Atelier « Autres moments » : paliers de niveau, flamme, Meeshes frappées, réalisation du jour.

Usage : python3 gen.py [famille ...]   (paliers | flamme | meesh | jour ; toutes par défaut)
"""

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "lib"))
sys.path.insert(0, str(HERE))

OUT = HERE.parents[1] / "out" / "moments"


def families():
    import paliers
    out = {"paliers": paliers.FRAMES}
    for mod in ("flamme", "meesh", "jour"):
        try:
            m = __import__(mod)
            out[mod] = m.FRAMES
        except ModuleNotFoundError as e:
            if e.name != mod:
                raise
    return out


def main(args):
    fams = families()
    wanted = args or list(fams)
    OUT.mkdir(parents=True, exist_ok=True)
    for fam in wanted:
        for stem, build, meta in fams[fam]:
            build().save(OUT / f"{stem}.svg")
            print("wrote", stem)
    manifest = []
    for fam, frames in fams.items():
        for stem, _, meta in frames:
            manifest.append({"file": f"{stem}.jpg", **meta})
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main(sys.argv[1:])
