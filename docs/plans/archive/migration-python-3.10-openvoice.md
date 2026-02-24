# Plan de migration : Python 3.11 → 3.10 (pour OpenVoice)

## 🎯 Objectif

Migrer le service Translator de Python 3.11 vers Python 3.10 pour activer **OpenVoice** et obtenir le **clonage vocal complet pour le Lingala**.

## 📊 Analyse de compatibilité

### ✅ Packages compatibles Python 3.10

| Package | Python 3.10 | Python 3.11 | Notes |
|---------|-------------|-------------|-------|
| **chatterbox-tts** | ✅ Minimum requis | ✅ Recommandé | Nécessite >=3.10 |
| **faster-whisper** | ✅ Testé | ✅ Testé | Python 3.9+ |
| **pyannote.audio** | ✅ Supporté | ✅ Supporté | Python 3.9+ |
| **espnet** | ✅ Compatible | ✅ Compatible | Python 3.9-3.13 |
| **OpenVoice** | ✅ Compatible | ❌ INCOMPATIBLE | Nécessite 3.9-3.10 |
| **fastapi** | ✅ Compatible | ✅ Compatible | Toutes versions |
| **pydantic v2** | ✅ Compatible | ✅ Compatible | Toutes versions |

**Verdict** : ✅ Migration viable sans perte de fonctionnalités (sauf performance mineure)

## 🔄 Modifications nécessaires

### 1. `.python-version`

```diff
- 3.11.13
+ 3.10.15
```

### 2. `Dockerfile`

```diff
  # Build Arguments
- ARG PYTHON_VERSION=3.11
+ ARG PYTHON_VERSION=3.10
  ARG NODE_VERSION=22
```

```diff
  # Labels
- python.version="3.11"
+ python.version="3.10"
```

### 3. `requirements.txt`

Ajouter OpenVoice :

```diff
  # OpenVoice V2 (LEGACY) - Voice Cloning
- # ❌ INCOMPATIBLE with Python 3.11+ (requires Python 3.9-3.10)
- # Not installed by default - see requirements-optional.txt for details
- # Manual installation: pip install git+https://github.com/myshell-ai/OpenVoice.git
+ # ✅ COMPATIBLE with Python 3.10 - Voice Cloning for Lingala
+ git+https://github.com/myshell-ai/OpenVoice.git@main
```

### 4. `Dockerfile` - Vérification OpenVoice

```diff
  # Verify critical components installation
  RUN echo "=== Verifying critical components ===" && \
      python -c "from pyannote.audio import Pipeline; print('✅ pyannote.audio available for speaker diarization')" && \
      python -c "from sklearn.cluster import KMeans; print('✅ scikit-learn available')" && \
      python -c "import zmq; print('✅ ZeroMQ available')" && \
-     python -c "from espnet2.bin.tts_inference import Text2Speech; print('✅ ESPnet2 available for VITS TTS backend')" && \
+     python -c "from espnet2.bin.tts_inference import Text2Speech; print('✅ ESPnet2 available for VITS TTS backend')" && \
+     python -c "from openvoice.api import ToneColorConverter; print('✅ OpenVoice available for voice cloning')" && \
      echo "✅ All critical components verified successfully"
```

### 5. `vits_backend.py` - Message de log

Le code actuel log un warning si OpenVoice n'est pas disponible. Avec Python 3.10, il devrait être disponible :

```python
# Aucune modification nécessaire - le code détecte automatiquement OpenVoice
# Les logs passeront de :
# "⚠️ OpenVoice non disponible"
# à :
# "✅ OpenVoice disponible pour clonage vocal"
```

### 6. Configuration Docker Compose

**Aucune modification nécessaire** - la configuration utilise déjà `${PYTHON_VERSION}` du Dockerfile.

## 📦 Téléchargement des checkpoints OpenVoice

OpenVoice nécessite des checkpoints pré-entraînés. Deux options :

### Option A : Téléchargement manuel (recommandé pour production)

```bash
# Créer le répertoire
mkdir -p services/translator/models/openvoice/converter

# Télécharger les checkpoints depuis HuggingFace
cd services/translator/models/openvoice/converter

# Config
wget https://huggingface.co/myshell-ai/OpenVoiceV2/resolve/main/converter/config.json

# Checkpoint
wget https://huggingface.co/myshell-ai/OpenVoiceV2/resolve/main/converter/checkpoint.pth
```

### Option B : Téléchargement automatique (au premier lancement)

Le code VITS backend téléchargera automatiquement les checkpoints depuis HuggingFace au premier usage :

```python
# Dans vits_backend.py, méthode _initialize_openvoice()
# Vérifie si les fichiers existent, sinon télécharge automatiquement
```

**Recommandation** : Option A pour éviter latence au premier démarrage.

## 🚀 Procédure de migration

### Étape 1 : Backup

```bash
# Créer une branche de migration
git checkout -b feat/python-3.10-openvoice

# Tag la version actuelle
git tag -a v-before-python-3.10 -m "Avant migration Python 3.10"
```

### Étape 2 : Modifications des fichiers

```bash
# 1. Modifier .python-version
echo "3.10.15" > services/translator/.python-version

# 2. Modifier Dockerfile (manuellement ou avec sed)
sed -i '' 's/ARG PYTHON_VERSION=3.11/ARG PYTHON_VERSION=3.10/' services/translator/Dockerfile
sed -i '' 's/python.version="3.11"/python.version="3.10"/' services/translator/Dockerfile

# 3. Ajouter OpenVoice au requirements.txt
echo "" >> services/translator/requirements.txt
echo "# OpenVoice V2 - Voice Cloning (Python 3.10 compatible)" >> services/translator/requirements.txt
echo "git+https://github.com/myshell-ai/OpenVoice.git@main" >> services/translator/requirements.txt
```

### Étape 3 : Télécharger les checkpoints OpenVoice

```bash
# Créer le répertoire
mkdir -p services/translator/models/openvoice/converter

# Télécharger (nécessite wget ou curl)
cd services/translator/models/openvoice/converter

wget https://huggingface.co/myshell-ai/OpenVoiceV2/resolve/main/converter/config.json
wget https://huggingface.co/myshell-ai/OpenVoiceV2/resolve/main/converter/checkpoint.pth

# Vérifier
ls -lh
# Devrait afficher :
# config.json (~2 KB)
# checkpoint.pth (~200 MB)
```

### Étape 4 : Rebuild et test

```bash
# Supprimer les anciennes images
docker rmi isopen/meeshy-translator:latest

# Rebuild avec Python 3.10
make docker-build-translator

# Démarrer
make docker-local

# Vérifier les logs
docker logs -f meeshy-local-translator

# Chercher :
# "✅ ESPnet2 available"
# "✅ OpenVoice available for voice cloning"
```

### Étape 5 : Test fonctionnel

```bash
# Test 1 : Espagnol (Chatterbox - devrait toujours fonctionner)
curl -X POST http://localhost:8000/api/tts/synthesize \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hola, ¿cómo estás?",
    "language": "es",
    "speaker_audio_path": "/path/to/voice.mp3"
  }'

# Test 2 : Lingala avec clonage vocal (NOUVEAU - VITS + OpenVoice)
curl -X POST http://localhost:8000/api/tts/synthesize \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Mbote, ozali malamu?",
    "language": "ln",
    "speaker_audio_path": "/path/to/voice.mp3"
  }'

# Vérifier dans les logs :
# [VITS] ✅ OpenVoice ToneColorConverter chargé
# [VITS] 🎤 Clonage vocal activé
```

### Étape 6 : Validation complète

```bash
# Exécuter les tests
docker exec meeshy-local-translator pytest tests/ -v

# Tests spécifiques clonage vocal
docker exec meeshy-local-translator pytest tests/test_vits_backend.py -v
docker exec meeshy-local-translator pytest tests/test_unified_tts_service.py -v
```

## 📊 Résultats attendus

### Avant migration (Python 3.11)

```
┌─────────────────────────────────────────────────────────────┐
│ LINGALA : Mode dégradé                                     │
├─────────────────────────────────────────────────────────────┤
│ Pipeline : VITS seul (pas de clonage vocal)                │
│ Output   : Voix synthétique neutre                         │
│ Latence  : ~2.5 secondes                                    │
│ Qualité  : ⚠️ Moyenne (pas de personnalisation)           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ ESPAGNOL : Optimal                                          │
├─────────────────────────────────────────────────────────────┤
│ Pipeline : Chatterbox natif                                 │
│ Output   : Voix clonée haute qualité                       │
│ Latence  : ~1.5-2 secondes                                  │
│ Qualité  : ✅ Excellente                                   │
└─────────────────────────────────────────────────────────────┘
```

### Après migration (Python 3.10)

```
┌─────────────────────────────────────────────────────────────┐
│ LINGALA : Complet avec clonage vocal ✅                    │
├─────────────────────────────────────────────────────────────┤
│ Pipeline : VITS + OpenVoice (hybride)                       │
│ Output   : Voix clonée personnalisée                       │
│ Latence  : ~3.5-5 secondes                                  │
│ Qualité  : ✅ Bonne (clonage vocal actif)                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ ESPAGNOL : Identique (aucun changement)                    │
├─────────────────────────────────────────────────────────────┤
│ Pipeline : Chatterbox natif                                 │
│ Output   : Voix clonée haute qualité                       │
│ Latence  : ~1.5-2 secondes                                  │
│ Qualité  : ✅ Excellente                                   │
└─────────────────────────────────────────────────────────────┘
```

## ⚠️ Compromis et limitations

### Performance CPU

```
Python 3.11 vs 3.10 : ~20-25% plus rapide pour code Python pur
Impact sur Meeshy  : ~5-10% pour charge ML (modèles dominent)

Verdict : Acceptable
- La latence ML >> latence Python
- Gain clonage vocal > perte performance CPU
```

### Nouvelles fonctionnalités Python perdues

**Python 3.11 features non disponibles en 3.10 :**
- `tomllib` (parsing TOML natif) → Utiliser `tomli` package
- Exception groups → Pas utilisé actuellement
- Task groups (asyncio) → Pas utilisé actuellement
- Fine-grained error locations → Messages moins précis
- `Self` type hint → Utiliser `TypeVar` à la place

**Impact sur Meeshy** : ❌ Minimal - aucune de ces features n'est critique

### Taille de l'image Docker

```
Avant (Python 3.11) : ~2.5 GB
Après (Python 3.10) : ~2.7 GB (+200 MB pour OpenVoice)

Verdict : Acceptable pour le clonage vocal complet
```

## 🎯 Recommandation finale

### ✅ RECOMMANDÉ : Migrer vers Python 3.10

**Raisons :**
1. ✅ Clonage vocal complet pour Lingala (via VITS + OpenVoice)
2. ✅ Stack 100% compatible
3. ✅ Performance acceptable (perte CPU ~5-10% sur charge réelle)
4. ✅ Pas de fonctionnalités critiques perdues
5. ✅ Meilleure expérience utilisateur (voix personnalisées)

**Contre-indications :**
- ❌ Si performance CPU pure critique (serveurs à faible puissance)
- ❌ Si besoin fonctionnalités Python 3.11+ spécifiques
- ❌ Si besoin Python 3.12+ pour d'autres raisons

### Alternative : Conteneur dual-version

Si migration complète non souhaitée, créer un conteneur Python 3.10 dédié pour OpenVoice :

```yaml
# docker-compose.yml
services:
  translator:      # Python 3.11 (service principal)
  openvoice-svc:   # Python 3.10 (clonage vocal seulement)
    # Communication via queue Redis
```

**Complexité** : ⚠️ Plus élevée (2 services, queue messages, orchestration)
**Bénéfice** : Garde Python 3.11 pour le code principal

## 📝 Checklist de migration

- [ ] Backup code actuel (git tag)
- [ ] Créer branche `feat/python-3.10-openvoice`
- [ ] Modifier `.python-version` → 3.10.15
- [ ] Modifier `Dockerfile` PYTHON_VERSION → 3.10
- [ ] Ajouter OpenVoice à `requirements.txt`
- [ ] Télécharger checkpoints OpenVoice (200 MB)
- [ ] Rebuild image Docker
- [ ] Tester Espagnol (Chatterbox - régression check)
- [ ] Tester Lingala avec clonage vocal (nouveau)
- [ ] Exécuter test suite complète
- [ ] Vérifier logs (pas de warnings critiques)
- [ ] Mesurer performance (latence acceptable)
- [ ] Documenter changements
- [ ] Merger dans dev
- [ ] Déployer en staging
- [ ] Valider avec utilisateurs réels

## 🔗 Références

- [chatterbox-tts PyPI](https://pypi.org/project/chatterbox-tts/)
- [faster-whisper compatibility](https://pypi.org/project/faster-whisper/)
- [pyannote.audio compatibility](https://pypi.org/project/pyannote-audio/)
- [OpenVoice GitHub](https://github.com/myshell-ai/OpenVoice)
- [Python 3.10 Release Notes](https://docs.python.org/3/whatsnew/3.10.html)
