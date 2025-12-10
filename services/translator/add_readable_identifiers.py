#!/usr/bin/env python3

"""
Script pour ajouter des identifiants lisibles par l'homme aux conversations existantes
À exécuter après la synchronisation du schéma Prisma
"""

import asyncio
import os
import sys
import traceback
from pathlib import Path

print("🔧 Ajout des identifiants lisibles par l'homme...")

# Charger les variables d'environnement depuis ../.env
env_file = Path("../.env")
if env_file.exists():
    with open(env_file, 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#'):
                if '=' in line:
                    key, value = line.split('=', 1)
                    value = value.strip('"\'')
                    os.environ[key] = value

# Ajouter le répertoire du client Prisma au PYTHONPATH
current_dir = Path.cwd()
prisma_client_path = current_dir / 'shared' / 'prisma'
if prisma_client_path.exists():
    sys.path.insert(0, str(prisma_client_path))

try:
    from prisma import Prisma
    
    async def add_readable_identifiers():
        try:
            print('🔧 Connexion à la base de données...')
            prisma = Prisma()
            
            try:
                await asyncio.wait_for(prisma.connect(), timeout=10.0)
                print('✅ Connexion Prisma réussie')
            except asyncio.TimeoutError:
                print('❌ Timeout lors de la connexion Prisma (10s)')
                return False
            
            # Récupérer toutes les conversations
            conversations = await prisma.conversation.find_many()
            print(f'📋 {len(conversations)} conversations trouvées')
            
            # Mapper les conversations avec leurs identifiants lisibles
            identifier_mapping = {
                # Conversation globale Meeshy
                "meeshy": {
                    "type": "global",
                    "title": "Meeshy"
                },
                # Autres conversations possibles
                "general": {
                    "type": "public",
                    "title": "General"
                },
                "support": {
                    "type": "public", 
                    "title": "Support"
                }
            }
            
            updated_count = 0
            
            for conversation in conversations:
                print(f'🔍 Conversation: {conversation.title} (ID: {conversation.id})')
                
                # Chercher l'identifiant approprié basé sur le titre et le type
                identifier = None
                for id_key, criteria in identifier_mapping.items():
                    if (conversation.title and criteria["title"].lower() in conversation.title.lower() and 
                        conversation.type == criteria["type"]):
                        identifier = id_key
                        break
                
                if identifier:
                    try:
                        # Mettre à jour avec l'identifiant lisible
                        updated = await prisma.conversation.update(
                            where={"id": conversation.id},
                            data={"identifier": identifier}
                        )
                        print(f'✅ Ajouté identifiant "{identifier}" à la conversation "{conversation.title}"')
                        updated_count += 1
                    except Exception as e:
                        print(f'❌ Erreur lors de la mise à jour: {e}')
                else:
                    print(f'⚠️ Aucun identifiant approprié trouvé pour "{conversation.title}"')
            
            print(f'\n📊 Résumé: {updated_count} conversations mises à jour avec des identifiants lisibles')
            
            # Afficher les conversations avec leurs identifiants
            print('\n📋 Conversations avec identifiants:')
            conversations_with_ids = await prisma.conversation.find_many(
                where={"identifier": {"not": None}}
            )
            
            for conv in conversations_with_ids:
                print(f'  - {conv.identifier}: {conv.title} ({conv.type})')
            
            await prisma.disconnect()
            return True
            
        except Exception as e:
            error_msg = str(e)
            print(f'❌ Erreur: {error_msg}')
            print(f'📋 Détails: {traceback.format_exc()}')
            await prisma.disconnect()
            return False
    
    print("🚀 Lancement de l'ajout d'identifiants...")
    result = asyncio.run(add_readable_identifiers())
    print(f"📊 Résultat: {result}")
    exit(0 if result else 1)
    
except Exception as e:
    print(f'❌ Erreur import Prisma: {e}')
    print(f'📋 Détails: {traceback.format_exc()}')
    exit(1)
