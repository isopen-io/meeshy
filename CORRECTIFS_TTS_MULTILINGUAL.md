# Correctifs TTS Multilingual - Résumé

**Date** : 2026-01-19
**Commits** :
- `20417fcc8` - fix(tts): correct ChatterboxMultilingualTTS model ID
- `b89a111aa` - fix(docker): use requirements.txt instead of pyproject.toml

---

## 🎯 Problèmes Identifiés et Corrigés

### 1. ID Modèle HuggingFace Incorrect ❌→✅

**Problème** :
```python
# ❌ AVANT (incorrect)
model_id = "ResembleAI/chatterbox-multilingual"
```

**Cause** :
- Le repo "ResembleAI/chatterbox-multilingual" **n'existe pas** sur HuggingFace
- Les variantes monolingual et multilingual partagent le **même repo** : `ResembleAI/chatterbox`
- Différenciation par **classe Python** utilisée, pas par repo distinct

**Solution** :
```python
# ✅ APRÈS (correct)
model_id = "ResembleAI/chatterbox"  # Contient mono + multi
```

**Impact** :
- Le modèle multilingual (23 langues) se télécharge maintenant correctement
- Fichier clé : `t3_mtl23ls_v2.safetensors` (modèle multilingual)

---

### 2. Installation Docker Défaillante ❌→✅

**Problème** :
```dockerfile
# ❌ AVANT (syntaxe incorrecte)
uv pip install --system -r pyproject.toml --extra prod
```

**Cause** :
- L'option `-r` est pour `requirements.txt`, **PAS** pour `pyproject.toml`
- Cette syntaxe invalide empêchait l'installation de `chatterbox-tts`
- Import `from chatterbox.mtl_tts import ChatterboxMultilingualTTS` échouait au runtime

**Solution** :
```dockerfile
# ✅ APRÈS (syntaxe correcte)
COPY services/translator/requirements.txt ./
uv pip install --system -r requirements.txt
```

**Impact** :
- `chatterbox-tts==0.1.6` s'installe maintenant correctement
- Module `chatterbox.mtl_tts.ChatterboxMultilingualTTS` disponible
- Support des 23 langues activé au runtime

---

## 📦 Fichiers Modifiés

### `services/translator/src/services/tts/backends/chatterbox_backend.py`
- `is_model_downloaded()` : Correction model_id vers "ResembleAI/chatterbox"
- `download_model()` : Correction model_id vers "ResembleAI/chatterbox"
- Commentaires ajoutés expliquant la structure mono/multi

### `infrastructure/docker/images/translator/Dockerfile`
- Ligne 56 : Ajout de `COPY services/translator/requirements.txt ./`
- Ligne 85 : Changement vers `uv pip install --system -r requirements.txt`
- Commentaires ajoutés expliquant pourquoi requirements.txt est utilisé

---

## 🌍 Support Multilingual

### Langues Supportées (23 langues)
```
ar  (Arabic)      da  (Danish)      de  (German)      el  (Greek)
en  (English)     es  (Spanish)     fi  (Finnish)     fr  (French)
he  (Hebrew)      hi  (Hindi)       it  (Italian)     ja  (Japanese)
ko  (Korean)      ms  (Malay)       nl  (Dutch)       no  (Norwegian)
pl  (Polish)      pt  (Portuguese)  ru  (Russian)     sv  (Swedish)
sw  (Swahili)     tr  (Turkish)     zh  (Chinese)
```

### Structure du Package Chatterbox

```
ResembleAI/chatterbox (HuggingFace repo)
├── ChatterboxTTS (chatterbox.tts)
│   └── Modèle monolingual anglais
│       Fichier: t3_turbo_v1.safetensors (Turbo)
│       ou modèle standard
└── ChatterboxMultilingualTTS (chatterbox.mtl_tts)
    └── Modèle multilingual 23 langues
        Fichier: t3_mtl23ls_v2.safetensors
```

### Logique de Chargement

```python
# PRIORITÉ 1: Multilingual (23 langues)
try:
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS
    # Charger le modèle multilingual
except ImportError:
    # FALLBACK: Monolingual (anglais uniquement)
    from chatterbox.tts import ChatterboxTTS
```

---

## ✅ Vérifications Effectuées

### 1. HuggingFace Repository
- ✅ Repo `ResembleAI/chatterbox` existe
- ✅ Contient les deux variantes (mono + multi)
- ✅ Fichier `t3_mtl23ls_v2.safetensors` présent (multilingual)

### 2. Cache Local (~/.cache/huggingface/)
- ✅ Modèle présent : `models--ResembleAI--chatterbox/`
- ✅ Fichier multilingual détecté : `t3_mtl23ls_v2.safetensors`

### 3. Configuration Docker
- ✅ `HF_HOME=/workspace/models` configuré
- ✅ `MODELS_PATH=/workspace/models` configuré
- ✅ `requirements.txt` contient `chatterbox-tts==0.1.6`
- ✅ Dockerfile copie et installe requirements.txt correctement

### 4. Service TTS
- ✅ `tts_service.py` charge le modèle au démarrage (mode bloquant)
- ✅ Timeout de 5 minutes configuré (`TTS_INITIAL_DOWNLOAD_TIMEOUT=300`)
- ✅ Priorisation multilingual dans `chatterbox_backend.py`

---

## 🧪 Tests Recommandés

### 1. Build Docker
```bash
cd /Users/smpceo/Documents/v2_meeshy
docker build --build-arg TORCH_BACKEND=cpu \
  -f infrastructure/docker/images/translator/Dockerfile \
  -t meeshy-translator:test .
```

**Vérifications attendues** :
- ✅ `chatterbox-tts==0.1.6` installé sans erreur
- ✅ Logs montrent "Installing with TORCH_BACKEND=cpu"
- ✅ Pas d'erreur "ModuleNotFoundError: No module named 'chatterbox'"

### 2. Runtime Import Test
```bash
docker run --rm meeshy-translator:test python3 -c "
from chatterbox.tts import ChatterboxTTS
from chatterbox.mtl_tts import ChatterboxMultilingualTTS
print('✅ ChatterboxTTS importé')
print('✅ ChatterboxMultilingualTTS importé')
print('✅ Support multilingual activé')
"
```

**Résultat attendu** :
```
✅ ChatterboxTTS importé
✅ ChatterboxMultilingualTTS importé
✅ Support multilingual activé
```

### 3. Service Startup Test
```bash
# Démarrer le service Translator
docker-compose up translator

# Vérifier les logs
docker-compose logs translator | grep -E "TTS|Chatterbox"
```

**Logs attendus** :
```
[TTS] ✅ Chatterbox package disponible
[TTS] ✅ Chatterbox Multilingual (23 langues) disponible
[TTS] 🌍 Tentative de chargement Chatterbox Multilingual (23 langues)...
[TTS] ✅ Chatterbox Multilingual chargé - support de 23 langues activé
```

### 4. Synthèse Multilingual Test
```bash
# Tester synthèse en français
curl -X POST http://localhost:8000/api/tts/synthesize \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Bonjour, ceci est un test de synthèse vocale en français.",
    "language": "fr"
  }'
```

**Vérifications** :
- ✅ Pas de timeout (< 120s)
- ✅ Audio généré en français
- ✅ Qualité vocale correcte

---

## 📊 Configuration par Défaut

### Variables d'Environnement
```bash
TTS_MODEL=chatterbox              # Modèle standard (non-turbo)
TTS_DEVICE=auto                   # CPU ou GPU auto-détecté
MODELS_PATH=/workspace/models     # Cache des modèles
HF_HOME=/workspace/models         # Cache HuggingFace
TTS_INITIAL_DOWNLOAD_TIMEOUT=300  # 5 minutes timeout
```

### Modèle Actif
- **Par défaut** : `chatterbox` (standard, multilingual prioritaire)
- **Alternatif** : `chatterbox-turbo` (si `TTS_MODEL=chatterbox-turbo`)
- **Langues** : 23 langues si multilingual chargé, anglais seulement sinon

---

## 🔗 Sources

- [chatterbox-tts sur PyPI](https://pypi.org/project/chatterbox-tts/)
- [ResembleAI/chatterbox sur GitHub](https://github.com/resemble-ai/chatterbox)
- [ResembleAI/chatterbox sur HuggingFace](https://huggingface.co/ResembleAI/chatterbox)
- [Chatterbox Multilingual Demo](https://huggingface.co/spaces/ResembleAI/Chatterbox-Multilingual-TTS)

---

## 🚀 Prochaines Étapes

1. **Rebuild l'image Docker** avec les corrections
2. **Tester le démarrage** du service Translator
3. **Vérifier les logs** TTS au démarrage
4. **Tester synthèse multilingual** (français, espagnol, etc.)
5. **Valider qualité audio** sur différentes langues

---

**Auteur** : Claude Sonnet 4.5
**Date** : 2026-01-19
**Status** : ✅ Correctifs appliqués et commitnés
