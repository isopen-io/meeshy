#!/bin/bash
set -e

echo "[GATEWAY] 🚀 Démarrage du service Gateway..."

# Fonction pour attendre que la base de données soit prête
wait_for_database() {
    if [ "$DATABASE_TYPE" = "MONGODB" ]; then
        echo "[GATEWAY] 🔄 Attente de la base de données MongoDB..."
        # Pour MongoDB, la santé est gérée par docker-compose healthcheck
        sleep 10 # Donner un peu de temps à MongoDB pour démarrer
        echo "[GATEWAY] ✅ Base de données MongoDB (supposée) prête"
    elif [ "$DATABASE_TYPE" = "POSTGRESQL" ]; then
        echo "[GATEWAY] 🔄 Attente de la base de données PostgreSQL..."
        DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*@\([^:]*\):.*/\1/p')
        DB_PORT=$(echo $DATABASE_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
        DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')
        DB_USER=$(echo $DATABASE_URL | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
        
        # Attendre que PostgreSQL soit prêt
        until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME"; do
            echo "[GATEWAY] ⏳ Base de données non prête, attente de 5 secondes..."
            sleep 5
        done
        echo "[GATEWAY] ✅ Base de données PostgreSQL prête"
    else
        echo "[GATEWAY] ⚠️ Type de base de données non spécifié ou inconnu. Pas d'attente."
    fi
}

# Fonction principale
main() {
    echo "[GATEWAY] 🎯 Démarrage du processus d'initialisation..."
    
    # Attendre que la base de données soit prête
    wait_for_database
    
    echo "[GATEWAY] 🚀 Démarrage de l'application Gateway..."

    # Execute the server directly (USER directive ensures we're already running as gateway)
    exec node dist/src/server.js
}

# Exécuter la fonction principale
main
