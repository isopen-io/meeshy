#!/usr/bin/env python3

import asyncio
import os
import sys
import traceback
from pathlib import Path
from urllib.parse import urlparse

print("🔍 Diagnostic MongoDB détaillé...")

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

db_url = os.environ.get('DATABASE_URL')
if not db_url:
    print("❌ DATABASE_URL non définie")
    exit(1)

print(f"🔧 URL de base de données: {db_url}")

# Parser l'URL pour extraire les informations
parsed = urlparse(db_url)
host = parsed.hostname
port = parsed.port or 27017
database = parsed.path.lstrip('/') or 'meeshy'
username = parsed.username
password = '***' if parsed.password else None

print(f"📋 Host: {host}")
print(f"📋 Port: {port}")
print(f"📋 Database: {database}")
print(f"📋 Username: {username}")
print(f"📋 Password: {'défini' if password else 'non défini'}")

# Vérifier les paramètres de l'URL
if 'authMechanism' in db_url:
    print('✅ authMechanism spécifié dans l\'URL')
else:
    print('⚠️ authMechanism non spécifié dans l\'URL')

if 'tls=true' in db_url:
    print('✅ TLS activé dans l\'URL')
else:
    print('⚠️ TLS non activé dans l\'URL')

if 'replicaSet' in db_url:
    print('✅ ReplicaSet spécifié dans l\'URL')
else:
    print('⚠️ ReplicaSet non spécifié dans l\'URL')

# Test avec pymongo pour comparer
try:
    print("\n🔧 Test avec pymongo...")
    import pymongo
    
    # Créer une URL sans les paramètres Prisma
    mongo_url = f"mongodb://{username}:{parsed.password}@{host}/{database}?replicaSet=replicaset&tls=true&authMechanism=SCRAM-SHA-256"
    print(f"📋 URL pymongo: {mongo_url[:50]}...")
    
    client = pymongo.MongoClient(mongo_url, serverSelectionTimeoutMS=10000)
    client.admin.command('ping')
    print("✅ Connexion pymongo réussie")
    
    # Test de la base de données
    db = client[database]
    collections = db.list_collection_names()
    print(f"✅ Base de données accessible, collections: {collections}")
    
    client.close()
    
except Exception as e:
    print(f"❌ Erreur pymongo: {e}")

# Test avec Prisma
print("\n🔧 Test avec Prisma...")

# Ajouter le répertoire du client Prisma au PYTHONPATH
current_dir = Path.cwd()
prisma_client_path = current_dir / 'shared' / 'prisma'
if prisma_client_path.exists():
    sys.path.insert(0, str(prisma_client_path))

try:
    from prisma import Prisma
    
    async def test_prisma():
        try:
            print('🔧 Tentative de connexion Prisma...')
            prisma = Prisma()
            
            # Timeout de 10 secondes pour la connexion
            try:
                await asyncio.wait_for(prisma.connect(), timeout=10.0)
                print('✅ Connexion Prisma réussie')
            except asyncio.TimeoutError:
                print('❌ Timeout lors de la connexion Prisma (10s)')
                return False
            
            try:
                print("🔍 Test de requête Prisma...")
                count = await prisma.user.count()
                print(f'✅ Base de données accessible avec {count} utilisateurs')
                await prisma.disconnect()
                return True
            except Exception as e:
                error_msg = str(e)
                print(f'❌ Erreur requête Prisma: {error_msg}')
                print(f'📋 Détails: {traceback.format_exc()}')
                await prisma.disconnect()
                return False
                
        except Exception as e:
            error_msg = str(e)
            print(f'❌ Erreur connexion Prisma: {error_msg}')
            print(f'📋 Détails: {traceback.format_exc()}')
            return False
    
    result = asyncio.run(test_prisma())
    print(f"📊 Résultat Prisma: {result}")
    
except Exception as e:
    print(f'❌ Erreur import Prisma: {e}')
    print(f'📋 Détails: {traceback.format_exc()}')

print("\n✅ Diagnostic terminé")
