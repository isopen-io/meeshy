#!/usr/bin/env python3
"""
Script pour appliquer le patch Prisma httpx compatibility fix
Corrige l'incompatibilité entre Prisma Python 0.15.0 et httpx où
Prisma passe des dict au lieu d'objets Limits/Timeout à httpx.AsyncClient
"""

import os
import sys

def apply_patch():
    file_path = '/usr/local/lib/python3.12/site-packages/prisma/_async_http.py'
    
    if not os.path.exists(file_path):
        print(f"❌ Fichier non trouvé: {file_path}")
        sys.exit(1)
    
    with open(file_path, 'r') as f:
        content = f.read()
    
    # Vérifier si le patch est déjà appliqué
    if 'isinstance(kwargs' in content:
        print('ℹ️  Patch déjà appliqué')
        return
    
    # Code original à remplacer
    original = '''    def open(self) -> None:
        self.session = httpx.AsyncClient(**self.session_kwargs)'''
    
    # Nouveau code avec le fix
    fixed = '''    def open(self) -> None:
        # Fix: Convert dict to Limits/Timeout objects if needed
        import httpx
        kwargs = self.session_kwargs.copy()
        if 'limits' in kwargs and isinstance(kwargs['limits'], dict):
            kwargs['limits'] = httpx.Limits(**kwargs['limits'])
        if 'timeout' in kwargs and isinstance(kwargs['timeout'], dict):
            kwargs['timeout'] = httpx.Timeout(**kwargs['timeout'])
        self.session = httpx.AsyncClient(**kwargs)'''
    
    # Appliquer le patch
    if original in content:
        new_content = content.replace(original, fixed)
        with open(file_path, 'w') as f:
            f.write(new_content)
        print('✅ Patch Prisma appliqué avec succès!')
        print(f'   Fichier: {file_path}')
    else:
        print('⚠️  Code original non trouvé, le fichier a peut-être changé')
        sys.exit(1)

if __name__ == '__main__':
    apply_patch()
