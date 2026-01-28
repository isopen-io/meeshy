# Migration: Chatterbox TTS et Transformers 5.0

## 🚨 Problème de Compatibilité

**chatterbox-tts est incompatible avec transformers 5.0.0**

```
Conflit de dépendances:
- chatterbox-tts requiert EXACTEMENT transformers==4.46.3
- Le projet requiert transformers>=5.0.0 (pour la traduction ML)
```

### Pourquoi ce conflit ?

Chatterbox TTS utilise une implémentation d'attention (`LlamaSdpaAttention`) qui nécessite des modifications pour supporter transformers 5.0. Le package n'a pas encore été mis à jour pour la nouvelle version.

Sources:
- [chatterbox-tts on PyPI](https://pypi.org/project/chatterbox-tts/)
- [Transformers v5.0 release notes](https://huggingface.co/blog/transformers-v5)

---

## ✅ Solution Implémentée

### 1. Chatterbox TTS rendu optionnel

**Changements dans pyproject.toml:**

```toml
# TTS (Text-to-Speech) - NOTE: Chatterbox est optionnel
# chatterbox-tts>=0.1.0 - DÉSACTIVÉ: incompatible avec transformers 5.0 (requiert 4.46.3)
```

Le package `chatterbox-tts` a été **retiré des dépendances principales** pour permettre au projet d'utiliser transformers 5.0.0.

### 2. Backends TTS alternatifs déjà intégrés

Le service dispose déjà de **5 backends TTS** différents:

| Backend | Langues | Clonage vocal | Transformers 5.0 |
|---------|---------|---------------|------------------|
| **MMS TTS** | 1100+ | ❌ | ✅ Compatible |
| **VITS** (ESPnet2) | Spécifique (ex: Lingala) | ✅ (via OpenVoice) | ✅ Compatible |
| **XTTS** (Coqui) | Multi | ✅ | ✅ Compatible |
| **Higgs Audio** | Multi | ❌ | ✅ Compatible |
| ~~Chatterbox~~ | 23 langues | ✅ | ❌ **Incompatible** |

### 3. Sélection automatique via LanguageRouter

Le `LanguageRouter` sélectionne automatiquement le meilleur backend selon la langue:

```python
# services/tts/language_router.py

1. VITS pour langues spécifiques (ex: Lingala)
2. Chatterbox pour langues multilingues avec clonage (SI DISPONIBLE)
3. MMS pour langues africaines (1100+ langues)
4. Fallback sur MMS pour langues non supportées
```

**Si Chatterbox n'est pas disponible**, le système utilise automatiquement les alternatives compatibles.

---

## 🔄 Alternatives TTS compatibles Transformers 5.0

### Option 1: MMS TTS (Meta) - **Déjà intégré** ✅

**Avantages:**
- ✅ **Déjà implémenté** dans `MMSBackend`
- ✅ Support de 1100+ langues
- ✅ Compatible transformers 5.0 (utilise `VitsModel`)
- ✅ Idéal pour langues africaines

**Inconvénients:**
- ❌ Pas de clonage vocal
- ❌ Voix synthétique seulement

**Utilisation:**
```python
# Déjà configuré - aucune installation nécessaire
# Le LanguageRouter sélectionne automatiquement MMS
```

### Option 2: VITS (ESPnet2) + OpenVoice - **Déjà intégré** ✅

**Avantages:**
- ✅ **Déjà implémenté** dans `VITSBackend`
- ✅ Clonage vocal via OpenVoice ToneColorConverter
- ✅ Haute qualité pour langues spécifiques

**Inconvénients:**
- ⚠️ Langues limitées (actuellement: Lingala)
- ⚠️ Nécessite modèles spécifiques par langue

**Utilisation:**
```python
# Déjà configuré pour Lingala (ln)
# Ajouter d'autres langues en installant les modèles VITS correspondants
```

### Option 3: Parler-TTS (HuggingFace officiel) - **Recommandé**

**Avantages:**
- ✅ **Officiel HuggingFace**
- ✅ Compatible transformers 5.0 (natif)
- ✅ Multilingue
- ✅ Contrôle fin de la voix (ton, style, vitesse)

**Installation:**
```bash
source .venv/bin/activate
uv pip install parler-tts
```

**Intégration:**
```python
# À implémenter: ParlerTTSBackend
# Suivre le pattern des autres backends dans src/services/tts/backends/
```

Sources:
- [Parler-TTS GitHub](https://github.com/huggingface/parler-tts)
- [HuggingFace Text-to-Speech docs](https://huggingface.co/docs/transformers/en/tasks/text-to-speech)

### Option 4: Coqui TTS - **Déjà intégré (partiellement)** ✅

**Avantages:**
- ✅ Support de 1100+ langues
- ✅ Multi-speaker et multilingual
- ✅ Compatible PyTorch 2.2+

**Installation:**
```bash
source .venv/bin/activate
uv pip install coqui-tts
```

**Note:** Backend `XTTSBackend` existe déjà mais peut nécessiter mise à jour.

Sources:
- [Coqui TTS GitHub](https://github.com/coqui-ai/TTS)
- [Coqui TTS on PyPI](https://pypi.org/project/coqui-tts/)

### Option 5: Qwen3-TTS (Alibaba, janvier 2026) - **Nouveau**

**Avantages:**
- ✅ Entraîné sur 5M+ heures de speech data
- ✅ 10 langues supportées
- ✅ Apache 2.0 license
- ✅ État de l'art (janvier 2026)

**Installation:**
```bash
# À vérifier - package peut ne pas encore être disponible sur PyPI
# Voir: https://huggingface.co/Qwen
```

Sources:
- [Qwen3-TTS announcement](https://dev.to/gary_yan_86eb77d35e0070f5/qwen3-tts-the-open-source-text-to-speech-revolution-in-2026-3466)

---

## 🛠️ Si vous avez BESOIN de Chatterbox TTS

### Option A: Environnement séparé (recommandé)

Créez un environnement Python dédié pour Chatterbox avec transformers 4.46.3:

```bash
# Créer un environnement séparé
cd /Users/smpceo/Documents/v2_meeshy/services/translator
python3 -m venv venv-chatterbox

# Activer
source venv-chatterbox/bin/activate

# Installer chatterbox avec transformers 4.46.3
pip install chatterbox-tts transformers==4.46.3

# Utilisation
python your_chatterbox_script.py
```

**Avantages:**
- ✅ Pas de conflit avec l'environnement principal
- ✅ Chatterbox fonctionne avec sa version de transformers

**Inconvénients:**
- ❌ Deux environnements à gérer
- ❌ Ne peut pas utiliser traduction + Chatterbox dans le même processus

### Option B: Conteneurs Docker séparés

**Service Translator (transformers 5.0):**
```dockerfile
# Dockerfile
FROM python:3.11-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv
COPY requirements.txt ./
RUN uv pip install --system transformers>=5.0.0
```

**Service TTS Chatterbox (transformers 4.46.3):**
```dockerfile
# Dockerfile.chatterbox
FROM python:3.11-slim
RUN pip install chatterbox-tts transformers==4.46.3
```

**Avantages:**
- ✅ Services isolés
- ✅ Chacun avec sa version de transformers

**Inconvénients:**
- ❌ Architecture plus complexe
- ❌ Communication inter-services nécessaire

### Option C: Attendre la mise à jour de chatterbox-tts

**Statut actuel:** Chatterbox TTS n'est pas encore compatible transformers 5.0

**Actions possibles:**
1. Ouvrir une issue sur le repo GitHub de Chatterbox
2. Contribuer un PR pour la compatibilité transformers 5.0
3. Forker et patcher localement

**Suivi:**
- Watch le repo: https://github.com/resemble-ai/chatterbox
- Vérifier PyPI pour nouvelles versions: https://pypi.org/project/chatterbox-tts/

---

## 📊 Matrice de compatibilité

| Fonctionnalité | Avec Chatterbox | Sans Chatterbox |
|----------------|-----------------|-----------------|
| **Traduction ML** | ❌ Bloqué (transformers 4.46.3) | ✅ Fonctionne (transformers 5.0) |
| **TTS général** | ✅ 23 langues | ✅ 1100+ langues (MMS) |
| **Clonage vocal** | ✅ Natif | ✅ Via VITS+OpenVoice |
| **Langues africaines** | ⚠️ Limitées | ✅ Excellent (MMS) |
| **Installation** | ⚠️ Env séparé requis | ✅ Simple (`uv sync`) |

---

## 🚀 Commandes de migration

### Installation complète (SANS Chatterbox)

```bash
cd /Users/smpceo/Documents/v2_meeshy/services/translator

# Synchroniser avec transformers 5.0
uv sync --extra dev

# Vérifier transformers
source .venv/bin/activate
python -c "import transformers; print(f'Transformers: {transformers.__version__}')"
# Output: Transformers: 5.0.0
```

### Tests

```bash
# Activer l'environnement
source .venv/bin/activate

# Lancer les tests (skip chatterbox-specific tests)
pytest tests/ -v -k "not chatterbox" --tb=short
```

### Vérifier les backends disponibles

```python
from services.tts_service import get_unified_tts_service

tts = get_unified_tts_service()

# Lister les backends disponibles
print(tts.model_manager.list_backends())
```

---

## 📝 Résumé

### ✅ Ce qui fonctionne maintenant

- ✅ **Traduction ML avec transformers 5.0.0**
- ✅ **TTS via MMS (1100+ langues)**
- ✅ **TTS via VITS + OpenVoice (Lingala)**
- ✅ **Clonage vocal via VITS + OpenVoice**
- ✅ **Installation ultra-rapide avec `uv sync`**

### ❌ Ce qui ne fonctionne plus

- ❌ **Chatterbox TTS** (incompatible transformers 5.0)
- ❌ **Tests dépendants de Chatterbox** (23 tests à skip)

### 🔄 Alternatives recommandées

1. **Court terme:** Utiliser MMS + VITS (déjà intégrés)
2. **Moyen terme:** Intégrer Parler-TTS (HuggingFace officiel)
3. **Long terme:** Attendre chatterbox-tts compatible transformers 5.0

---

## 📚 Références

- **Transformers 5.0:** https://huggingface.co/blog/transformers-v5
- **MMS TTS:** https://huggingface.co/docs/transformers/en/model_doc/vits
- **Parler-TTS:** https://github.com/huggingface/parler-tts
- **Coqui TTS:** https://github.com/coqui-ai/TTS
- **Qwen3-TTS:** https://dev.to/gary_yan_86eb77d35e0070f5/qwen3-tts-the-open-source-text-to-speech-revolution-in-2026-3466

---

## 💬 Questions ?

Pour toute question sur cette migration:

1. Vérifier les backends disponibles dans `src/services/tts/backends/`
2. Consulter le `LanguageRouter` pour la sélection automatique
3. Voir `TRANSFORMERS_V5_MIGRATION.md` pour la migration de traduction
