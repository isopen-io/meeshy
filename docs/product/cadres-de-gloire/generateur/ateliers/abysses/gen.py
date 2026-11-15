"""Atelier « Abysses » : génère les 19 cadres de gloire dans out/abysses/.
Usage : python3 gen.py [nom-court ...]   (ex. ambassadeur-5 orateur-a ; sans argument : tout)"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import OUT, write_manifest  # noqa: E402
import amb  # noqa: E402

MODULES = [amb]
for name in ("ora", "orc", "leg", "myt"):
    try:
        MODULES.append(__import__(name))
    except ModuleNotFoundError:
        pass

ALIAS = {"ambassadeur-5": "amb5", "ambassadeur-4": "amb4", "ambassadeur-3": "amb3", "ambassadeur-2": "amb2", "ambassadeur-1": "amb1",
         "orateur-a": "ora_a", "orateur-b": "ora_b", "orateur-c": "ora_c", "oracle-a": "orc_a", "oracle-b": "orc_b", "oracle-c": "orc_c",
         "legende-5": "leg5", "legende-4": "leg4", "legende-3": "leg3", "legende-2": "leg2", "legende-1": "leg1",
         "mythe-a": "my_a", "mythe-b": "my_b", "mythe-c": "my_c"}

FRAMES = {fn.__name__: fn for mod in MODULES for fn in mod.ALL}

if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    wanted = sys.argv[1:] or list(ALIAS)
    done = 0
    for name in wanted:
        fn = FRAMES.get(ALIAS.get(name, name))
        if fn:
            fn()
            done += 1
    write_manifest()
    print("ok", done)
