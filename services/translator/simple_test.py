#!/usr/bin/env python3

import asyncio
import os
import sys
import traceback
from pathlib import Path

print("🔧 Test simple de connexion Prisma...")

# Charger les variables d'environnement depuis ../.env
env_file = Path("../.env")
if env_file.exists():
    print(f"📋 Chargement des variables depuis {env_file}")
    with open(env_file, 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#'):
                if '=' in line:
                    key, value = line.split('=', 1)
                    # Supprimer les guillemets si présents
                    value = value.strip('"\'')
                    os.environ[key] = value
                    print(f"   {key}=***")

print(f"📋 DATABASE_URL: {os.environ.get('DATABASE_URL', 'NON DÉFINIE')[:50]}...")

# Ajouter le répertoire du client Prisma au PYTHONPATH
current_dir = Path.cwd()
prisma_client_path = current_dir / 'shared' / 'prisma'
if prisma_client_path.exists():
    sys.path.insert(0, str(prisma_client_path))
    print(f"📋 Ajout du chemin: {prisma_client_path}")

try:
    print("📋 Import du module Prisma...")
    from prisma import Prisma
    print("✅ Module Prisma importé avec succès")
    
    async def test_connection():
        try:
            print('🔧 Tentative de connexion Prisma...')
            prisma = Prisma()
            
            # Timeout de 10 secondes pour la connexion
            try:
                print("⏱️ Connexion avec timeout de 10 secondes...")
                await asyncio.wait_for(prisma.connect(), timeout=4.0)
                print('✅ Connexion Prisma réussie')
            except asyncio.TimeoutError:
                print('❌ Timeout lors de la connexion Prisma (10s)')
                return False
            
            try:
                print("🔍 Test de requête...")
                count = await prisma.user.count()
                print(f'✅ Base de données accessible avec {count} utilisateurs')
                await prisma.disconnect()
                return True
            except Exception as e:
                error_msg = str(e)
                if 'does not exist' in error_msg or 'not found' in error_msg:
                    print('⚠️ Base de données vide ou schéma non synchronisé')
                    print('🔄 La synchronisation sera effectuée par Prisma db push')
                    await prisma.disconnect()
                    return True
                elif 'Authentication failed' in error_msg:
                    print('❌ Problème d\'authentification MongoDB')
                    print(f'📋 Détails: {error_msg}')
                    await prisma.disconnect()
                    return False
                else:
                    print(f'❌ Erreur lors de la vérification: {error_msg}')
                    print(f'📋 Détails: {traceback.format_exc()}')
                    await prisma.disconnect()
                    return False
        except Exception as e:
            error_msg = str(e)
            if 'Authentication failed' in error_msg:
                print('❌ Problème d\'authentification MongoDB')
                print(f'📋 Détails: {error_msg}')
                return False
            else:
                print(f'❌ Erreur connexion Prisma: {error_msg}')
                print(f'📋 Détails: {traceback.format_exc()}')
                return False
    
    print("🚀 Lancement du test asynchrone...")
    result = asyncio.run(test_connection())
    print(f"📊 Résultat: {result}")
    exit(0 if result else 1)
    
except Exception as e:
    print(f'❌ Erreur import Prisma: {e}')
    print(f'📋 Détails: {traceback.format_exc()}')
    exit(1)
