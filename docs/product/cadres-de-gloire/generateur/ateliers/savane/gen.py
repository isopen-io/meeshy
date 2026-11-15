"""Atelier « Afrique éternelle · Savane » - 19 cadres de gloire.

python3 gen.py  -> out/savane/*.svg + manifest.json ; puis node lib/render.mjs out/savane

Ambassadeur V→I et Orateur A-C : la savane et ce que l'Afrique y a bâti (amb.py, ora.py).
Oracle A-C, Légende V→I, Mythe A-C : le cosmos, vers l'infiniment grand et l'infiniment petit (orc.py, leg.py, myt.py).
Motifs : motifs.py (faune, flore, artisanat), batir.py (constructions : huttes zouloues, takienta, Achum de Bafut, Aksoum, ndebele, kgotla, Abomey, Sankoré), cosmos.py (ciel), infime.py (l'infiniment petit), kit.py (fenêtres, plaques, cadres).
"""

import sys

import amb
import common
import leg
import myt
import ora
import orc

FRAMES = amb.FRAMES + ora.FRAMES + orc.FRAMES + leg.FRAMES + myt.FRAMES

if __name__ == "__main__":
    common.OUT.mkdir(parents=True, exist_ok=True)
    only = set(sys.argv[1:])
    for fn in FRAMES:
        if not only or fn.__name__ in only:
            fn()
    if not only:
        common.write_manifest()
    print("ok", len(common.MANIFEST))
