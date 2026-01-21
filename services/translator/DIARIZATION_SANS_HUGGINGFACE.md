# Diarisation Sans Token HuggingFace

Ce document explique comment utiliser pyannote.audio **sans dépendance à HuggingFace** au runtime.

## 🎯 Option 1 : Modèles Locaux (RECOMMANDÉ)

### Étape 1 : Télécharger les modèles une fois

```bash
# Créer un token HuggingFace temporaire (gratuit)
# 1. Compte sur https://huggingface.co/
# 2. Accepter conditions : https://huggingface.co/pyannote/speaker-diarization-3.1
# 3. Créer token (Settings > Access Tokens)

# Télécharger les modèles localement
cd services/translator
export HF_TOKEN=votre_token_temporaire

python << 'EOF'
import os
from pyannote.audio import Pipeline

# Télécharger le pipeline et ses modèles
pipeline = Pipeline.from_pretrained(
    "pyannote/speaker-diarization-3.1",
    use_auth_token=os.environ['HF_TOKEN']
)

# Les modèles sont maintenant dans ~/.cache/huggingface/
print("✅ Modèles téléchargés dans ~/.cache/huggingface/")
EOF
```

### Étape 2 : Configurer pour utilisation locale

Une fois téléchargés, les modèles sont **en cache local** et ne nécessitent **plus de token** !

```python
# Le code actuel fonctionne déjà avec le cache local
pipeline = Pipeline.from_pretrained(
    "pyannote/speaker-diarization-3.1",
    use_auth_token=None  # Pas de token nécessaire si modèles en cache !
)
```

### Étape 3 : Déploiement Docker

Pour Docker, incluez les modèles dans l'image :

```dockerfile
# Option 1 : Copier le cache local dans l'image
COPY /Users/smpceo/.cache/huggingface /app/models/huggingface

# Option 2 : Télécharger pendant le build avec ARG
ARG HF_TOKEN
RUN if [ -n "$HF_TOKEN" ]; then \
    python -c "from pyannote.audio import Pipeline; \
    Pipeline.from_pretrained('pyannote/speaker-diarization-3.1', use_auth_token='$HF_TOKEN')"; \
    fi
```

**Build avec token temporaire** :
```bash
docker build --build-arg HF_TOKEN=votre_token_temporaire -t meeshy-translator .
```

**Ensuite, runtime SANS token** :
```bash
docker run meeshy-translator  # Pas de token nécessaire !
```

---

## 🔄 Option 2 : Utiliser SpeechBrain (Alternative Pure Python)

SpeechBrain est déjà installé avec pyannote.audio et offre des modèles publics.

### Installation

```bash
pip install speechbrain  # Déjà installé avec pyannote.audio
```

### Code

```python
from speechbrain.pretrained import SpeakerRecognition
import torchaudio

# Modèle public, pas de token nécessaire
model = SpeakerRecognition.from_hparams(
    source="speechbrain/spkrec-ecapa-voxceleb",
    savedir="models/speechbrain"
)

# Extraire embeddings pour diarisation
waveform, sample_rate = torchaudio.load(audio_path)
embeddings = model.encode_batch(waveform)

# Appliquer clustering (HDBSCAN, KMeans, etc.)
from sklearn.cluster import HDBSCAN
clusterer = HDBSCAN(min_cluster_size=10)
labels = clusterer.fit_predict(embeddings)
```

**Avantages** :
- ✅ Aucun token HuggingFace requis
- ✅ Modèles publics
- ✅ Bonne qualité (ECAPA-TDNN)

**Inconvénients** :
- ❌ Plus complexe à configurer (pas de pipeline tout-en-un)
- ❌ Nécessite clustering manuel

---

## 🌐 Option 3 : Utiliser le Fallback Pitch Clustering (Déjà en Place)

Votre code a déjà un **fallback automatique** qui fonctionne **sans aucune dépendance externe** !

### Fonctionnement Actuel

```python
# diarization_service.py:131-138
async def detect_speakers(self, audio_path: str, max_speakers: int = 5):
    # Essayer pyannote d'abord
    pipeline = self._get_pyannote_pipeline()
    if pipeline:
        return await self._detect_with_pyannote(audio_path, pipeline)

    # Fallback: clustering par pitch (AUCUNE dépendance HF)
    logger.info("[DIARIZATION] Utilisation du fallback pitch clustering")
    return await self._detect_with_pitch_clustering(audio_path, max_speakers)
```

**Désactiver pyannote.audio** :
```bash
# Dans .env
HF_TOKEN=  # Laisser vide
# ou
ENABLE_PYANNOTE=false  # Si on ajoute ce flag
```

**Améliorer le pitch clustering** :

Le pitch clustering actuel peut être amélioré pour réduire les faux positifs :

```python
# Paramètres actuels (trop permissifs)
MIN_SPEAKING_RATIO = 0.15  # 15%
MIN_SEGMENTS = 3
silhouette_threshold = 0.3

# Paramètres améliorés
MIN_SPEAKING_RATIO = 0.05  # 5% (permet "Oui")
MIN_SEGMENTS = 2           # Au moins 2 segments
silhouette_threshold = 0.5  # Clustering plus strict
MIN_SEGMENT_DURATION_MS = 500  # Minimum 0.5s par segment
```

---

## 📊 Comparaison des Options

| Option | Précision | Setup | Token HF | Complexité |
|--------|-----------|-------|----------|------------|
| **Option 1 : Modèles locaux** | ⭐⭐⭐⭐⭐ (≥95%) | Une fois | Setup uniquement | Faible |
| **Option 2 : SpeechBrain** | ⭐⭐⭐⭐ (≥85%) | Moyenne | Jamais | Moyenne |
| **Option 3 : Pitch clustering** | ⭐⭐ (≥60%) | Aucun | Jamais | Faible |

---

## 🚀 Recommandation

**Pour production** : **Option 1 (Modèles locaux)**
- Télécharger les modèles une fois avec token temporaire
- Les inclure dans l'image Docker
- Zéro dépendance runtime à HuggingFace
- Meilleure précision

**Pour développement rapide** : **Option 3 (Pitch clustering amélioré)**
- Déjà en place
- Aucune dépendance externe
- Suffit pour beaucoup de cas d'usage

---

## 🔧 Implémentation Recommandée

### Étape 1 : Télécharger modèles localement

```bash
cd services/translator

# Setup temporaire avec token
export HF_TOKEN=hf_xxxxxxxxxxxxx

python << 'EOF'
import os
from pyannote.audio import Pipeline

pipeline = Pipeline.from_pretrained(
    "pyannote/speaker-diarization-3.1",
    use_auth_token=os.environ['HF_TOKEN']
)
print("✅ Modèles en cache: ~/.cache/huggingface/")
EOF
```

### Étape 2 : Modifier diarization_service.py

```python
def _get_pyannote_pipeline(self) -> Optional["Pipeline"]:
    """Récupère le pipeline pyannote (lazy loading)"""
    if not PYANNOTE_AVAILABLE:
        return None

    if self._pipeline is None:
        try:
            # Essayer de charger depuis le cache local (pas de token)
            self._pipeline = Pipeline.from_pretrained(
                "pyannote/speaker-diarization-3.1",
                use_auth_token=self.hf_token or None  # Token optionnel
            )
            logger.info("[DIARIZATION] Pipeline pyannote chargé depuis cache local")
        except Exception as e:
            logger.warning(f"[DIARIZATION] Échec chargement pyannote: {e}")
            logger.info("[DIARIZATION] Fallback sur pitch clustering")
            return None

    return self._pipeline
```

### Étape 3 : Dockerfile avec modèles pré-téléchargés

```dockerfile
# Copier le cache HuggingFace local dans l'image
COPY --chown=app:app .cache/huggingface /app/models/huggingface

# OU télécharger pendant le build (nécessite token au build)
ARG HF_TOKEN
RUN if [ -n "$HF_TOKEN" ]; then \
    python -c "from pyannote.audio import Pipeline; \
    Pipeline.from_pretrained('pyannote/speaker-diarization-3.1', \
    use_auth_token='$HF_TOKEN')"; \
    fi
```

---

## ✅ Résultat Final

Avec **Option 1** :
- ✅ Setup une fois avec token temporaire
- ✅ Modèles en cache local
- ✅ Runtime **SANS token HuggingFace**
- ✅ Précision maximale (≥95%)
- ✅ Aucune dépendance externe au runtime

**La diarisation fonctionne même offline !**
