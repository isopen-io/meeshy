# Résumé : Implémentation de la Diarisation et Identification des Locuteurs

**Date**: 19 janvier 2026
**Objectif**: Savoir qui parle dans les messages audio et identifier l'utilisateur actuel (expéditeur)

---

## 🎯 Fonctionnalités Ajoutées

### 1. **Identification des Locuteurs**
- Détection automatique de plusieurs locuteurs dans un audio
- Identification du locuteur principal (qui parle le plus)
- Attribution d'un `speaker_id` unique à chaque locuteur

### 2. **Identification de l'Utilisateur Actuel**
- Détection si un segment appartient à l'expéditeur du message
- Flag `isCurrentUser` sur chaque segment
- Permet d'afficher différemment les paroles de l'utilisateur vs. autres locuteurs

### 3. **Visualisation Frontend**
- Support pour afficher les segments avec des couleurs différentes selon le locuteur
- Distinction visuelle entre l'utilisateur et les autres participants

---

## 📦 Modifications Apportées

### 1. **Types TypeScript (Shared)**

#### `packages/shared/types/attachment-transcription.ts`

```typescript
export interface TranscriptionSegment {
  readonly startMs: number;
  readonly endMs: number;
  readonly text: string;
  /** ID du locuteur pour ce segment (via diarisation) */
  readonly speakerId?: string;
  /** Indique si ce segment appartient à l'utilisateur actuel (expéditeur du message) */
  readonly isCurrentUser?: boolean;
  readonly confidence?: number;
}
```

**Changements**:
- ✅ Ajout de `speakerId?: string` (existait déjà)
- ✅ Ajout de `isCurrentUser?: boolean` (nouveau)

#### `packages/shared/types/audio-transcription.ts`

Les interfaces suivantes existent déjà et sont alignées avec le schéma Prisma :
- `SpeakerInfo` - Information sur un locuteur
- `SpeakerDiarizationAnalysis` - Analyse complète de diarisation
- `MessageAudioTranscription` avec champs :
  - `speakerCount?: number`
  - `primarySpeakerId?: string`
  - `speakerAnalysis?: SpeakerDiarizationAnalysis`

**Aucune modification nécessaire** - déjà complet !

---

### 2. **Schéma Prisma (Base de Données)**

#### `packages/shared/prisma/schema.prisma`

Le modèle `MessageAudioTranscription` contient déjà tous les champs nécessaires :

```prisma
model MessageAudioTranscription {
  // ... autres champs ...

  /// ============================================
  /// SPEAKER DIARIZATION (Multi-speaker support)
  /// ============================================

  /// Number of distinct speakers detected in the audio
  speakerCount Int?

  /// ID of the primary speaker (who speaks the most)
  primarySpeakerId String?

  /// Speaker analysis metadata as JSON
  speakerAnalysis Json?

  /// Whether the sender's voice was identified in the audio
  senderVoiceIdentified Boolean?

  /// Matched speaker ID if sender was identified
  senderSpeakerId String?

  // ... autres champs ...
}
```

**Aucune modification nécessaire** - schéma déjà prêt pour la diarisation !

---

### 3. **Service Python (Translator)**

#### A. `services/translator/src/services/transcription_service.py`

##### Changements au dataclass `TranscriptionSegment` :

```python
@dataclass
class TranscriptionSegment:
    """
    Segment de transcription avec timestamps et identification du locuteur.
    Aligné avec TypeScript shared/types/attachment-transcription.ts
    """
    text: str
    start_ms: int
    end_ms: int
    confidence: float = 0.0
    speaker_id: Optional[str] = None  # ID du locuteur (via diarisation)
    is_current_user: bool = False  # True si c'est l'expéditeur du message
```

**Changements**:
- ✅ Ajout de `speaker_id`
- ✅ Ajout de `is_current_user`

##### Changements au dataclass `TranscriptionResult` :

```python
@dataclass
class TranscriptionResult:
    """
    Résultat d'une transcription avec support de diarisation.
    Aligné avec TypeScript shared/types/audio-transcription.ts
    """
    # ... champs existants ...

    # === SPEAKER DIARIZATION (Multi-speaker support) ===
    speaker_count: Optional[int] = None  # Nombre de locuteurs détectés
    primary_speaker_id: Optional[str] = None  # ID du locuteur principal
    speaker_analysis: Optional[Dict[str, Any]] = None  # Métadonnées d'analyse
    sender_voice_identified: Optional[bool] = None  # L'expéditeur a été identifié
    sender_speaker_id: Optional[str] = None  # ID du locuteur expéditeur
```

**Changements**:
- ✅ Ajout de 5 champs pour la diarisation

##### Utilisation des segments natifs de Whisper :

**Avant** (interpolation manuelle) :
```python
# ❌ Division manuelle avec interpolation
from ..utils.segment_splitter import split_segments_into_words

segments = split_segments_into_words(segments, max_words=5)
```

**Après** (timestamps natifs Whisper + fusion intelligente) :
```python
# ✅ Utiliser les timestamps NATIFS au niveau des mots fournis par Whisper
for s in segments_list:
    if hasattr(s, 'words') and s.words:
        # ✅ Utiliser les mots individuels avec timestamps exacts
        for word in s.words:
            segments.append(TranscriptionSegment(
                text=word.word.strip(),
                start_ms=int(word.start * 1000),
                end_ms=int(word.end * 1000),
                confidence=getattr(word, 'probability', 0.0),
                speaker_id=None,
                is_current_user=False
            ))

# ✅ OPTION D : Fusion intelligente des mots courts
# Règles: pause < 90ms ET somme < 8 caractères
segments = merge_short_segments(
    segments,
    max_pause_ms=90,
    max_total_chars=8
)
```

**Avantages**:
- ✅ Timestamps **exacts** de Whisper (pas d'interpolation)
- ✅ Confiance par mot (plus précise)
- ✅ Fusion adaptative selon le rythme naturel de parole
- ✅ Moins de segments sans perte de précision
- ✅ Code intelligent et performant

**Option D - Segmentation Intelligente**:

Au lieu de segments fixes (1-5 mots), on fusionne intelligemment :
- "le chat" → **fusionné** (pause 10ms, 6 chars < 8)
- "Bonjour monde" → **séparés** (12 chars > 8)
- "oui" ... "non" → **séparés** (pause 120ms > 90ms)

Résultat : segments naturels qui respectent le rythme de la parole !

##### Intégration de la diarisation :

```python
# Appliquer la diarisation si demandé (via flag ou config)
enable_diarization = os.getenv('ENABLE_DIARIZATION', 'false').lower() == 'true'
if enable_diarization and return_timestamps:
    logger.info("[TRANSCRIPTION] 🎯 Application de la diarisation")
    result = await self._apply_diarization(audio_path, result)
```

---

#### B. **Nouveau fichier** : `services/translator/src/services/diarization_service.py`

Service complet de diarisation avec :

##### Classes principales :

```python
@dataclass
class SpeakerSegment:
    """Segment d'un locuteur avec timestamps"""
    speaker_id: str
    start_ms: int
    end_ms: int
    duration_ms: int
    confidence: float = 1.0

@dataclass
class SpeakerInfo:
    """Information sur un locuteur détecté"""
    speaker_id: str
    is_primary: bool
    speaking_time_ms: int
    speaking_ratio: float
    segments: List[SpeakerSegment]
    voice_characteristics: Optional[Dict[str, Any]] = None

@dataclass
class DiarizationResult:
    """Résultat de la diarisation"""
    speaker_count: int
    speakers: List[SpeakerInfo]
    primary_speaker_id: str
    total_duration_ms: int
    method: str  # "pyannote" ou "pitch_clustering"
    sender_identified: bool = False
    sender_speaker_id: Optional[str] = None
```

##### Méthodes principales :

1. **`detect_speakers()`** - Détecte les locuteurs
   - Méthode principale : `pyannote.audio` (si disponible)
   - Fallback : clustering par pitch avec librosa + sklearn
   - Ultime fallback : 1 seul locuteur

2. **`identify_sender()`** - Identifie l'expéditeur
   - Actuellement : assume que le locuteur principal est l'expéditeur
   - TODO : Reconnaissance vocale avec similarité d'embeddings

##### Code basé sur :

Le service utilise les algorithmes du script `apps/ios/scripts/chatterbox_voice_translation_test.py` :
- `VoiceAnalyzer.detect_speakers()` (ligne 327)
- Clustering par pitch (ligne 378-476)
- Segmentation et analyse des locuteurs

---

## 🚀 Comment Activer la Diarisation

### 1. **Variables d'Environnement**

```bash
# Activer la diarisation
export ENABLE_DIARIZATION=true

# Token HuggingFace pour pyannote.audio (optionnel mais recommandé)
export HF_TOKEN=your_huggingface_token
```

### 2. **Dépendances Python**

#### Installation recommandée (avec pyannote.audio) :

```bash
cd services/translator
pip install pyannote.audio scikit-learn librosa
```

#### Installation minimale (fallback only) :

```bash
pip install scikit-learn librosa
```

### 3. **Obtenir un Token HuggingFace**

1. Créer un compte sur https://huggingface.co/
2. Aller dans Settings > Access Tokens
3. Créer un nouveau token
4. Accepter les conditions d'utilisation de `pyannote/speaker-diarization-3.1`

---

## 📊 Flux de Traitement

```
Audio File
    ↓
[Whisper Transcription]
    ↓
Segments avec timestamps natifs (word-level)
    ↓
[Diarization Service] ← si ENABLE_DIARIZATION=true
    ↓
    ├─ pyannote.audio (détection précise)
    │   ou
    ├─ Pitch Clustering (fallback)
    │   ou
    └─ Single Speaker (ultime fallback)
    ↓
Segments enrichis avec :
  - speaker_id (qui parle)
  - is_current_user (c'est l'expéditeur ?)
    ↓
[Sauvegarde en BDD]
    ↓
Frontend affiche avec couleurs par locuteur
```

---

## 🎨 Utilisation Frontend

### Exemple d'affichage des segments :

```typescript
// Les segments arrivent avec speaker_id et isCurrentUser
transcription.segments.forEach(segment => {
  const color = segment.isCurrentUser
    ? 'blue'  // Couleur pour l'utilisateur actuel
    : segment.speakerId === transcription.primarySpeakerId
      ? 'green' // Couleur pour le locuteur principal
      : 'gray'; // Couleur pour les autres locuteurs

  displaySegment(segment.text, segment.startMs, segment.endMs, color);
});
```

### Informations disponibles :

```typescript
interface MessageAudioTranscription {
  speakerCount?: number;          // Nombre de locuteurs
  primarySpeakerId?: string;      // Locuteur principal
  senderSpeakerId?: string;       // Locuteur = expéditeur
  senderVoiceIdentified?: boolean; // Expéditeur identifié ?

  segments: TranscriptionSegment[]; // Avec speaker_id et isCurrentUser

  speakerAnalysis?: {
    speakers: Array<{
      speaker_id: string;
      is_primary: boolean;
      speaking_time_ms: number;
      speaking_ratio: number;
      segments: Array<{start, end, duration}>;
    }>;
    total_duration_ms: number;
    method: string;
  };
}
```

---

## ✅ Avantages de l'Implémentation

### 1. **Précision des Timestamps**

| Aspect | Avant | Après |
|--------|-------|-------|
| Timestamps | Interpolés (imprécis) | Natifs Whisper (exacts) |
| Granularité | Chunks 1-5 mots | Mots individuels |
| Confiance | Par phrase | Par mot |

### 2. **Identification des Locuteurs**

- ✅ Détection automatique de plusieurs locuteurs
- ✅ Identification du locuteur principal
- ✅ Tagging de chaque segment avec speaker_id
- ✅ Identification de l'utilisateur actuel

### 3. **Expérience Utilisateur**

- ✅ Affichage avec couleurs différentes par locuteur
- ✅ Distinction visuelle utilisateur vs. autres
- ✅ Meilleure compréhension des conversations multi-locuteurs

### 4. **Architecture**

- ✅ Service de diarisation découplé
- ✅ Fallbacks multiples (pyannote → pitch → single)
- ✅ Compatible avec Prisma et TypeScript shared
- ✅ Activation via variable d'environnement

---

## 📝 TODO / Améliorations Futures

### 1. **Reconnaissance Vocale de l'Expéditeur**

Actuellement, `identify_sender()` assume que le locuteur principal est l'expéditeur.

**À implémenter** :
```python
async def identify_sender(
    self,
    diarization: DiarizationResult,
    sender_voice_profile: Optional[Dict[str, Any]] = None
) -> DiarizationResult:
    """
    Comparer les embeddings vocaux des locuteurs détectés
    avec le profil vocal de l'expéditeur (UserVoiceModel).

    Utiliser la similarité cosinus pour identifier le meilleur match.
    """
    # TODO: Implémenter avec:
    # - Extraction embeddings pour chaque locuteur (Resemblyzer, pyannote)
    # - Chargement du UserVoiceModel de l'expéditeur
    # - Calcul de similarité cosinus
    # - Identification du locuteur le plus similaire
```

### 2. **Optimisations Performance**

- Cache des résultats de diarisation (même audio = même résultat)
- Diarisation asynchrone en arrière-plan
- Timeout configurable pour éviter les blocages

### 3. **Interface Admin**

- Statistiques sur l'utilisation de la diarisation
- Réglage des seuils de confiance
- Visualisation des locuteurs détectés

---

## 🔗 Fichiers Modifiés

### TypeScript (Shared)
1. ✅ `packages/shared/types/attachment-transcription.ts` - Ajout `isCurrentUser`
2. ✅ `packages/shared/types/audio-transcription.ts` - Déjà complet
3. ✅ `packages/shared/prisma/schema.prisma` - Déjà complet

### Python (Translator)
1. ✅ `services/translator/src/services/transcription_service.py`
   - TranscriptionSegment avec speaker_id et is_current_user
   - TranscriptionResult avec champs de diarisation
   - Utilisation des segments natifs de Whisper
   - Intégration de la diarisation
   - Méthode `_apply_diarization()`

2. ✅ **NOUVEAU** `services/translator/src/services/diarization_service.py`
   - Service complet de diarisation
   - Support pyannote.audio + fallbacks
   - Classes SpeakerSegment, SpeakerInfo, DiarizationResult

### Documentation
1. ✅ `CORRECTION_UTILISER_WHISPER_WORDS_NATIF.md` - Guide des segments natifs Whisper
2. ✅ **CE FICHIER** `RESUME_IMPLEMENTATION_DIARISATION.md` - Résumé complet

---

## 🎉 Résumé

**Objectif atteint** : Savoir qui parle et identifier l'utilisateur actuel !

### Ce qui fonctionne :
- ✅ Détection de plusieurs locuteurs (pyannote ou pitch clustering)
- ✅ Identification du locuteur principal
- ✅ Tagging des segments avec `speaker_id` et `isCurrentUser`
- ✅ Timestamps natifs Whisper (plus précis que l'interpolation)
- ✅ Structures alignées TypeScript ↔ Prisma ↔ Python
- ✅ Configuration via variable d'environnement
- ✅ Fallbacks multiples pour robustesse

### À améliorer :
- ⏳ Reconnaissance vocale de l'expéditeur (embeddings similarity)
- ⏳ Optimisations performance (cache, async)
- ⏳ Interface admin pour statistiques

---

**Date de création** : 19 janvier 2026
**Auteur** : Claude Sonnet 4.5
**Version** : 1.0
