# =============================================================================
# Dockerfile - Service Translator avec Support de Diarisation
# =============================================================================
# Utilise Python 3.11 pour compatibilité avec chatterbox-tts et pyannote.audio
#
# Build:
#   docker build -t meeshy-translator:latest .
#
# Run:
#   docker run -p 8002:8002 -p 5555:5555 \
#     -e ENABLE_DIARIZATION=true \
#     -e HF_TOKEN=your_token \
#     meeshy-translator:latest
# =============================================================================

FROM python:3.11-slim

LABEL maintainer="Meeshy Platform"
LABEL description="Translator Service avec support de transcription, traduction et diarisation"
LABEL python.version="3.11"
LABEL diarization.enabled="true"

# Variables d'environnement
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DEBIAN_FRONTEND=noninteractive \
    # Chemins des modèles ML
    MODELS_PATH=/app/models \
    HF_HOME=/app/models/huggingface \
    TRANSFORMERS_CACHE=/app/models/huggingface \
    # Configuration service
    PYTHONPATH=/app/src \
    TTS_MODEL=chatterbox \
    # Diarisation
    ENABLE_DIARIZATION=true

WORKDIR /app

# Installer dépendances système
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Build tools
    gcc \
    g++ \
    make \
    cmake \
    pkg-config \
    # Audio/video processing
    ffmpeg \
    libavcodec-dev \
    libavformat-dev \
    libavutil-dev \
    libswscale-dev \
    libsndfile1 \
    libsndfile1-dev \
    # Réseau
    git \
    curl \
    # Nettoyage
    && rm -rf /var/lib/apt/lists/*

# Copier requirements
COPY requirements.txt requirements-optional.txt ./

# Installer dépendances Python principales
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Installer dépendances de diarisation (pyannote.audio + scikit-learn)
# Note: librosa est déjà inclus via chatterbox-tts
RUN echo "🎯 Installation des dépendances de diarisation..." && \
    pip install --no-cache-dir pyannote.audio>=3.1.0 scikit-learn>=1.3.0 && \
    echo "✅ Dépendances de diarisation installées" || \
    echo "⚠️  Installation de diarisation échouée - utilisation du fallback pitch clustering"

# Vérifier l'installation pyannote.audio
RUN python -c "from pyannote.audio import Pipeline; print('✅ pyannote.audio disponible pour diarisation précise')" || \
    echo "ℹ️  pyannote.audio non disponible - fallback pitch clustering sera utilisé"

# Vérifier scikit-learn
RUN python -c "from sklearn.cluster import KMeans; print('✅ scikit-learn disponible')" || \
    echo "⚠️  scikit-learn non disponible - fonctionnalités de clustering limitées"

# Copier le code source
COPY . .

# Créer les répertoires nécessaires
RUN mkdir -p \
    /app/models/huggingface \
    /app/models/whisper \
    /app/models/openvoice \
    /app/models/voice_cache \
    /app/uploads \
    /app/generated/audios \
    /app/embeddings/voices \
    /app/analytics_data \
    /app/logs

# Permissions
RUN chmod -R 755 /app && \
    chmod +x /app/src/main.py 2>/dev/null || true

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8002/health').raise_for_status()" || exit 1

# Exposer les ports
EXPOSE 8002 5555 5558

# Point d'entrée
CMD ["python", "-u", "src/main.py"]
