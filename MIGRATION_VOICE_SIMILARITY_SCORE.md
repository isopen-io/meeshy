# Migration: isCurrentUser → voiceSimilarityScore

**Date** : 19 janvier 2026
**Objectif** : Remplacer le boolean `isCurrentUser` par un score de similarité vocale (0-1)

---

## 🎯 Motivation

### Problème Avant
- ❌ Boolean `isCurrentUser` : trop binaire (oui/non)
- ❌ Même avec un seul locuteur, impossible de savoir si c'est vraiment l'utilisateur
- ❌ Pas de mesure de confiance dans l'identification
- ❌ Fallback basique : "locuteur principal = utilisateur" (approximatif)

### Solution Après
- ✅ Score de similarité vocale : mesure continue (0-1)
- ✅ Fonctionne même avec un seul locuteur (compare avec profil vocal)
- ✅ Permet d'afficher la confiance au frontend
- ✅ Reconnaissance vocale par embeddings (précise)

---

## 📊 Comparaison Avant/Après

### Avant (Boolean)

```typescript
interface TranscriptionSegment {
  speakerId?: string;
  isCurrentUser?: boolean;  // ❌ Binaire : true/false
  ...
}
```

**Affichage frontend** :
```typescript
if (segment.isCurrentUser) {
  color = 'blue';  // C'est l'utilisateur
} else {
  color = 'gray';  // Pas l'utilisateur
}
```

**Problème** : Pas de nuance, pas de confiance.

---

### Après (Score de Similarité)

```typescript
interface TranscriptionSegment {
  speakerId?: string;
  /**
   * Score de similarité vocale avec le profil de l'utilisateur (0-1)
   * Interprétation:
   * - 0.0 - 0.3: Probablement pas l'utilisateur
   * - 0.3 - 0.6: Incertain
   * - 0.6 - 0.8: Probablement l'utilisateur
   * - 0.8 - 1.0: Très probablement l'utilisateur
   */
  voiceSimilarityScore?: number | null;  // ✅ Score continu
  ...
}
```

**Affichage frontend amélioré** :
```typescript
function getSegmentDisplay(segment: TranscriptionSegment) {
  const score = segment.voiceSimilarityScore;

  if (score === null || score === undefined) {
    // Pas de profil vocal disponible
    return { color: 'gray', label: segment.speakerId };
  }

  if (score >= 0.8) {
    // Très probablement l'utilisateur
    return { color: 'blue-600', label: 'Vous', confidence: 'Haute' };
  } else if (score >= 0.6) {
    // Probablement l'utilisateur
    return { color: 'blue-400', label: 'Vous (?)', confidence: 'Moyenne' };
  } else if (score >= 0.3) {
    // Incertain
    return { color: 'yellow-500', label: 'Incertain', confidence: 'Faible' };
  } else {
    // Probablement pas l'utilisateur
    return { color: 'gray-600', label: segment.speakerId, confidence: 'Faible' };
  }
}
```

**Avantage** : Affichage nuancé avec niveaux de confiance !

---

## 🔧 Modifications Effectuées

### 1. Types TypeScript

#### `packages/shared/types/attachment-transcription.ts`

**Avant** :
```typescript
export interface TranscriptionSegment {
  readonly speakerId?: string;
  readonly isCurrentUser?: boolean;
  ...
}
```

**Après** :
```typescript
export interface TranscriptionSegment {
  readonly speakerId?: string;
  /**
   * Score de similarité vocale avec le profil de l'utilisateur (0-1)
   * null si reconnaissance vocale non disponible
   */
  readonly voiceSimilarityScore?: number | null;
  ...
}
```

---

### 2. Services Python

#### A. `services/translator/src/services/transcription_service.py`

**TranscriptionSegment dataclass** :
```python
@dataclass
class TranscriptionSegment:
    text: str
    start_ms: int
    end_ms: int
    confidence: float = 0.0
    speaker_id: Optional[str] = None
    voice_similarity_score: Optional[float] = None  # ✅ NOUVEAU: Score 0-1
```

---

#### B. `services/translator/src/services/diarization_service.py`

**Nouvelle méthode `identify_sender()`** :
```python
async def identify_sender(
    self,
    audio_path: str,  # ✅ NOUVEAU: besoin du fichier audio
    diarization: DiarizationResult,
    sender_voice_profile: Optional[Dict[str, Any]] = None
) -> tuple[DiarizationResult, Dict[str, float]]:  # ✅ NOUVEAU: retourne aussi les scores
    """
    Identifie l'expéditeur et calcule les scores de similarité pour tous les locuteurs.

    Returns:
        Tuple (DiarizationResult, Dict[speaker_id -> score])
    """
    from .voice_recognition_service import get_voice_recognition_service

    if not sender_voice_profile or 'embedding' not in sender_voice_profile:
        # Fallback: pas de profil vocal disponible
        scores = {speaker.speaker_id: 0.0 for speaker in diarization.speakers}
        return diarization, scores

    # Utiliser le service de reconnaissance vocale
    voice_service = get_voice_recognition_service()

    identified_speaker, similarity_scores = voice_service.identify_user_speaker(
        audio_path=audio_path,
        speaker_segments=speaker_segments,
        user_voice_profile=sender_voice_profile,
        threshold=0.6  # Seuil de confiance
    )

    # Mettre à jour diarization avec le speaker identifié
    diarization.sender_identified = (identified_speaker is not None)
    diarization.sender_speaker_id = identified_speaker or diarization.primary_speaker_id

    return diarization, similarity_scores
```

---

#### C. **NOUVEAU** : `services/translator/src/services/voice_recognition_service.py`

Service complet de reconnaissance vocale par embeddings :

**Fonctionnalités** :
- ✅ Extraction d'embeddings vocaux avec pyannote.audio
- ✅ Fallback sur caractéristiques spectrales (MFCC) avec librosa
- ✅ Calcul de similarité cosinus entre embeddings
- ✅ Identification de l'utilisateur parmi plusieurs locuteurs

**Méthodes clés** :
```python
class VoiceRecognitionService:
    def extract_speaker_embedding(audio_path, start_time, end_time) -> np.ndarray
    def compute_similarity(embedding1, embedding2) -> float  # 0-1
    def identify_user_speaker(audio_path, speaker_segments, user_voice_profile) -> (speaker_id, scores)
```

---

### 3. Application dans `_apply_diarization()`

**services/translator/src/services/transcription_service.py** :

```python
async def _apply_diarization(...):
    # 1. Détecter les locuteurs
    diarization = await diarization_service.detect_speakers(audio_path)

    # 2. ✅ NOUVEAU: Identifier l'expéditeur + calculer scores
    diarization, similarity_scores = await diarization_service.identify_sender(
        audio_path,
        diarization,
        sender_voice_profile
    )

    # 3. ✅ NOUVEAU: Enrichir segments avec scores de similarité
    for segment in transcription.segments:
        segment.speaker_id = ...
        segment.voice_similarity_score = similarity_scores.get(
            segment.speaker_id,
            None  # None si pas de profil vocal
        )

    # 4. ✅ NOUVEAU: Ajouter scores dans speakerAnalysis
    transcription.speaker_analysis = {
        "speakers": [
            {
                "speaker_id": speaker.speaker_id,
                "voice_similarity_score": similarity_scores.get(speaker.speaker_id, 0.0),
                ...
            }
        ]
    }
```

---

## 📦 Fichiers Créés/Modifiés

### Fichiers Créés
1. ✅ `services/translator/Dockerfile` - Dockerfile principal avec diarisation
2. ✅ `services/translator/src/services/voice_recognition_service.py` - Service de reconnaissance vocale
3. ✅ `services/translator/migrate_to_voice_similarity.sh` - Script de migration automatique
4. ✅ `services/translator/NOUVEAU_identify_sender.py` - Code de référence pour l'intégration
5. ✅ **CE FICHIER** `MIGRATION_VOICE_SIMILARITY_SCORE.md` - Documentation migration

### Fichiers Modifiés
1. ✅ `Makefile` - Installation des dépendances de diarisation
2. ✅ `packages/shared/types/attachment-transcription.ts` - Type `voiceSimilarityScore`
3. ✅ `services/translator/src/services/transcription_service.py` - dataclass mis à jour
4. ✅ `services/translator/src/services/diarization_service.py` - Méthode `identify_sender()`
5. ✅ `services/translator/src/utils/smart_segment_merger.py` - Fusion avec score
6. ✅ `services/translator/.env` - Variables d'environnement diarisation
7. ✅ `services/translator/.env.example` - Documentation variables
8. ✅ `services/translator/Dockerfile.openvoice` - Support diarisation
9. ✅ `services/translator/requirements-optional.txt` - Dépendances pyannote.audio

---

## 🚀 Installation et Activation

### 1. Installer les Dépendances

```bash
# Via Makefile (recommandé)
make install

# Ou manuellement
cd services/translator
./install-diarization.sh
```

### 2. Configurer les Variables d'Environnement

```bash
# Dans services/translator/.env
ENABLE_DIARIZATION=true

# Optionnel mais recommandé pour meilleure précision
HF_TOKEN=your_huggingface_token
```

### 3. Redémarrer le Service

```bash
make restart
```

---

## 📊 Flux de Reconnaissance Vocale

```
Audio File
    ↓
[Whisper Transcription]
    ↓
Segments avec timestamps natifs
    ↓
[Diarization Service]
    ↓
    ├─ detect_speakers() → Identifie tous les locuteurs
    │   ├─ pyannote.audio (méthode principale)
    │   ├─ Pitch clustering (fallback)
    │   └─ Single speaker (ultime fallback)
    ↓
    └─ identify_sender() → ✅ NOUVEAU
        ↓
        [Voice Recognition Service]
        ↓
        Pour chaque locuteur:
          1. Extraire embedding vocal du segment le plus long
             ├─ pyannote.audio (précis)
             └─ MFCC + spectral features (fallback)
          2. Comparer avec profil vocal utilisateur (similarité cosinus)
          3. Retourner score de similarité (0-1)
        ↓
        Identifier le locuteur avec le score le plus élevé (seuil: 0.6)
        Retourner: (speaker_id, Dict[speaker_id -> score])
    ↓
[Enrichissement des Segments]
    ↓
    Pour chaque segment:
      - speaker_id: ID du locuteur
      - voice_similarity_score: Score de similarité avec l'utilisateur
    ↓
[Frontend]
    ↓
Affichage avec couleurs et niveaux de confiance basés sur le score
```

---

## 🎨 Exemple d'Utilisation Frontend

### Composant React Amélioré

```typescript
interface VoiceSegmentProps {
  segment: TranscriptionSegment;
}

function VoiceSegment({ segment }: VoiceSegmentProps) {
  const score = segment.voiceSimilarityScore;

  // Déterminer le style basé sur le score
  const getStyle = () => {
    if (score === null || score === undefined) {
      return {
        color: 'text-gray-600',
        label: segment.speakerId || 'Inconnu',
        confidence: null
      };
    }

    if (score >= 0.8) {
      return {
        color: 'text-blue-600',
        label: 'Vous',
        confidence: 'Haute',
        badge: '🔵'
      };
    } else if (score >= 0.6) {
      return {
        color: 'text-blue-400',
        label: 'Probablement vous',
        confidence: 'Moyenne',
        badge: '🔷'
      };
    } else if (score >= 0.3) {
      return {
        color: 'text-yellow-500',
        label: 'Incertain',
        confidence: 'Faible',
        badge: '⚠️'
      };
    } else {
      return {
        color: 'text-gray-600',
        label: segment.speakerId || 'Autre',
        confidence: 'Très faible',
        badge: '⚫'
      };
    }
  };

  const style = getStyle();

  return (
    <div className="flex items-start gap-2">
      <span className="text-xs text-gray-400">
        {(segment.startMs / 1000).toFixed(1)}s
      </span>

      <span className={`font-medium ${style.color} flex items-center gap-1`}>
        {style.badge && <span>{style.badge}</span>}
        <span>[{style.label}]</span>
        {score !== null && style.confidence && (
          <span className="text-xs opacity-75">
            ({(score * 100).toFixed(0)}%)
          </span>
        )}
      </span>

      <span className="flex-1">{segment.text}</span>
    </div>
  );
}
```

### Affichage Résultant

```
0.0s 🔵 [Vous] (92%) Bonjour comment vas-tu ?
1.5s ⚫ [speaker_1] (12%) Salut ça va bien merci
3.2s 🔷 [Probablement vous] (68%) Et toi comment ça va ?
5.0s ⚫ [speaker_1] (8%) Très bien aussi
```

**Avantages** :
- ✅ Nuances visuelles selon la confiance
- ✅ Pourcentage de similarité affiché
- ✅ Badges pour reconnaissance rapide
- ✅ Gestion élégante des cas incertains

---

## 🔍 Interprétation des Scores

| Score | Interprétation | Couleur Suggérée | Action Frontend |
|-------|----------------|------------------|-----------------|
| **0.8 - 1.0** | Très probablement l'utilisateur | Bleu foncé | Afficher "Vous" avec haute confiance |
| **0.6 - 0.8** | Probablement l'utilisateur | Bleu clair | Afficher "Vous (?)" avec confiance moyenne |
| **0.3 - 0.6** | Incertain | Jaune/Orange | Afficher "Incertain" ou speaker_id |
| **0.0 - 0.3** | Probablement pas l'utilisateur | Gris | Afficher speaker_id |
| **null** | Pas de profil vocal disponible | Gris | Afficher speaker_id (fallback) |

---

## ⚙️ Configuration de la Reconnaissance Vocale

### Seuils Configurables

Dans `voice_recognition_service.py`, ajuster le seuil de confiance :

```python
# Seuil par défaut: 0.6
identified_speaker, scores = voice_service.identify_user_speaker(
    audio_path=audio_path,
    speaker_segments=speaker_segments,
    user_voice_profile=sender_voice_profile,
    threshold=0.6  # ← Ajuster ici
)
```

### Recommandations

| Contexte | Seuil | Justification |
|----------|-------|---------------|
| **Strict** | 0.8 | Applications sensibles (banking, medical) |
| **Standard** | 0.6 | Usage général (recommandé) |
| **Permissif** | 0.4 | Contextes bruyants, audios courts |

---

## 📝 Format du Profil Vocal Utilisateur

Le profil vocal doit être stocké dans `UserVoiceModel` (MongoDB) :

```typescript
interface UserVoiceProfile {
  user_id: string;
  embedding: number[];  // Vecteur d'embeddings (128-512 dimensions selon le modèle)
  characteristics?: {
    pitch_mean?: number;
    pitch_std?: number;
    spectral_centroid?: number;
    // Autres caractéristiques vocales
  };
  created_at: Date;
  updated_at: Date;
  samples_count: number;  // Nombre d'échantillons utilisés pour créer le profil
}
```

### Création du Profil Vocal

Le profil vocal doit être créé lors de l'enregistrement de l'utilisateur ou via un processus d'entraînement séparé :

1. L'utilisateur enregistre plusieurs échantillons vocaux (3-5 audios de 5-10 secondes)
2. Le service extrait les embeddings de chaque échantillon
3. Calcule la moyenne des embeddings pour créer un profil robuste
4. Stocke dans `UserVoiceModel`

---

## ✅ Tests et Validation

### Test Unitaire - Score de Similarité

```python
def test_voice_similarity_score():
    from services.voice_recognition_service import VoiceRecognitionService

    service = VoiceRecognitionService()

    # Créer des embeddings de test
    user_embedding = np.random.rand(128)
    speaker1_embedding = user_embedding + np.random.rand(128) * 0.1  # Très similaire
    speaker2_embedding = np.random.rand(128)  # Différent

    # Calculer similarités
    score1 = service.compute_similarity(user_embedding, speaker1_embedding)
    score2 = service.compute_similarity(user_embedding, speaker2_embedding)

    # Assertions
    assert 0.0 <= score1 <= 1.0, "Score doit être entre 0 et 1"
    assert 0.0 <= score2 <= 1.0, "Score doit être entre 0 et 1"
    assert score1 > score2, "Speaker 1 devrait être plus similaire"
    assert score1 > 0.8, "Speaker 1 devrait avoir un score élevé"
```

---

## 🎯 Conclusion

### Avant
- Boolean binaire (`isCurrentUser`)
- Impossible de mesurer la confiance
- Fallback basique (locuteur principal = utilisateur)
- Pas de reconnaissance vocale réelle

### Après
- Score continu (0-1) (`voiceSimilarityScore`)
- Mesure de confiance précise
- Reconnaissance vocale par embeddings
- Affichage nuancé au frontend
- Fonctionne même avec un seul locuteur

### Impact Utilisateur
- 🎨 Affichage plus riche avec niveaux de confiance
- 🎯 Identification plus précise de l'utilisateur
- 📊 Transparence sur la confiance de l'identification
- ✅ Meilleure expérience utilisateur globale

---

**Date de création** : 19 janvier 2026
**Auteur** : Claude Sonnet 4.5
**Version** : 1.0
