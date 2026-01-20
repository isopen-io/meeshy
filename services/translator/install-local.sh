#!/bin/bash

# =============================================================================
# Script d'installation locale pour le translator
# =============================================================================
# Utilise Python 3.11/3.12 et installe toutes les dépendances
# Génère le schéma Prisma Python à partir du schéma shared

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

echo "🐍 Installation des dépendances Python locales..."

# Vérifier Python disponible (3.11 ou 3.12)
PYTHON_CMD=""
if command -v python3.11 &> /dev/null; then
    PYTHON_CMD="python3.11"
elif command -v python3.12 &> /dev/null; then
    PYTHON_CMD="python3.12"
else
    echo "❌ Python 3.11 ou 3.12 n'est pas installé"
    echo "💡 Installez Python avec: brew install python@3.11"
    exit 1
fi

echo "   Utilisation de: ${PYTHON_CMD}"

# Créer l'environnement virtuel
echo "📦 Création de l'environnement virtuel..."
rm -rf .venv
${PYTHON_CMD} -m venv .venv
source .venv/bin/activate

# Mettre à jour pip
echo "⬆️ Mise à jour de pip..."
pip install --upgrade pip

# Installer les dépendances
echo "📚 Installation des dépendances Python..."
pip install -r requirements.txt

# Installer Prisma et alternatives MongoDB
echo "🍃 Installation de Prisma et MongoDB..."
pip install prisma motor pymongo

# Générer le schéma Prisma Python à partir du schéma shared
echo "🔄 Synchronisation du schéma Prisma..."
"${REPO_ROOT}/scripts/sync-prisma-schema-for-python.sh" "${SCRIPT_DIR}/schema.prisma"

# Générer le client Prisma
echo "⚙️ Génération du client Prisma Python..."
prisma generate --schema="${SCRIPT_DIR}/schema.prisma" || {
    echo "⚠️  Prisma generate a échoué (bug connu v0.15.0 sur macOS)"
    echo "   Le client sera généré au runtime ou utilisez Docker"
}

echo ""
echo "🎤 Installation des composants optionnels de clonage vocal..."
echo ""

# Installer OpenVoice (optionnel) - nécessite Python 3.9-3.10
# Si échec, le service utilisera Chatterbox Multilingual pour le clonage vocal
"${SCRIPT_DIR}/install-openvoice.sh" || {
    echo ""
    echo "ℹ️  OpenVoice non installé - utilisation de Chatterbox Multilingual pour le clonage vocal"
}

echo ""
echo "✅ Installation terminée !"
echo ""
echo "💡 Pour utiliser le translator:"
echo "   1. Mode Docker (recommandé): ./dev-docker.sh"
echo "   2. Mode local: source .venv/bin/activate && python src/main.py"

