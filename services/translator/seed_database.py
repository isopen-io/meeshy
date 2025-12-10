#!/usr/bin/env python3

"""
Script de seed pour initialiser la base de données MongoDB avec des données de test
Utilise le client Prisma Python du Translator
"""

import asyncio
import os
import sys
import traceback
from pathlib import Path
from datetime import datetime, timedelta

print("🌱 Début du seeding de la base de données MongoDB...")

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
    
    # Messages multilingues pour les tests
    TEST_MESSAGES = [
        # Messages français
        {"text": "Bonjour tout le monde ! Comment allez-vous aujourd'hui ?", "lang": "fr"},
        {"text": "J'adore cette plateforme de messagerie multilingue !", "lang": "fr"},
        {"text": "Quelqu'un a-t-il testé la traduction automatique ?", "lang": "fr"},
        
        # Messages anglais
        {"text": "Hello everyone! Great to be here!", "lang": "en"},
        {"text": "This real-time translation feature is amazing!", "lang": "en"},
        {"text": "Can anyone recommend good language learning resources?", "lang": "en"},
        
        # Messages espagnols
        {"text": "¡Hola amigos! ¿Cómo están todos?", "lang": "es"},
        {"text": "Me encanta poder escribir en mi idioma nativo", "lang": "es"},
        
        # Messages allemands
        {"text": "Guten Tag! Wie geht es euch allen?", "lang": "de"},
        {"text": "Diese Übersetzungstechnologie ist fantastisch!", "lang": "de"},
        
        # Messages chinois
        {"text": "大家好！很高兴见到大家！", "lang": "zh"},
        {"text": "这个实时翻译功能太棒了！", "lang": "zh"},
        
        # Messages japonais
        {"text": "皆さん、こんにちは！元気ですか？", "lang": "ja"},
        {"text": "この翻訳機能は本当に素晴らしいですね！", "lang": "ja"},
        
        # Messages portugais
        {"text": "Olá pessoal! Como estão todos?", "lang": "pt"},
        {"text": "Essa plataforma multilíngue é incrível!", "lang": "pt"}
    ]
    
    async def seed_database():
        try:
            print('🔧 Connexion à la base de données...')
            prisma = Prisma()
            
            # Timeout de 10 secondes pour la connexion
            try:
                await asyncio.wait_for(prisma.connect(), timeout=10.0)
                print('✅ Connexion Prisma réussie')
            except asyncio.TimeoutError:
                print('❌ Timeout lors de la connexion Prisma (10s)')
                return False
            
            # Nettoyer les données existantes
            print('🧹 Nettoyage des données existantes...')
            await prisma.messagetranslation.delete_many()
            await prisma.message.delete_many()
            await prisma.conversationmember.delete_many()
            await prisma.conversation.delete_many()
            await prisma.user.delete_many()
            
            # Créer les utilisateurs
            print('👥 Création des utilisateurs...')
            
            # 1. Utilisateur français (Admin)
            alice = await prisma.user.create({
                "username": "alice_fr",
                "email": "alice@meeshy.me",
                "firstName": "Alice",
                "lastName": "Dubois",
                "password": "$2b$10$UxJ6jmYYODq6QnsTm8TZMu9AlWUDlY/fZdw/e0YA1gjqz9Cjmwlqq",  # password123
                "role": "ADMIN",
                "isActive": True,
                "systemLanguage": "fr",
                "regionalLanguage": "fr",
                "autoTranslateEnabled": True,
                "translateToSystemLanguage": True,
                "translateToRegionalLanguage": False
            })
            
            # 2. Utilisateur anglais
            bob = await prisma.user.create({
                "username": "bob_en",
                "email": "bob@meeshy.me",
                "firstName": "Bob",
                "lastName": "Johnson",
                "password": "$2b$10$UxJ6jmYYODq6QnsTm8TZMu9AlWUDlY/fZdw/e0YA1gjqz9Cjmwlqq",  # password123
                "role": "ADMIN",
                "isActive": True,
                "systemLanguage": "en",
                "regionalLanguage": "es",
                "autoTranslateEnabled": True,
                "translateToSystemLanguage": True,
                "translateToRegionalLanguage": False
            })
            
            # 3. Utilisateur espagnol
            carlos = await prisma.user.create({
                "username": "carlos_es",
                "email": "carlos@meeshy.me",
                "firstName": "Carlos",
                "lastName": "García",
                "password": "$2b$10$UxJ6jmYYODq6QnsTm8TZMu9AlWUDlY/fZdw/e0YA1gjqz9Cjmwlqq",  # password123
                "role": "MODO",
                "isActive": True,
                "systemLanguage": "es",
                "regionalLanguage": "en",
                "autoTranslateEnabled": True,
                "translateToSystemLanguage": True,
                "translateToRegionalLanguage": False
            })
            
            # 4. Utilisateur allemand
            dieter = await prisma.user.create({
                "username": "dieter_de",
                "email": "dieter@meeshy.me",
                "firstName": "Dieter",
                "lastName": "Schmidt",
                "password": "$2b$10$UxJ6jmYYODq6QnsTm8TZMu9AlWUDlY/fZdw/e0YA1gjqz9Cjmwlqq",  # password123
                "role": "USER",
                "isActive": True,
                "systemLanguage": "de",
                "regionalLanguage": "fr",
                "autoTranslateEnabled": True,
                "translateToSystemLanguage": True,
                "translateToRegionalLanguage": False
            })
            
            # 5. Utilisateur chinois
            li = await prisma.user.create({
                "username": "li_zh",
                "email": "li@meeshy.me",
                "firstName": "Li",
                "lastName": "Wei",
                "password": "$2b$10$UxJ6jmYYODq6QnsTm8TZMu9AlWUDlY/fZdw/e0YA1gjqz9Cjmwlqq",  # password123
                "role": "USER",
                "isActive": True,
                "systemLanguage": "zh",
                "regionalLanguage": "en",
                "autoTranslateEnabled": True,
                "translateToSystemLanguage": True,
                "translateToRegionalLanguage": False
            })
            
            # 6. Utilisateur japonais
            yuki = await prisma.user.create({
                "username": "yuki_ja",
                "email": "yuki@meeshy.me",
                "firstName": "Yuki",
                "lastName": "Tanaka",
                "password": "$2b$10$UxJ6jmYYODq6QnsTm8TZMu9AlWUDlY/fZdw/e0YA1gjqz9Cjmwlqq",  # password123
                "role": "ANALYST",
                "isActive": True,
                "systemLanguage": "ja",
                "regionalLanguage": "fr",
                "autoTranslateEnabled": True,
                "translateToSystemLanguage": True,
                "translateToRegionalLanguage": False
            })
            
            # 7. Utilisateur portugais
            maria = await prisma.user.create({
                "username": "maria_pt",
                "email": "maria@meeshy.me",
                "firstName": "Maria",
                "lastName": "Silva",
                "password": "$2b$10$UxJ6jmYYODq6QnsTm8TZMu9AlWUDlY/fZdw/e0YA1gjqz9Cjmwlqq",  # password123
                "role": "USER",
                "isActive": True,
                "systemLanguage": "pt",
                "regionalLanguage": "ar",
                "autoTranslateEnabled": True,
                "translateToSystemLanguage": True,
                "translateToRegionalLanguage": False
            })
            
            users = [alice, bob, carlos, dieter, li, yuki, maria]
            print('✅ 7 utilisateurs multilingues créés')
            
            # Créer la conversation globale "meeshy"
            print('💭 Création de la conversation "meeshy"...')
            
            meeshy_conversation = await prisma.conversation.create({
                "type": "global",
                "title": "Meeshy",
                "identifier": "meeshy",
                "description": "Conversation globale pour tous les utilisateurs de Meeshy"
            })
            

            # Ajouter tous les utilisateurs à la conversation
            for user in users:
                await prisma.conversationmember.create({
                    "conversationId": meeshy_conversation.id,
                    "userId": user.id,
                    "role": "ADMIN" if user.role == "ADMIN" else ("MODERATOR" if user.role == "MODO" else "MEMBER")
                })
            
            print('✅ Conversation "meeshy" créée avec tous les utilisateurs')
            
            # Créer les messages
            print('💬 Création des messages...')
            
            messages = []
            for i, message_data in enumerate(TEST_MESSAGES):
                user_index = i % len(users)
                sender = users[user_index]
                
                # Créer le message avec un délai réaliste
                created_at = datetime.now() - timedelta(minutes=(len(TEST_MESSAGES) - i) * 5)
                
                message = await prisma.message.create({
                    "conversationId": meeshy_conversation.id,
                    "senderId": sender.id,
                    "content": message_data["text"],
                    "originalLanguage": message_data["lang"],
                    "messageType": "text",
                    "createdAt": created_at
                })
                
                messages.append(message)
                
                # Créer les traductions vers toutes les autres langues
                user_languages = list(set([u.systemLanguage for u in users]))
                target_languages = [lang for lang in user_languages if lang != message_data["lang"]]
                
                for target_lang in target_languages:
                    # Traduction simple pour l'exemple
                    translated_content = f"[{target_lang.upper()}] {message_data['text']}"
                    model_used = ["basic", "medium", "premium"][i % 3]
                    
                    await prisma.messagetranslation.create({
                        "messageId": message.id,
                        "sourceLanguage": message_data["lang"],
                        "targetLanguage": target_lang,
                        "translatedContent": translated_content,
                        "translationModel": model_used,
                        "cacheKey": f"{message.id}_{message_data['lang']}_{target_lang}"
                    })
            
            print(f'✅ {len(messages)} messages créés avec traductions')
            
            # Statistiques finales
            total_users = await prisma.user.count()
            total_messages = await prisma.message.count()
            total_translations = await prisma.messagetranslation.count()
            total_conversations = await prisma.conversation.count()
            
            print(f"""
📊 === STATISTIQUES DU SEEDING ===
👥 Utilisateurs créés: {total_users}
💬 Messages créés: {total_messages}
🌐 Traductions créées: {total_translations}
💭 Conversations: {total_conversations}

🎯 === DÉTAILS DES UTILISATEURS ===
🇫🇷 Alice Dubois (alice@meeshy.me) - Français - Admin
🇺🇸 Bob Johnson (bob@meeshy.me) - Anglais - User  
🇪🇸 Carlos García (carlos@meeshy.me) - Espagnol - User
🇩🇪 Dieter Schmidt (dieter@meeshy.me) - Allemand - User
🇨🇳 Li Wei (li@meeshy.me) - Chinois - User
🇯🇵 Yuki Tanaka (yuki@meeshy.me) - Japonais - User
🇵🇹 Maria Silva (maria@meeshy.me) - Portugais - User

🔑 === INFORMATIONS DE CONNEXION ===
Mot de passe pour tous: password123

📱 === CONVERSATION 'MEESHY' ===
ID: meeshy
Type: GLOBAL 
Messages: {total_messages} (tous avec traductions)
Langues: FR, EN, ES, DE, ZH, JA, PT

🌟 === PRÊT POUR LES TESTS ===
✓ Multi-language real-time messaging
✓ Automatic translation system  
✓ 7 diverse user profiles
✓ Rich multilingual conversation data
✓ Au moins un message par utilisateur
✓ Traductions vers toutes les langues des membres
            """)
            
            await prisma.disconnect()
            return True
            
        except Exception as e:
            error_msg = str(e)
            print(f'❌ Erreur lors du seeding: {error_msg}')
            print(f'📋 Détails: {traceback.format_exc()}')
            await prisma.disconnect()
            return False
    
    print("🚀 Lancement du seeding asynchrone...")
    result = asyncio.run(seed_database())
    print(f"📊 Résultat: {result}")
    exit(0 if result else 1)
    
except Exception as e:
    print(f'❌ Erreur import Prisma: {e}')
    print(f'📋 Détails: {traceback.format_exc()}')
    exit(1)
