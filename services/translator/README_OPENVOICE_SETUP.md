# 🎤 Configuration OpenVoice pour Meeshy Translator

Guide d'installation et configuration d'OpenVoice V2 pour le clonage vocal avancé.

---

## 📋 Prérequis

### ⚠️ Contrainte Python

**OpenVoice nécessite Python 3.9 ou 3.10** à cause de dépendances PyAV anciennes incompatibles avec Python 3.11+.

### ✅ Alternative Native

Si vous ne pouvez pas installer OpenVoice:
- **Chatterbox Multilingual** offre déjà le clonage vocal natif
- Support de **23 langues**
- Qualité **haute fidélité**
- **Aucune configuration supplémentaire** requise

---

## 🚀 Installation

### Option 1: Installation Automatique (Recommandée)

```bash
cd services/translator

# Installation avec détection automatique de Python
./install-openvoice.sh

# Ou forcer Python 3.9 via pyenv
./install-openvoice.sh --force-py39

# Ou ignorer OpenVoice et utiliser Chatterbox seul
./install-openvoice.sh --skip
```

**Le script va**:
1. Détecter automatiquement Python 3.9-3.10
2. Tenter d'installer OpenVoice depuis GitHub
3. Si échec, informer que Chatterbox sera utilisé
4. Le service fonctionnera dans tous les cas

### Option 2: Installation via make setup

```bash
cd /Users/smpceo/Documents/v2_meeshy

# Installation complète incluant OpenVoice (si Python compatible)
make setup
```

Le Makefile appelle automatiquement `install-openvoice.sh`.

### Option 3: Installation Manuelle

```bash
cd services/translator
source .venv/bin/activate

# Vérifier votre version Python
python --version  # Doit être 3.9.x ou 3.10.x

# Installer OpenVoice
pip install git+https://github.com/myshell-ai/OpenVoice.git

# Vérifier l'installation
python -c "from openvoice import se_extractor; print('✅ OpenVoice OK')"
```

---

## 🐳 Docker avec OpenVoice

### Utiliser Dockerfile.openvoice (Python 3.9)

```bash
cd services/translator

# Build de l'image avec OpenVoice
docker build -f Dockerfile.openvoice -t meeshy-translator:openvoice .

# Lancer le service
docker run -d \
  --name translator-openvoice \
  -p 8002:8002 \
  -p 5555:5555 \
  -v $(pwd)/models:/app/models \
  meeshy-translator:openvoice

# Vérifier les logs
docker logs translator-openvoice | grep -i "openvoice\|chatterbox"
```

### Docker Compose

Ajoutez au `docker-compose.yml`:

```yaml
services:
  translator:
    build:
      context: ./services/translator
      dockerfile: Dockerfile.openvoice  # Utiliser Python 3.9 + OpenVoice
    image: meeshy-translator:openvoice
    environment:
      - TTS_MODEL=chatterbox
      - MODELS_PATH=/app/models
    volumes:
      - ./services/translator/models:/app/models
    ports:
      - "8002:8002"
      - "5555:5555"
```

---

## 🔍 Vérification de l'Installation

### Vérifier les Backends Disponibles

```bash
source .venv/bin/activate

python -c "
import sys
print(f'Python: {sys.version}')

try:
    from openvoice import se_extractor
    print('✅ OpenVoice V2: Disponible')
except ImportError:
    print('⚠️  OpenVoice V2: Non disponible')

from services.tts.tts_service import TTSService
import asyncio

async def check():
    tts = TTSService()
    await tts.initialize()
    print(f'✅ Chatterbox: Disponible')

asyncio.run(check())
"
```

### Vérifier les Logs au Démarrage

```bash
python src/main.py 2>&1 | grep -A5 "VOICE_CLONE"
```

Vous devriez voir:

**Avec OpenVoice**:
```
✅ [VOICE_CLONE] OpenVoice V2 disponible - extraction embeddings avancée activée
╔═══════════════════════════════════════════════════════════════════╗
║ [VOICE_CLONE] Configuration: OpenVoice V2 + Chatterbox          ║
║ • Extraction embeddings: OpenVoice V2                            ║
║ • Synthèse vocale: Chatterbox Multilingual (23 langues)         ║
╚═══════════════════════════════════════════════════════════════════╝
```

**Sans OpenVoice**:
```
⚠️ [VOICE_CLONE] OpenVoice V2 non disponible (nécessite Python 3.9-3.10)
ℹ️  [VOICE_CLONE] Le clonage vocal utilisera Chatterbox Multilingual (23 langues)
╔═══════════════════════════════════════════════════════════════════╗
║ [VOICE_CLONE] Configuration: Chatterbox Multilingual             ║
║ • Clonage vocal natif (via speaker_audio_path)                   ║
║ • Support de 23 langues                                          ║
║ • Qualité haute fidélité                                         ║
║ • Pour activer OpenVoice: ./install-openvoice.sh (Python 3.9-10) ║
╚═══════════════════════════════════════════════════════════════════╝
```

---

## 🧪 Test du Clonage Vocal

### Test avec Chatterbox (toujours disponible)

```python
# test_chatterbox_clone.py
import asyncio
from services.tts.tts_service import TTSService

async def test_cloning():
    tts = TTSService()
    await tts.initialize()

    # Audio de référence (voix à cloner)
    reference_voice = "path/to/your/reference_audio.mp3"

    # Générer avec clonage vocal
    output = await tts.synthesize(
        text="Ceci est un test de clonage vocal avec Chatterbox",
        language="fr",
        speaker_audio_path=reference_voice,  # 🎤 Clone cette voix
        exaggeration=0.6,  # Expressivité
        cfg_weight=0.7,    # Fidélité
        output_path="generated/test_chatterbox_clone.mp3"
    )

    print(f"✅ Audio généré: {output}")

asyncio.run(test_cloning())
```

### Test avec OpenVoice (si installé)

```python
# test_openvoice_embeddings.py
import asyncio
from services.voice_clone_service import get_voice_clone_service

async def test_openvoice():
    service = get_voice_clone_service()
    await service.initialize()

    if service.openvoice_model:
        print("✅ OpenVoice actif - extraction embeddings avancée")
        # Extraire embedding
        embedding = await service.extract_speaker_embedding("reference.mp3")
        print(f"Embedding shape: {embedding.shape}")
    else:
        print("ℹ️  Utilisation de Chatterbox pour le clonage")

asyncio.run(test_openvoice())
```

---

## 🔧 Dépannage

### Problème: PyAV ne compile pas

**Symptôme**:
```
ERROR: Failed to build 'av' when getting requirements to build wheel
```

**Cause**: OpenVoice nécessite `av==10.*` incompatible avec Python 3.11+

**Solutions**:
1. **Utiliser Python 3.9 ou 3.10** (recommandé si OpenVoice nécessaire)
2. **Utiliser Chatterbox seul** (déjà fonctionnel, clonage vocal natif)
3. **Utiliser Docker avec Dockerfile.openvoice** (Python 3.9 intégré)

### Problème: Environnement virtuel avec mauvaise version Python

```bash
# Vérifier la version
python --version

# Recréer avec bonne version
rm -rf .venv
python3.9 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
./install-openvoice.sh
```

### Problème: OpenVoice installé mais ne s'importe pas

```bash
source .venv/bin/activate

# Vérifier l'installation
pip show MyShell-OpenVoice

# Tenter de réinstaller
pip uninstall MyShell-OpenVoice -y
pip install git+https://github.com/myshell-ai/OpenVoice.git

# Vérifier l'import
python -c "from openvoice import se_extractor"
```

---

## 📊 Comparaison des Configurations

| Aspect | Chatterbox Seul | OpenVoice + Chatterbox |
|--------|-----------------|------------------------|
| **Clonage vocal** | ✅ Natif (speaker_audio_path) | ✅ Avancé (embeddings) |
| **Langues** | ✅ 23 langues | ✅ 23 langues |
| **Python** | ✅ 3.11/3.12 | ⚠️ 3.9/3.10 uniquement |
| **Installation** | ✅ Simple | ⚠️ Dépendances complexes |
| **Qualité** | ✅ Haute fidélité | ✅ État-de-l'art |
| **Extraction embeddings** | ❌ Non | ✅ Oui |
| **Production-ready** | ✅ Oui | ⚠️ Dépend environnement |

---

## 🎯 Recommandation

### Pour Production Immédiate

**Utilisez Chatterbox seul** (configuration par défaut):
- ✅ Clonage vocal fonctionnel
- ✅ 23 langues supportées
- ✅ Python 3.11/3.12 compatible
- ✅ Installation simple
- ✅ Maintenance minimale

### Pour Recherche/Développement

**Ajoutez OpenVoice** si vous avez besoin:
- Extraction embeddings vocaux avancée
- Analyse fine des caractéristiques vocales
- Expérimentation avec modèles OpenVoice

**Utilisez Python 3.9 dans Docker** pour isoler OpenVoice.

---

## 📝 Configuration via Variables d'Environnement

```bash
# .env
TTS_MODEL=chatterbox              # Modèle TTS (chatterbox, higgs-audio-v2)
MODELS_PATH=models                # Chemin racine des modèles
HF_HOME=models/huggingface        # Cache HuggingFace
OPENVOICE_ENABLED=auto            # auto | true | false
```

---

## 🔗 Ressources

- **OpenVoice GitHub**: https://github.com/myshell-ai/OpenVoice
- **Chatterbox**: https://huggingface.co/ResembleAI/chatterbox
- **Documentation Meeshy**: [SOLUTION_CLONAGE_VOCAL.md](SOLUTION_CLONAGE_VOCAL.md)

---

## 💡 Foire Aux Questions

### Q: OpenVoice est-il obligatoire ?
**Non.** Le clonage vocal fonctionne déjà avec Chatterbox Multilingual.

### Q: Puis-je utiliser Python 3.11 avec OpenVoice ?
**Non.** OpenVoice nécessite Python 3.9-3.10 (dépendance PyAV).

### Q: Comment savoir quel backend est utilisé ?
Vérifiez les logs au démarrage du service. Le message indique clairement la configuration active.

### Q: Puis-je basculer entre Chatterbox et OpenVoice dynamiquement ?
Le service détecte automatiquement OpenVoice au démarrage. Pour changer:
1. Installer/désinstaller OpenVoice
2. Redémarrer le service

### Q: OpenVoice améliore-t-il vraiment la qualité ?
OpenVoice offre une extraction d'embeddings plus fine, mais Chatterbox fournit déjà une qualité de clonage haute fidélité suffisante pour la production.

---

**Besoin d'aide ?** Consultez [DIAGNOSTIC_TRANSLATOR_OPENVOICE.md](DIAGNOSTIC_TRANSLATOR_OPENVOICE.md) pour plus de détails.
