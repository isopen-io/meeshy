"""Atelier « Olympe » — génère les 19 cadres de gloire (Ambassadeur → Mythe) et leur manifeste.

Usage : python3 gen.py [préfixe…]   (ex. `python3 gen.py amb` pour ne régénérer que les Ambassadeur)
"""

import sys

from common import OUT, write_manifest, MANIFEST
import amb

GROUPS = {"amb": amb.ALL}
for mod in ("ora", "orc", "leg", "myt"):
    try:
        GROUPS[mod] = __import__(mod).ALL
    except ModuleNotFoundError:
        pass

want = sys.argv[1:] or list(GROUPS)
OUT.mkdir(parents=True, exist_ok=True)
for key in want:
    for fn in GROUPS[key]:
        fn()
write_manifest()
print("cadres :", len(MANIFEST))
