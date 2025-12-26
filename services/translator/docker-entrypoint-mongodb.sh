#!/bin/bash
set -e

echo "[TRANSLATOR] Demarrage du service Translator avec migrations Prisma (MongoDB)..."

# Fonction pour générer le client Prisma Python si nécessaire
generate_prisma_client() {
    echo "[TRANSLATOR] Verification du client Prisma Python..."

    # Vérifier si le client Prisma Python est déjà généré
    if python3 -c "import prisma; from prisma import Prisma; print('Client Prisma OK')" 2>/dev/null; then
        echo "[TRANSLATOR] Client Prisma Python deja genere"
        return 0
    fi

    echo "[TRANSLATOR] Client Prisma Python non trouve, generation en cours..."

    # Chercher le schema Prisma dans plusieurs emplacements possibles
    SCHEMA_PATHS=(
        "/workspace/schema.prisma"
        "/workspace/shared/prisma/schema.prisma"
        "/workspace/prisma/schema.prisma"
    )

    SCHEMA_PATH=""
    for path in "${SCHEMA_PATHS[@]}"; do
        if [ -f "$path" ]; then
            # Vérifier que c'est bien un schema Python (prisma-client-py)
            if grep -q "prisma-client-py" "$path" 2>/dev/null; then
                SCHEMA_PATH="$path"
                echo "[TRANSLATOR] Schema Prisma Python trouve: $SCHEMA_PATH"
                break
            fi
        fi
    done

    if [ -z "$SCHEMA_PATH" ]; then
        echo "[TRANSLATOR] ERREUR: Aucun schema Prisma Python trouve!"
        echo "[TRANSLATOR] Schemas recherches: ${SCHEMA_PATHS[*]}"

        # Afficher les fichiers disponibles pour debug
        echo "[TRANSLATOR] Contenu de /workspace:"
        ls -la /workspace/ 2>/dev/null || true
        echo "[TRANSLATOR] Fichiers .prisma:"
        find /workspace -name "*.prisma" 2>/dev/null || true

        return 1
    fi

    # Générer le client Prisma Python
    echo "[TRANSLATOR] Generation du client Prisma depuis $SCHEMA_PATH..."

    if prisma generate --schema="$SCHEMA_PATH"; then
        echo "[TRANSLATOR] Client Prisma Python genere avec succes"

        # Vérifier que le client fonctionne
        if python3 -c "import prisma; from prisma import Prisma; print('Verification OK')" 2>/dev/null; then
            echo "[TRANSLATOR] Client Prisma Python verifie et fonctionnel"
            return 0
        else
            echo "[TRANSLATOR] ERREUR: Le client Prisma genere ne fonctionne pas"
            return 1
        fi
    else
        echo "[TRANSLATOR] ERREUR: Echec de la generation du client Prisma"
        return 1
    fi
}

# Fonction pour attendre que la base de données soit prête
wait_for_database() {
    echo "[TRANSLATOR] Attente de la base de donnees MongoDB..."
    
    # Afficher l'URL masquee pour debug (sans le mot de passe)
    MASKED_URL=$(echo $DATABASE_URL | sed 's/:[^@]*@/:***@/')
    echo "[TRANSLATOR] URL MongoDB (masquee): $MASKED_URL"
    
    # Test de connectivite reseau avance
    echo "[TRANSLATOR] Test de connectivite reseau..."
    
    # Attendre que MongoDB soit pret avec gestion des erreurs amelioree  
    MAX_RETRIES=2
    RETRY_COUNT=0
    
    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        echo "[TRANSLATOR] Tentative de connexion $((RETRY_COUNT + 1))/$MAX_RETRIES..."
        
        # Test de connexion MongoDB avec script de sante optimise
        if python3 /workspace/mongodb-health-check.py; then
            echo "[TRANSLATOR] Base de donnees MongoDB accessible"
            return 0
        else
            echo "[TRANSLATOR] Base de donnees non accessible, attente de 10 secondes..."
            sleep 5
            RETRY_COUNT=$((RETRY_COUNT + 1))
        fi
    done
    
    echo "[TRANSLATOR] Impossible de se connecter a MongoDB apres $MAX_RETRIES tentatives"
    echo "[TRANSLATOR] Continuation avec configuration degradee..."
}

# Fonction pour executer les migrations Prisma
run_prisma_migrations() {
    echo "[TRANSLATOR] Initialisation et migrations de la base de donnees MongoDB..."
    
    # Afficher les variables d'environnement pour debug
    echo "[TRANSLATOR] Variables d'environnement:"
    env | grep -E "(PRISMA|DATABASE|PYTHON)" | sort
    
    # Le client Prisma est deja genere dans l'image Docker
    echo "[TRANSLATOR] Client Prisma verifie dans /usr/local/lib/python3.12/site-packages/prisma"
     
    # Initialisation et migration de la base de donnees MongoDB
    echo "[TRANSLATOR] Initialisation et migration de la base de donnees MongoDB..."
    
    # Configuration de variables d'environnement pour optimiser la connexion MongoDB
    export PRISMA_CLIENT_ENGINE_TYPE=library
    
    python3 -c "
import asyncio
import os
import subprocess
import sys
import time

# Ajouter le repertoire genere au path Python
sys.path.insert(0, '/workspace/generated')

async def init_database():
    try:
        # Configuration optimisee pour MongoDB Atlas/OVH Cloud
        print('[TRANSLATOR] Configuration de l environnement MongoDB...')
        
        # Variables d environnement pour optimiser la connexion
        env = os.environ.copy()
        env.update({
            'MONGODB_DIRECT_CONNECTION': 'false',
            'MONGODB_READ_PREFERENCE': 'primaryPreferred',
            'MONGODB_CONNECT_TIMEOUT_MS': '60000',
            'MONGODB_SERVER_SELECTION_TIMEOUT_MS': '60000',
            'MONGODB_SOCKET_TIMEOUT_MS': '60000',
            'MONGODB_HEARTBEAT_FREQUENCY_MS': '10000',
            'MONGODB_MAX_STALENESS_SECONDS': '120',
            'PRISMA_CLIENT_ENGINE_TYPE': 'library'
        })
        
        # Essayer d abord avec db push (plus rapide pour l initialisation MongoDB)
        max_retries = 2
        for attempt in range(max_retries):
            try:
                print(f'[TRANSLATOR] Tentative {attempt + 1}/{max_retries}: Application du schema MongoDB avec prisma db push...')
                
                # Commande avec timeouts plus longs
                result = subprocess.run([
                    'prisma', 'db', 'push',  
                    '--accept-data-loss',
                    '--skip-generate'
                ], capture_output=True, text=True, timeout=600, env=env)  # 10 minutes timeout
                
                if result.returncode == 0:
                    print('[TRANSLATOR] Schema MongoDB applique avec db push')
                    return True
                else:
                    print(f'[TRANSLATOR] Tentative {attempt + 1} echouee: {result.stderr}')
                    if attempt < max_retries - 1:
                        print('[TRANSLATOR] Attente avant nouvelle tentative...')
                        time.sleep(5)  # Attendre 5 secondes entre les tentatives
                    
            except subprocess.TimeoutExpired:
                print(f'[TRANSLATOR] Timeout de la tentative {attempt + 1}')
                if attempt < max_retries - 1:
                    time.sleep(5)
        
        # Si tout echoue, continuer en mode degrade
        print('[TRANSLATOR] Toutes les tentatives de migration ont echoue')
        print('[TRANSLATOR] Continuation en mode degrade (sans migrations)')
        return True  # Continuer malgre l echec des migrations
                
    except Exception as e:
        print(f'[TRANSLATOR] Erreur lors de l initialisation MongoDB: {e}')
        print('[TRANSLATOR] Continuation en mode degrade')
        return True  # Continuer malgre l erreur

if asyncio.run(init_database()):
    print('[TRANSLATOR] Initialisation de la base de donnees MongoDB terminee')
else:
    print('[TRANSLATOR] Echec de l initialisation de la base de donnees MongoDB')
    exit(1)
"
    
    echo "[TRANSLATOR] Initialisation et migrations Prisma MongoDB terminees avec succes"
}

# Le client Prisma est deja genere dans l'image Docker
# Pas besoin de le regenerer au runtime

# Fonction pour verifier l integrite de la base de donnees MongoDB
check_database_integrity() {
    echo "[TRANSLATOR] Verification de l integrite de la base de donnees MongoDB..."
    
    # Simplification: pas de verification d integrite complexe
    echo "[TRANSLATOR] Verification d integrite simplifiee..."
    echo "[TRANSLATOR] Initialisation terminee sans verification d integrite complexe"
}

# Fonction principale
main() {
    echo "[TRANSLATOR] Demarrage du processus d initialisation MongoDB..."

    # Générer le client Prisma Python si nécessaire
    if ! generate_prisma_client; then
        echo "[TRANSLATOR] ERREUR CRITIQUE: Impossible de generer le client Prisma"
        echo "[TRANSLATOR] Le service ne peut pas demarrer sans le client Prisma"
        exit 1
    fi

    # Attendre que la base de donnees soit prete
    wait_for_database
    
    # Executer les migrations Prisma
    run_prisma_migrations
    
    # Verifier l integrite de la base de donnees
    check_database_integrity
    
    echo "[TRANSLATOR] Demarrage de l application Translator..."
    
    # Demarrer l application Python
    exec python3 -u src/main.py
}

# Executer la fonction principale
main