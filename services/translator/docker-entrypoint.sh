#!/bin/bash
set -e

echo "[TRANSLATOR] 🚀 Démarrage du service Translator..."

# Fonction pour attendre que la base de données soit prête
wait_for_database() {
    echo "[TRANSLATOR] 🔄 Attente de la base de données..."
    
    # Attendre que la base de données soit accessible
    echo "[TRANSLATOR] ⏳ Attente de la base de données (30 secondes)..."
    sleep 30
    
    echo "[TRANSLATOR] ✅ Base de données supposée prête"
}

# Fonction principale
main() {
    echo "[TRANSLATOR] 🎯 Démarrage du processus d'initialisation..."
    
    # Attendre que la base de données soit prête
    wait_for_database
    
    echo "[TRANSLATOR] 🚀 Démarrage de l'application Translator..."
    
    # Démarrer l'application Python
    exec python3 -u src/main.py
}

# Exécuter la fonction principale
main