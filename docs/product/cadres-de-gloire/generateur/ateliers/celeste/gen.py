"""Atelier « Empire céleste » : génère les 19 cadres et le manifeste. Usage : python3 gen.py [module ...]"""
import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402

MODULES = ["amb", "ora", "orc", "leg", "myt"]
todo = sys.argv[1:] or MODULES
for name in todo:
    if (Path(__file__).resolve().parent / f"{name}.py").exists():
        importlib.import_module(name).build()
if not sys.argv[1:]:
    common.write_manifest()
print("ok", len(common.MANIFEST))
