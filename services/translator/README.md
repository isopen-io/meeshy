# Meeshy Translation Service

## 🌟 Vue d'ensemble

Le **Meeshy Translation Service** est un microservice de traduction multi-langues intégrant intelligence artificielle et communication haute performance. Il propose une architecture hybride avec APIs REST (FastAPI) et communication ZMQ pour les services internes.

## 🚀 Fonctionnalités

### Services de traduction
- **Modèles ML** : T5-Small, NLLB-200-Distilled (600M/1.3B)
- **Détection automatique** de langue source
- **8 langues supportées** : FR, EN, ES, DE, PT, ZH, JA, AR
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

```bash
# Cloner le projet
git clone <repository-url>
cd meeshy/translator

# Créer un environnement virtuel
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# ou venv\\Scripts\\activate  # Windows

# Installer les dépendances
pip install -r requirements.txt

# Configuration (optionnel)
cp env.example .env
# Éditer .env selon vos besoins
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
test_venv/bin/pip install fastapi uvicorn aiohttp pyzmq

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

### Tests automatisés complets

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
| `basic` | t5-small | Rapide, langues européennes |
| `medium` | nllb-200-distilled-600M | Équilibré, 200 langues |
| `premium` | nllb-200-distilled-1.3B | Haute qualité, 200 langues |

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
python -c "from transformers import AutoTokenizer; AutoTokenizer.from_pretrained('t5-small')"
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
