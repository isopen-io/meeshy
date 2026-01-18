# Audit de la Structure du Dossier Models

**Date** : 2026-01-18
**Service** : translator
**Dossier analysé** : `/services/translator/models`

## 🔍 Problèmes Identifiés

### 1. **Incohérence des Variables d'Environnement**

#### Code actuel (INCORRECT) :
```python
# src/services/translation_ml_service.py:41-43
os.environ['HF_HOME'] = str(_settings.models_path)               # = ./models
os.environ['TRANSFORMERS_CACHE'] = str(_settings.models_path)    # = ./models
os.environ['HUGGINGFACE_HUB_CACHE'] = str(_settings.models_path) # = ./models
```

#### Configuration attendue (.env.example) :
```bash
HF_HOME=./models/huggingface
TRANSFORMERS_CACHE=./models/huggingface
HUGGINGFACE_HUB_CACHE=./models/huggingface
```

#### Propriété disponible mais non utilisée :
```python
# src/config/settings.py:172-174
@property
def huggingface_cache_path(self) -> str:
    return os.path.join(self.models_path, "huggingface")
```

**Impact** : Les modèles HuggingFace sont téléchargés directement à la racine de `models/` au lieu de `models/huggingface/`, créant une duplication et un désordre.

---

### 2. **Modèles NLLB Dupliqués**

Les modèles NLLB sont présents à deux endroits :

```
models/
├── models--facebook--nllb-200-distilled-600M/    ❌ RACINE (mauvais emplacement)
├── models--facebook--nllb-200-distilled-1.3B/    ❌ RACINE (mauvais emplacement)
└── huggingface/
    └── facebook/                                  ✅ BON EMPLACEMENT
```

**Impact** : Gaspillage d'espace disque (~2-3 GB dupliqués).

---

### 3. **Anciens Modèles Non Utilisés**

Ces modèles ne sont plus référencés dans le code :

```
models/
├── Helsinki-NLP_opus-mt-en-fr/    ❌ Ancien modèle Opus-MT (non utilisé)
├── Helsinki-NLP_opus-mt-fr-en/    ❌ Ancien modèle Opus-MT (non utilisé)
```

Le code utilise maintenant exclusivement **NLLB-200** :
```python
# src/config/settings.py:116-117
self.basic_model = os.getenv("BASIC_MODEL", "facebook/nllb-200-distilled-600M")
self.premium_model = os.getenv("PREMIUM_MODEL", "facebook/nllb-200-distilled-1.3B")
```

**Impact** : ~500 MB d'espace disque gaspillé.

---

### 4. **Dossiers Non Référencés**

Ces dossiers existent mais ne sont pas mentionnés dans `settings.py` :

```
models/
├── embeddings/     ❓ Non référencé
├── mms/            ❓ Non référencé (peut-être MMS-TTS ?)
├── vits/           ❓ Non référencé (peut-être VITS-TTS ?)
├── xet/            ❓ Non référencé
```

**Dossiers attendus selon `settings.py`** :
```python
# src/config/settings.py:38-44
#   models/
#   ├── huggingface/          # Chatterbox, Higgs, NLLB (auto-download)
#   ├── openvoice/            # OpenVoice V2 checkpoints
#   ├── xtts/                 # XTTS v2 (legacy)
#   ├── whisper/              # Whisper STT
#   └── voice_cache/          # Clones vocaux utilisateurs
```

**Impact** : Confusion sur l'utilité de ces dossiers, possibles doublons.

---

## ✅ Structure Recommandée

### Architecture cible :
```
models/
├── huggingface/              # Cache HuggingFace (NLLB, Chatterbox, Higgs)
│   ├── models--facebook--nllb-200-distilled-600M/
│   ├── models--facebook--nllb-200-distilled-1.3B/
│   ├── models--ResembleAI--chatterbox-turbo/
│   ├── models--bosonai--higgs-audio-v2-generation-3B-base/
│   └── .locks/
├── openvoice/                # OpenVoice V2 checkpoints
├── xtts/                     # XTTS v2 (legacy)
├── whisper/                  # Whisper STT models
└── voice_cache/              # Clones vocaux utilisateurs
```

### Variables d'environnement HuggingFace :
```bash
HF_HOME=./models/huggingface
TRANSFORMERS_CACHE=./models/huggingface
HUGGINGFACE_HUB_CACHE=./models/huggingface
```

---

## 🔧 Actions Recommandées

### 1. **Corriger les Variables d'Environnement** (CRITIQUE)

```python
# src/services/translation_ml_service.py
# AVANT (ligne 41-43)
os.environ['HF_HOME'] = str(_settings.models_path)
os.environ['TRANSFORMERS_CACHE'] = str(_settings.models_path)
os.environ['HUGGINGFACE_HUB_CACHE'] = str(_settings.models_path)

# APRÈS
os.environ['HF_HOME'] = str(_settings.huggingface_cache_path)
os.environ['TRANSFORMERS_CACHE'] = str(_settings.huggingface_cache_path)
os.environ['HUGGINGFACE_HUB_CACHE'] = str(_settings.huggingface_cache_path)
```

### 2. **Nettoyer les Modèles Dupliqués**

```bash
# Supprimer les modèles NLLB de la racine (déjà dans huggingface/)
rm -rf models/models--facebook--nllb-200-distilled-600M
rm -rf models/models--facebook--nllb-200-distilled-1.3B
```

### 3. **Supprimer les Anciens Modèles**

```bash
# Supprimer les anciens modèles Opus-MT non utilisés
rm -rf models/Helsinki-NLP_opus-mt-en-fr
rm -rf models/Helsinki-NLP_opus-mt-fr-en
```

### 4. **Clarifier les Dossiers Non Référencés**

```bash
# À vérifier/supprimer si non utilisés
models/embeddings/
models/mms/
models/vits/
models/xet/
```

**Questions à poser** :
- `embeddings/` : Est-ce utilisé pour des embeddings de traduction ?
- `mms/` : MMS-TTS (Meta) ? Si oui, documenter dans settings.py
- `vits/` : VITS-TTS ? Si oui, documenter dans settings.py
- `xet/` : Inconnu, probablement à supprimer

### 5. **Créer un fichier .env**

```bash
cd /Users/smpceo/Documents/v2_meeshy/services/translator
cp .env.example .env
```

Puis éditer `.env` pour définir :
```bash
MODELS_PATH=./models
HF_HOME=./models/huggingface
TRANSFORMERS_CACHE=./models/huggingface
HUGGINGFACE_HUB_CACHE=./models/huggingface
```

---

## 📊 Espace Disque Estimé

### Avant nettoyage :
- Modèles NLLB dupliqués : ~2-3 GB
- Anciens Opus-MT : ~500 MB
- Dossiers non référencés : ~200 MB (estimation)
- **Total récupérable : ~3 GB**

### Après nettoyage :
```
models/
├── huggingface/     ~4 GB (NLLB + Chatterbox + Higgs)
├── openvoice/       ~200 MB
├── xtts/            ~1 GB (si utilisé)
├── whisper/         ~500 MB
└── voice_cache/     Variable (clones utilisateurs)
```

---

## 🔒 Validation

Après corrections, vérifier :

```bash
# 1. Lancer le service
python src/main.py

# 2. Vérifier les logs de chargement
# Doit afficher :
# [SETTINGS] ✅ Chemin relatif calculé: '/path/to/translator/models'
# [TRANSLATOR] 🔍 HF_HOME depuis .env.local: ./models/huggingface

# 3. Tester une traduction
# Les modèles doivent se charger depuis huggingface/

# 4. Vérifier qu'aucun nouveau dossier n'est créé à la racine de models/
ls -la models/
```

---

## 📝 Conclusion

La structure actuelle souffre d'une **incohérence entre le code et la configuration** :
- Le code force HF_HOME à pointer vers `models/` (racine)
- La documentation et les propriétés indiquent `models/huggingface/`

Cette incohérence crée des duplications et du désordre. La correction est **simple mais critique** pour maintenir un système propre et optimisé.
