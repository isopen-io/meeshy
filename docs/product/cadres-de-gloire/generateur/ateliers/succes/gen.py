"""Atelier « Hauts faits » (lot LS, #10168, PP9) : un cadre par rareté — commun, rare, épique, légendaire, mythique —
et un cadre NEUTRE, sans marque de rareté, pour un haut fait dont la rareté n'est pas servie.

Le pack `succes` est unique, installé par défaut et non retirable ; la plaque porte le TITRE VIVANT du haut fait
(emplacement `title`, rempli par l'app), jamais un titre cuit.

Usage : python3 gen.py [rareté ...]   (common | rare | epic | legendary | mythic | neutre ; toutes par défaut)
Le kit commun est celui de l'atelier « moments » (fenêtres, reliefs, inscription) : `ateliers/moments` entre dans
le chemin APRÈS ce dossier, qui n'a pas de `kit.py` à lui.
"""

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "lib"))
sys.path.insert(0, str(HERE.parent / "moments"))
sys.path.insert(0, str(HERE))

OUT = HERE.parents[1] / "out" / "succes"


def main(args):
    import cadres

    frames = {stem.replace("succes-", "", 1): (stem, build, meta) for stem, build, meta in cadres.FRAMES}
    wanted = args or list(frames)
    OUT.mkdir(parents=True, exist_ok=True)
    for key in wanted:
        stem, build, _ = frames[key]
        build().save(OUT / f"{stem}.svg")
        print("wrote", stem)
    manifest = [{"file": f"{stem}.jpg", **meta} for stem, _, meta in cadres.FRAMES]
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main(sys.argv[1:])
