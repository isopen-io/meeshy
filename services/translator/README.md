# Meeshy Translation Service

## 🌟 Vue d'ensemble

Le **Meeshy Translation Service** est un microservice de traduction multi-langues intégrant intelligence artificielle et communication haute performance. Il propose une architecture hybride avec APIs REST (FastAPI) et communication ZMQ pour les services internes.

## 🚀 Fonctionnalités

### Services de traduction
- **Modèles ML** : NLLB-200-Distilled (600M/1.3B)
- **Détection automatique** de langue source
- **76 langues traduisibles** (FR, EN, ES, DE, PT, ZH, JA, AR, et plus) — l'intersection entre le catalogue produit (`SUPPORTED_LANGUAGE_CODES`, `packages/shared/utils/language-codes.ts`) et les langues effectivement mappées vers un code NLLB-200 (`LANGUAGE_MAPPINGS`, `src/config/settings.py`) ; voir `_default_supported_languages_csv()` pour le calcul
- **Cache intelligent** avec Redis et stockage local
- **Traitement par lots** pour optimiser les performances

### APIs & Communication
- **REST API** (FastAPI) : Interface web standard
- **ZMQ Server** : Communication inter-services haute performance
- **gRPC** : Support des protocoles de communication avancés
- **Health Checks** : Monitoring complet avec métriques

### Architecture
- **Service principal** : Orchestration FastAPI + ZMQ
- **Services modulaires** : Translation, Cache, Message
- **Configuration flexible** : Variables d'environnement
- **Docker ready** : Conteneurisation complète

## 📋 Prérequis

- **Python** 3.12+ 
- **Dependencies** : FastAPI, uvicorn, pyzmq, transformers, torch
- **Optionnel** : Docker, Redis, PostgreSQL

## 🔧 Installation

### Installation locale

#### Méthode 1: uv sync (⚡ Recommandé - Ultra rapide!)

```bash
# Cloner le projet
git clone <repository-url>
cd meeshy/translator

# Installer uv si pas déjà fait
curl -LsSf https://astral.sh/uv/install.sh | sh

# Synchroniser les dépendances (crée automatiquement le venv)
uv sync
# Ou avec le Makefile: make uv-sync

# Activer l'environnement
source .venv/bin/activate  # Linux/Mac
# ou .venv\\Scripts\\activate  # Windows

# Configuration (optionnel)
cp env.example .env
# Éditer .env selon vos besoins
```

#### Méthode 2: Mode compatibilité (pour anciens workflows)

```bash
# Créer un environnement virtuel
python3 -m venv venv
source venv/bin/activate

# Installer avec uv (10x plus rapide que pip)
uv pip install -r requirements.txt
```

### Installation Docker

```bash
# Construction de l'image
docker-compose build translator

# Lancement du service
docker-compose up translator

# Ou complet avec base de données
docker-compose up
```

## 🚀 Démarrage

### Mode développement (Mock)

Pour les tests et développement, utilisez le serveur mock :

```bash
# Créer un venv de test
python3 -m venv test_venv
test_venv/bin/uv pip install fastapi uvicorn aiohttp pyzmq

# Lancer le serveur mock
test_venv/bin/python mock_server.py
```

Le serveur mock démarre sur :
- **REST API** : http://localhost:8000
- **ZMQ Server** : tcp://localhost:5555

### Mode production

```bash
# Avec venv local
source venv/bin/activate
python main.py

# Avec Docker
docker-compose up translator
```

## 📡 APIs Disponibles

### Health & Monitoring

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/health` | GET | État global du service |
| `/ready` | GET | Préparation du service |
| `/live` | GET | Vivacité du service |

### Traduction

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/translate` | POST | Traduction simple |
| `/translate/batch` | POST | Traduction par lots |

### Information

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/languages` | GET | Langues supportées |
| `/models` | GET | Modèles disponibles |
| `/docs` | GET | Documentation interactive |

### Debug

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/debug/cache` | GET | Statistiques cache |
| `/debug/clear-cache` | POST | Vider le cache |

## 🔌 Communication ZMQ

Le service expose un serveur ZMQ sur le port **5555** pour la communication inter-services.

### Format des messages

**Requête :**
```json
{
  "messageId": "unique-id",
  "text": "Hello world",
  "sourceLanguage": "en",
  "targetLanguage": "fr", 
  "modelType": "basic"
}
```

**Réponse :**
```json
{
  "messageId": "unique-id",
  "translatedText": "Bonjour le monde",
  "detectedSourceLanguage": "en",
  "status": 1,
  "metadata": {
    "confidenceScore": 0.95,
    "fromCache": false,
    "modelUsed": "basic",
    "processingTimeMs": 150
  }
}
```

## 🧪 Tests

### Local Development Setup (macOS/Linux)

The translator service tests can be run locally on macOS or Linux. Here's a complete setup guide:

#### Prerequisites

```bash
# macOS: Install system dependencies via Homebrew
brew install python@3.12 portaudio libsndfile ffmpeg

# Linux (Ubuntu/Debian):
# sudo apt-get install python3.12 python3.12-venv portaudio19-dev libsndfile1 ffmpeg

# Verify Python version
python3 --version  # Should be 3.12+
```

#### Environment Setup

```bash
cd services/translator

# Méthode recommandée: uv sync (inclut les dépendances de test)
uv sync --extra dev
# Ou: make uv-sync

# Activer l'environnement
source .venv/bin/activate  # macOS/Linux

# Alternative - Mode compatibilité:
# python3 -m venv venv
# source venv/bin/activate
# uv pip install -r requirements.txt
# uv pip install pytest pytest-asyncio pytest-cov
```

#### Running Tests

```bash
# Activate virtual environment
source venv/bin/activate

# Run all unit tests
pytest tests/ -v

# Run specific test file
pytest tests/test_07_voice_clone_service.py -v

# Run speaker diarization tests
pytest tests/test_08_speaker_diarization.py -v

# Run with coverage
pytest tests/ -v --cov=src --cov-report=html

# Run tests matching a pattern
pytest tests/ -v -k "fingerprint"

# Run tests and stop on first failure
pytest tests/ -v -x
```

#### Notes for macOS

- **Apple Silicon (M1/M2/M3)**: PyTorch and audio libraries work natively
- **NumPy/SciPy**: Ensure you use compatible versions with your Python
- **librosa**: Requires `libsndfile` (`brew install libsndfile`)
- **pyaudio**: Requires `portaudio` (`brew install portaudio`)
- **ffmpeg**: Required for audio format conversions

#### Quick Test (No ML Models Required)

Most unit tests use mocks and don't require downloading ML models:

```bash
# These tests run quickly without GPU/ML models
pytest tests/test_07_voice_clone_service.py -v
pytest tests/test_08_speaker_diarization.py -v
```

#### Full Integration Tests (With ML Models)

For tests requiring actual ML models:

```bash
# Set model cache directory
export MODELS_PATH=/path/to/models

# Run full test suite (slower, downloads models)
pytest tests/ -v --run-integration
```

### Tests automatisés complets (Mock Server)

```bash
# Démarrer le serveur mock dans un terminal
test_venv/bin/python mock_server.py

# Lancer les tests dans un autre terminal
test_venv/bin/python test_service.py
```

### Tests unitaires

```bash
python test_simple.py  # Tests des imports et configuration
```

### Résultats attendus

```
📊 RÉSULTATS DES TESTS:
health               : ✅ PASS
info                 : ✅ PASS
fastapi_translation  : ✅ PASS
zmq_translation      : ✅ PASS

Résultat global: 4/4 tests réussis
🎉 Tous les tests ont réussi ! Service complètement fonctionnel.
```

## 🏗️ Structure du projet

```
translator/
├── main.py                    # Point d'entrée principal
├── src/
│   ├── main.py               # Serveur principal
│   ├── api/
│   │   ├── translation_api.py # API FastAPI complète
│   │   └── health.py         # Routes de santé
│   ├── services/
│   │   ├── translation_service.py # Service ML de traduction
│   │   ├── cache_service.py       # Service de cache
│   │   ├── message_service.py     # Service de messages  
│   │   └── zmq_server.py          # Serveur ZMQ
│   └── config/
│       └── settings.py       # Configuration
├── mock_server.py            # Serveur de test avec mocks
├── test_service.py           # Tests complets
└── requirements.txt          # Dépendances Python
```

## ⚙️ Configuration

### Variables d'environnement

| Variable | Par défaut | Description |
|----------|------------|-------------|
| `FASTAPI_PORT` | 8000 | Port de l'API REST |
| `ZMQ_PORT` | 5555 | Port du serveur ZMQ |
| `GRPC_PORT` | 50051 | Port gRPC |
| `DATABASE_URL` | file:../shared/dev.db | URL base de données |
| `REDIS_URL` | redis://localhost:6379 | URL Redis cache |
| `MODELS_PATH` | /app/models | Chemin des modèles ML |
| `SUPPORTED_LANGUAGES` | fr,en,es,de,pt,zh,ja,ar | Langues supportées |
| `ML_BATCH_SIZE` | 32 | Taille des lots ML |
| `TRANSLATION_TIMEOUT` | 30 | Timeout traduction (s) |

### Modèles de traduction

| Type | Modèle | Description |
|------|--------|-------------|
| `basic` | nllb-200-distilled-600M | Rapide (capacité brute du modèle NLLB-200 — voir § Vue d'ensemble pour le catalogue Meeshy réellement traduit, 76 langues) |
| `medium` | nllb-200-distilled-600M | Alias vers basic |
| `premium` | nllb-200-distilled-1.3B | Haute qualité (capacité brute du modèle NLLB-200) |

## 🐳 Docker

### Configuration recommandée

```yaml
# docker-compose.yml (extrait)
translator:
  build: ./translator
  ports:
    - "8000:8000"  # FastAPI
    - "5555:5555"  # ZMQ
    - "50051:50051" # gRPC
  deploy:
    resources:
      limits:
        memory: 8G
        cpus: '4.0'
  environment:
    - MODELS_PATH=/app/models
    - DEVICE=cpu
```

### Health check

```bash
# Test de santé du conteneur
curl http://localhost:8000/health

# Via docker
docker-compose exec translator curl http://localhost:8000/health
```

## � Développement

### Architecture des services

1. **MeeshyTranslationServer** : Orchestrateur principal
   - Initialise tous les services
   - Gère FastAPI + ZMQ en parallèle
   - Monitoring et arrêt propre

2. **TranslationService** : Cœur métier
   - Chargement des modèles ML
   - Traduction multi-langues
   - Cache et optimisations

3. **TranslationAPI** : Interface REST
   - Routes FastAPI
   - Validation des données
   - Gestion des erreurs

4. **ZMQTranslationServer** : Communication interne
   - Protocole ZMQ REQ/REP
   - Format JSON standardisé
   - Haute performance

### Ajout d'une nouvelle langue

1. Ajouter le code langue dans `SUPPORTED_LANGUAGES`
2. Vérifier la compatibilité avec les modèles NLLB
3. Ajouter les traductions dans `/languages`
4. Tester avec les modèles medium/premium

### Ajout d'un nouveau modèle

1. Define configuration in `settings.py`
2. Implémenter le chargement dans `TranslationService`
3. Ajouter le type dans les APIs
4. Tester les performances et qualité

## 🚨 Dépannage

### Problèmes courants

**Port déjà utilisé :**
```bash
# Libérer le port 8000
lsof -ti:8000 | xargs kill -9

# Ou changer le port
export FASTAPI_PORT=8001
```

**Modèles non trouvés :**
```bash
# Vérifier le chemin
echo $MODELS_PATH
ls -la $MODELS_PATH

# Téléchargement manuel si nécessaire
python -c "from transformers import AutoTokenizer; AutoTokenizer.from_pretrained('facebook/nllb-200-distilled-600M')"
```

**Erreurs ZMQ :**
```bash
# Tester la connectivité ZMQ
python -c "import zmq; print('ZMQ version:', zmq.pyzmq_version())"
```

### Logs

```bash
# Logs du service
tail -f logs/translation_service.log

# Logs Docker
docker-compose logs -f translator
```

## � Performance

### Métriques recommandées

- **Latence** : < 200ms (basic), < 500ms (premium)
- **Throughput** : > 100 req/s (selon hardware)
- **Cache hit rate** : > 80% en production
- **Accuracy** : > 0.9 confidence score

### Optimisations

1. **Cache** : Augmenter la TTL pour les traductions fréquentes
2. **Batch processing** : Grouper les requêtes similaires
3. **GPU** : Utiliser CUDA si disponible
4. **Load balancing** : Plusieurs instances derrière un proxy

## 🤝 Contribution

1. Fork le projet
2. Créer une branche feature (`git checkout -b feature/nouvelle-fonctionnalite`)
3. Commiter les changements (`git commit -am 'Ajout nouvelle fonctionnalité'`)
4. Pousser vers la branche (`git push origin feature/nouvelle-fonctionnalite`)
5. Créer une Pull Request

## 📝 Changelog

### v1.0.0 (2025-08-03)
- ✅ Service de traduction avec FastAPI + ZMQ
- ✅ Support de 8 langues avec modèles ML
- ✅ Cache intelligent Redis + local
- ✅ Health checks et monitoring
- ✅ Tests automatisés complets
- ✅ Documentation API interactive
- ✅ Configuration Docker complète

## 📄 Licence

Ce projet est sous licence MIT. Voir le fichier `LICENSE` pour plus de détails.

## 👥 Équipe

- **Développement** : Équipe Meeshy
- **Architecture** : Microservices avec ML
- **Support** : Issues GitHub

---

**🌟 Meeshy Translation Service - Traduction intelligente pour applications multilingues**
