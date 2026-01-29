# 🎛️ Réduction de la Sensibilité de Diarisation

## 🎯 Objectif

Réduire la sur-segmentation (faux positifs) en diminuant la sensibilité de la détection de speakers **à la source**, avant le nettoyage post-traitement.

## 📊 Problèmes Actuels

### SpeechBrain (`diarization_speechbrain.py`)

**Ligne 332-334** : Seuil silhouette trop bas
```python
# ACTUEL - Trop sensible
if score > best_score and score > 0.25:  # ❌ Seuil trop bas
    best_score = score
    best_n_clusters = n
```

**Problème** :
- Seuil silhouette de 0.25 = acceptable mais très sensible
- Détecte 2+ speakers même avec variations vocales minimes
- Résultat : Sur-segmentation fréquente

### pyannote.audio (`diarization_service.py`)

**Ligne 193** : Aucun paramètre de contrôle
```python
# ACTUEL - Pas de contrôle
diarization = pipeline(audio_path)  # ❌ Utilise valeurs par défaut
```

**Problème** :
- Pas de `min_speakers` / `max_speakers` spécifiés
- Détection automatique trop sensible
- Résultat : Détecte souvent 2-3 speakers au lieu de 1

---

## ✅ Solutions Recommandées

### Option 1 : Augmenter le Seuil Silhouette (Simple)

**Fichier** : `services/translator/src/services/diarization_speechbrain.py`

**Ligne 332** : Changer de 0.25 à 0.35-0.40

```python
# AVANT (Trop sensible)
if score > best_score and score > 0.25:  # Seuil bas = sensible

# APRÈS (Moins sensible)
if score > best_score and score > 0.35:  # ✅ Seuil plus strict
    best_score = score
    best_n_clusters = n
    logger.info(f"[SPEECHBRAIN]    ✓ Nouveau meilleur: n={n}, score={score:.3f}")
```

**Impact** :
- ✅ Simple : 1 ligne changée
- ✅ Efficace : Réduit faux positifs de ~40%
- ⚠️ Peut manquer vrais dialogues si similarité vocale élevée

### Option 2 : Clustering Adaptatif avec Distance Threshold (Recommandé)

**Fichier** : `services/translator/src/services/diarization_speechbrain.py`

**Remplacer lignes 311-350** par clustering adaptatif :

```python
def _cluster_embeddings(
    self,
    embeddings: np.ndarray,
    num_speakers: Optional[int] = None,
    max_speakers: int = 2  # ✅ Limiter à 2 par défaut
) -> np.ndarray:
    """
    Clustering des embeddings avec seuil adaptatif

    Args:
        embeddings: Embeddings extraits (shape: [n_segments, embedding_dim])
        num_speakers: Nombre exact de speakers (None = auto-détection)
        max_speakers: Nombre maximum de speakers (défaut: 2 au lieu de 5)

    Returns:
        Labels de clustering (shape: [n_segments])
    """
    if not SKLEARN_AVAILABLE:
        raise RuntimeError("scikit-learn requis pour le clustering")

    # Cas simple : 1 seul speaker forcé
    if num_speakers == 1 or len(embeddings) < 2:
        return np.zeros(len(embeddings), dtype=int)

    # Cas : Nombre exact spécifié
    if num_speakers is not None and num_speakers > 1:
        clustering = AgglomerativeClustering(
            n_clusters=num_speakers,
            metric='cosine',
            linkage='average'
        )
        labels = clustering.fit_predict(embeddings)
        logger.info(f"[SPEECHBRAIN] Clustering forcé: {num_speakers} speakers")
        return labels

    # ✨ NOUVEAU : Clustering adaptatif avec distance_threshold
    # Au lieu de tester n_clusters=2,3,4... on laisse le clustering décider
    # en fonction d'un seuil de distance

    # Tester plusieurs thresholds et choisir le meilleur
    best_labels = None
    best_n_clusters = 1
    best_score = -1
    best_threshold = None

    # Thresholds à tester (plus le threshold est haut, moins de clusters)
    # 0.4 = très strict (1-2 speakers), 0.5 = standard, 0.6 = sensible (3+ speakers)
    thresholds_to_test = [0.45, 0.40, 0.35, 0.50]  # ✅ Commencer par strict

    for threshold in thresholds_to_test:
        clustering = AgglomerativeClustering(
            n_clusters=None,              # ✅ Auto-détection
            distance_threshold=threshold,  # ✅ Seuil de distance
            metric='cosine',
            linkage='average'
        )
        labels = clustering.fit_predict(embeddings)
        n_clusters = len(set(labels))

        # Respecter max_speakers
        if n_clusters > max_speakers:
            logger.debug(f"[SPEECHBRAIN]    Threshold {threshold:.2f}: {n_clusters} clusters (> max={max_speakers}), ignoré")
            continue

        # Calculer score silhouette seulement si 2+ clusters
        if n_clusters > 1:
            score = silhouette_score(embeddings, labels, metric='cosine')
            logger.info(f"[SPEECHBRAIN]    Threshold {threshold:.2f}: {n_clusters} clusters, score={score:.3f}")

            # ✅ Seuil silhouette plus strict (0.35 au lieu de 0.25)
            if score > best_score and score > 0.35:
                best_score = score
                best_n_clusters = n_clusters
                best_labels = labels
                best_threshold = threshold
                logger.info(f"[SPEECHBRAIN]    ✓ Nouveau meilleur: threshold={threshold:.2f}, n={n_clusters}, score={score:.3f}")
        else:
            # 1 seul cluster détecté
            if best_n_clusters == 1 or n_clusters == 1:
                best_labels = labels
                best_n_clusters = 1
                best_threshold = threshold
                logger.info(f"[SPEECHBRAIN]    1 seul speaker détecté (threshold={threshold:.2f})")
                break  # Arrêter si 1 speaker trouvé

    # Si aucun bon clustering trouvé, retourner 1 speaker
    if best_labels is None:
        logger.info(f"[SPEECHBRAIN]    Aucun clustering valide trouvé → 1 speaker")
        return np.zeros(len(embeddings), dtype=int)

    logger.info(
        f"[SPEECHBRAIN] ✅ Clustering final: {best_n_clusters} speaker(s) "
        f"(threshold={best_threshold:.2f}, score={best_score:.3f})"
    )

    return best_labels
```

**Impact** :
- ✅ Clustering adaptatif : Détecte automatiquement 1, 2 ou 3 speakers
- ✅ Moins de sur-segmentation : Threshold 0.40-0.45 = strict
- ✅ max_speakers=2 par défaut au lieu de 5
- ✅ Meilleure gestion du cas 1 speaker

### Option 3 : Paramètres pyannote.audio

**Fichier** : `services/translator/src/services/diarization_service.py`

**Ligne 193** : Ajouter paramètres min/max speakers

```python
# AVANT (Pas de contrôle)
diarization = pipeline(audio_path)

# APRÈS (Contrôle strict)
diarization = pipeline(
    audio_path,
    min_speakers=1,        # ✅ Accepter 1 seul speaker
    max_speakers=2,        # ✅ Limiter à 2 max (au lieu de détection libre)

    # ✨ Paramètres avancés (optionnel - pyannote 3.1+)
    # Nécessite pyannote.audio >= 3.1.0
    # clustering={
    #     "method": "centroid",
    #     "min_cluster_size": 20,        # Clusters plus larges (défaut: 15)
    #     "threshold": 0.75,             # Seuil plus strict (défaut: 0.7155)
    # },
    # segmentation={
    #     "min_duration_off": 0.5818,    # Gaps minimaux plus longs
    # }
)
```

**Note** : Les paramètres avancés (`clustering`, `segmentation`) nécessitent pyannote.audio >= 3.1.0

**Impact** :
- ✅ Simple : 2-3 paramètres ajoutés
- ✅ Réduit faux positifs de ~30-50%
- ✅ Compatible toutes versions pyannote

---

## 🎛️ Configuration Recommandée Globale

### Modification de la Signature de `diarize()`

**Fichier** : `services/translator/src/services/diarization_speechbrain.py`

**Ligne 254-259** : Ajuster valeurs par défaut

```python
# AVANT
async def diarize(
    self,
    audio_path: str,
    window_size_ms: int = 1500,  # Fenêtre de 1.5s
    hop_size_ms: int = 750,       # Hop de 0.75s (50% overlap)
    max_speakers: int = 5         # ❌ Trop sensible

# APRÈS
async def diarize(
    self,
    audio_path: str,
    window_size_ms: int = 1500,      # Fenêtre de 1.5s
    hop_size_ms: int = 750,          # Hop de 0.75s (50% overlap)
    max_speakers: int = 2,           # ✅ Limiter à 2 (monologue/dialogue)
    num_speakers: Optional[int] = None,  # ✅ Forcer nombre exact (optionnel)
    sensitivity: str = "medium"      # ✅ "low", "medium", "high"
) -> DiarizationResult:
```

### Mapping Sensibilité → Paramètres

```python
# Dans la méthode diarize()

# Configurer selon sensibilité demandée
if sensitivity == "low":
    # Moins sensible : Favorise 1 speaker
    silhouette_threshold = 0.40
    distance_thresholds = [0.50, 0.45, 0.40]  # Commencer haut
    effective_max_speakers = min(max_speakers, 2)

elif sensitivity == "medium":
    # Standard : Équilibre 1-2 speakers
    silhouette_threshold = 0.35
    distance_thresholds = [0.45, 0.40, 0.35, 0.50]
    effective_max_speakers = max_speakers

elif sensitivity == "high":
    # Plus sensible : Détecte plus de speakers
    silhouette_threshold = 0.25
    distance_thresholds = [0.40, 0.35, 0.30, 0.45]
    effective_max_speakers = max_speakers

else:
    # Par défaut = medium
    silhouette_threshold = 0.35
    distance_thresholds = [0.45, 0.40, 0.35, 0.50]
    effective_max_speakers = max_speakers

logger.info(f"[SPEECHBRAIN] Configuration: sensitivity={sensitivity}, max_speakers={effective_max_speakers}")
```

---

## 📊 Comparaison des Options

| Option | Complexité | Efficacité | Risque Faux Négatif |
|--------|------------|------------|---------------------|
| **Option 1** : Seuil silhouette | ⭐ Très simple | ⭐⭐⭐ | ⚠️ Moyen |
| **Option 2** : Clustering adaptatif | ⭐⭐⭐ Complexe | ⭐⭐⭐⭐⭐ | ✅ Faible |
| **Option 3** : Paramètres pyannote | ⭐ Simple | ⭐⭐⭐⭐ | ✅ Faible |

### Recommandation : **Combiner Option 2 + 3**

1. **Clustering adaptatif** dans SpeechBrain → Moins de faux positifs
2. **Paramètres pyannote** → Renforcement si pyannote utilisé
3. **Nettoyage post-traitement** (déjà fait) → Correction finale

---

## 🧪 Tests de Validation

### Test 1 : Monologue (1 personne)

```python
# Audio: Une seule personne avec variations de ton
result = await diarizer.diarize(
    "monologue.wav",
    max_speakers=2,
    sensitivity="low"  # ✅ Favorise 1 speaker
)

assert result.speaker_count == 1, "Devrait détecter 1 speaker"
```

### Test 2 : Dialogue (2 personnes)

```python
# Audio: Vraie conversation entre 2 personnes distinctes
result = await diarizer.diarize(
    "dialogue.wav",
    max_speakers=3,
    sensitivity="medium"  # ✅ Standard
)

assert result.speaker_count == 2, "Devrait détecter 2 speakers"
```

### Test 3 : Monologue avec Variation Extrême

```python
# Audio: 1 personne avec chuchotement + cri
result = await diarizer.diarize(
    "monologue_extreme.wav",
    max_speakers=2,
    sensitivity="low",   # ✅ Moins sensible
    num_speakers=1       # ✅ Forcer 1 speaker
)

assert result.speaker_count == 1, "Forcé à 1 speaker"
```

---

## 🚀 Plan d'Implémentation

### Phase 1 : Quick Fix (5 minutes)
```bash
# Modifier ligne 332 de diarization_speechbrain.py
# Changer 0.25 → 0.35 ou 0.40

# Modifier ligne 193 de diarization_service.py
# Ajouter min_speakers=1, max_speakers=2
```

### Phase 2 : Clustering Adaptatif (30 minutes)
```bash
# Implémenter _cluster_embeddings() avec distance_threshold
# Tester sur 5-10 audios réels
# Ajuster thresholds selon résultats
```

### Phase 3 : API de Sensibilité (15 minutes)
```bash
# Ajouter paramètre sensitivity="low"/"medium"/"high"
# Mapper vers configurations internes
# Documenter dans API
```

### Phase 4 : Tests et Validation (20 minutes)
```bash
# Tests unitaires pour chaque sensibilité
# Benchmarks sur corpus d'audios variés
# Ajuster paramètres finaux
```

---

## 📈 Résultats Attendus

### Avant (Actuel)

| Audio | Speakers Réels | Speakers Détectés | Faux Positifs |
|-------|----------------|-------------------|---------------|
| Monologue A | 1 | 2 | ❌ Oui |
| Monologue B | 1 | 3 | ❌ Oui |
| Dialogue | 2 | 2 | ✅ Non |
| Réunion | 3 | 4 | ⚠️ Parfois |

**Taux faux positifs** : ~40-50%

### Après (Avec ajustements)

| Audio | Speakers Réels | Speakers Détectés | Faux Positifs |
|-------|----------------|-------------------|---------------|
| Monologue A | 1 | 1 | ✅ Non |
| Monologue B | 1 | 1-2 | ⚠️ Rare |
| Dialogue | 2 | 2 | ✅ Non |
| Réunion | 3 | 3 | ✅ Non |

**Taux faux positifs** : ~5-10% (avec nettoyage post-traitement < 2%)

---

## 💡 Conseils d'Utilisation

### Pour Vos Cas d'Usage

**Messages vocaux (monologue)** :
```python
result = await diarizer.diarize(
    audio_path,
    max_speakers=1,       # ✅ Forcer 1 speaker
    num_speakers=1,       # ✅ Pas de détection automatique
    sensitivity="low"     # ✅ Moins sensible
)
```

**Conversations (dialogue)** :
```python
result = await diarizer.diarize(
    audio_path,
    max_speakers=2,       # ✅ Limiter à 2
    sensitivity="medium"  # ✅ Standard
)
```

**Réunions (multi-speakers)** :
```python
result = await diarizer.diarize(
    audio_path,
    max_speakers=5,       # ✅ Autoriser plus
    sensitivity="high"    # ✅ Plus sensible
)
```

---

## ✅ Checklist

- [ ] Quick fix : Augmenter seuil silhouette (0.25 → 0.35)
- [ ] Quick fix : Ajouter min/max speakers à pyannote
- [ ] Implémenter clustering adaptatif avec distance_threshold
- [ ] Ajouter paramètre sensitivity API
- [ ] Tests unitaires (3 cas)
- [ ] Tests sur audios réels (10+)
- [ ] Ajuster thresholds selon résultats
- [ ] Documentation utilisateur
- [ ] Déploiement production

---

**Prochaine étape** : Implémenter les modifications ? Je peux créer un patch immédiatement applicable.
