#!/bin/bash

# Script de démarrage pour le développement local du service de traduction Meeshy

echo "🚀 Démarrage du service de traduction en mode développement local..."

# Activer l'environnement virtuel
source .venv/bin/activate

# Configuration des variables d'environnement pour le développement local
export DEBUG=true
export WORKERS=2
export FASTAPI_PORT=8000
export GRPC_PORT=50051
export ZMQ_PORT=5555
export DATABASE_TYPE=MONGODB
export DATABASE_URL="mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true"
export PRISMA_POOL_SIZE=5
export REDIS_URL="redis://localhost:6379"
export TRANSLATION_CACHE_TTL=3600
export CACHE_MAX_ENTRIES=1000
export ML_BATCH_SIZE=16
export GPU_MEMORY_FRACTION=0.5
export MODELS_PATH="models"
export DEFAULT_LANGUAGE="fr"
export SUPPORTED_LANGUAGES="fr,en,es,de,pt,zh,ja,ar"
export AUTO_DETECT_LANGUAGE=true
export BASIC_MODEL="t5-small"
export MEDIUM_MODEL="t5-base"
export PREMIUM_MODEL="facebook/nllb-200-distilled-600M"
export TRANSLATION_TIMEOUT=30
export MAX_TEXT_LENGTH=5000
export CONCURRENT_TRANSLATIONS=5
export MODEL_LOAD_TIMEOUT=300
export TOKENIZER_LOAD_TIMEOUT=60
export HUGGINGFACE_TIMEOUT=180
export HF_HUB_DISABLE_SSL_VERIFICATION=1
export TRANSLATION_WORKERS=10
export QUANTIZATION_LEVEL="float32"
export MODEL_DOWNLOAD_MAX_RETRIES=2
export MODEL_DOWNLOAD_TIMEOUT=180
export MODEL_DOWNLOAD_CONSECUTIVE_TIMEOUTS=2
export PYTHONPATH="src"
export PYTHONUNBUFFERED=1

# Générer le client Prisma
echo "🔧 Génération du client Prisma..."
export PRISMA_CLIENT_OUTPUT_DIRECTORY=./prisma/client
prisma generate --schema=../shared/schema.prisma

# Créer le dossier models s'il n'existe pas
mkdir -p models

# Démarrer le service
echo "🚀 Démarrage du service de traduction..."
cd src && python main.py
