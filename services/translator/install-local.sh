#!/bin/bash

# Script d'installation locale pour le translator (sans Prisma)
# Utilise Python 3.12 et installe toutes les dépendances sauf Prisma

echo "🐍 Installation des dépendances Python locales (sans Prisma)..."

# Vérifier que Python 3.12 est disponible
if ! command -v python3.12 &> /dev/null; then
    echo "❌ Python 3.12 n'est pas installé"
    echo "💡 Installez Python 3.12 avec: brew install python@3.12"
    exit 1
fi

# Créer l'environnement virtuel avec Python 3.12
echo "📦 Création de l'environnement virtuel avec Python 3.12..."
rm -rf .venv
python3.12 -m venv .venv
source .venv/bin/activate

# Mettre à jour pip
echo "⬆️ Mise à jour de pip..."
pip install --upgrade pip

# Installer les dépendances (sans Prisma)
echo "📚 Installation des dépendances Python..."
pip install -r requirements.txt

# Installer des alternatives à Prisma pour MongoDB
echo "🍃 Installation des alternatives MongoDB..."
pip install motor pymongo

echo "✅ Installation terminée !"
echo ""
echo "💡 Pour utiliser le translator:"
echo "   1. Mode Docker (recommandé): ./dev-docker.sh"
echo "   2. Mode local (sans Prisma): source .venv/bin/activate && python src/main.py"
echo ""
echo "⚠️  Note: Prisma ne fonctionne pas localement à cause d'un bug dans v0.15.0"
echo "   Utilisez Docker pour un environnement complet avec Prisma"

