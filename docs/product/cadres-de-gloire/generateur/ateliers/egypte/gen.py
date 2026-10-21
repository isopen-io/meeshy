"""Atelier « Égypte solaire » - 19 cadres de gloire.

python3 gen.py [nom ...]  -> out/egypte/*.svg + manifest.json ; puis node lib/render.mjs out/egypte
"""

import json
import sys
from pathlib import Path

ATL = Path(__file__).resolve().parent
sys.path.insert(0, str(ATL))

from kit import OUT, MANIFEST  # noqa: E402
import amb  # noqa: E402
import ora  # noqa: E402
import orc  # noqa: E402
import leg  # noqa: E402
import myt  # noqa: E402

FRAMES = [
    ("ambassadeur-5", amb.amb5),
    ("ambassadeur-4", amb.amb4),
    ("ambassadeur-3", amb.amb3),
    ("ambassadeur-2", amb.amb2),
    ("ambassadeur-1", amb.amb1),
    ("orateur-a", ora.ora_a),
    ("orateur-b", ora.ora_b),
    ("orateur-c", ora.ora_c),
    ("oracle-a", orc.ora_a),
    ("oracle-b", orc.ora_b),
    ("oracle-c", orc.ora_c),
    ("legende-5", leg.leg5),
    ("legende-4", leg.leg4),
    ("legende-3", leg.leg3),
    ("legende-2", leg.leg2),
    ("legende-1", leg.leg1),
    ("mythe-a", myt.myt_a),
    ("mythe-b", myt.myt_b),
    ("mythe-c", myt.myt_c),
]


def main(only):
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in FRAMES:
        if not only or name in only:
            fn()
    if not only:
        (OUT / "manifest.json").write_text(json.dumps(MANIFEST, ensure_ascii=False, indent=2))
    print("ok", len(MANIFEST))


if __name__ == "__main__":
    main(set(sys.argv[1:]))
