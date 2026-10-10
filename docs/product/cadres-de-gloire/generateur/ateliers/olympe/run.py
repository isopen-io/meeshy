"""Régénère quelques cadres : python3 run.py amb.amb2 ora.ora_b …  (puis render.mjs --only)."""
import sys
import importlib
from common import OUT, write_manifest, MANIFEST

for spec in sys.argv[1:]:
    mod, fn = spec.split(".")
    getattr(importlib.import_module(mod), fn)()
write_manifest()
print("ok", [m["file"] for m in MANIFEST])
