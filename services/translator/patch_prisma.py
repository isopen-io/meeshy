#!/usr/bin/env python3
"""
Patch pour Prisma Python 0.15.0 - Fix incompatibilité avec httpx
Ce script corrige le bug où limits et timeout sont passés comme dict au lieu d'objets
"""

import os
import sys

# Trouver le fichier _async_http.py dans le site-packages
prisma_path = None
for path in sys.path:
    candidate = os.path.join(path, 'prisma', '_async_http.py')
    if os.path.exists(candidate):
        prisma_path = candidate
        break

if not prisma_path:
    print("❌ Fichier prisma/_async_http.py non trouvé")
    sys.exit(1)

print(f"📁 Fichier trouvé: {prisma_path}")

# Lire le contenu
with open(prisma_path, 'r') as f:
    content = f.read()

# Vérifier si déjà patché
if "Fix: Convert dict to Limits/Timeout objects" in content:
    print("✅ Le fichier est déjà patché")
    sys.exit(0)

# Appliquer le patch
old_code = """    @override
    def open(self) -> None:
        self.session = httpx.AsyncClient(**self.session_kwargs)"""

new_code = """    @override
    def open(self) -> None:
        # Fix: Convert dict to Limits/Timeout objects if needed
        kwargs = self.session_kwargs.copy()
        if 'limits' in kwargs and isinstance(kwargs['limits'], dict):
            kwargs['limits'] = httpx.Limits(**kwargs['limits'])
        if 'timeout' in kwargs and isinstance(kwargs['timeout'], dict):
            kwargs['timeout'] = httpx.Timeout(**kwargs['timeout'])
        self.session = httpx.AsyncClient(**kwargs)"""

if old_code not in content:
    print("❌ Code à patcher non trouvé (version incompatible?)")
    sys.exit(1)

# Remplacer
content = content.replace(old_code, new_code)

# Écrire le fichier patché
with open(prisma_path, 'w') as f:
    f.write(content)

print("✅ Patch appliqué avec succès!")
print("🔧 Redémarrez le service translator pour activer le patch")
