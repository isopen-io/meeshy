import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from base import *

out = Path(sys.argv[1])
for layout, style, msg in (("pied", "cartouche", None), ("perches", "ruban", "Pour toi, maman"), ("cotes", "parchemin", "On l'a fait ensemble"), ("ruban", "cartouche", "Merci la team !")):
    c = Card(f"s-{layout}")
    photo(c)
    border(c, 16, "#E8B53C", 3)
    c.add(dwennimmen(110, 120, 0.9, "#FFF4C2"), sankofa(430, 120, 0.9, "#FFF4C2"), adinkrahene(270, 40, 0.8, "#E8B53C"))
    crest(c, 270, 160, 1.1, "gold", division=3)
    mee_meo(c, layout, "mee-fete", "meo-roi")
    plaque(c, "Nouveau rang", "Ambassadeur III", message=msg, style=style)
    c.save(out / f"sample-{layout}.svg")
