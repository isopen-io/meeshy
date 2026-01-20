# Comparaison : Réponse Backend Avant/Après Diarisation

**Date** : 19 janvier 2026
**Objectif** : Comparer la structure de réponse du backend gateway avant et après l'implémentation de la diarisation

---

## 📊 Vue d'Ensemble

### Avant (Actuel)
- ❌ Pas d'identification des locuteurs
- ❌ Segments au niveau phrase (imprécis)
- ❌ `speakerCount: null` (non peuplé)
- ❌ Pas de métadonnées sur les locuteurs

### Après (Avec Diarisation)
- ✅ Identification de chaque locuteur avec `speakerId`
- ✅ Identification de l'utilisateur actuel avec `isCurrentUser`
- ✅ Segments mot-par-mot fusionnés intelligemment (Option D)
- ✅ Métadonnées complètes sur les locuteurs
- ✅ Affichage coloré par locuteur au frontend

---

## 🔍 Comparaison Détaillée

### 1. Structure Actuelle (AVANT)

```json
{
  "id": "696a63a8d89de73d3a23e85f",
  "conversationId": "696998a50abd079ac7c2f89a",
  "senderId": "696998a40abd079ac7c2f898",
  "messageType": "audio",
  "transcription": {
    "transcribedText": "Entreprendre c'est tomber et se relever. Parfois je me sens incompris. Je ne m'attendais pas à vivre ça mais quand j'ai quitté mon emploi pour me lancer, les gens autour de moi ne comprenaient pas. Pourquoi quitter un CDI stable ? J'avais une bonne paye, une sécurité, mais quelque chose manquait.",
    "language": "fr",
    "confidence": 0.981,
    "source": "whisper",
    "model": null,
    "segments": [
      {
        "text": "Entreprendre c'est tomber et se relever.",
        "startMs": 940,
        "endMs": 3280
      },
      {
        "text": "Parfois je me sens incompris.",
        "startMs": 3920,
        "endMs": 5900
      },
      {
        "text": "Je ne m'attendais pas à vivre ça mais quand j'ai quitté mon emploi pour me lancer, les gens autour de moi ne comprenaient pas.",
        "startMs": 6440,
        "endMs": 13240
      },
      {
        "text": "Pourquoi quitter un CDI stable ?",
        "startMs": 13480,
        "endMs": 15440
      },
      {
        "text": "J'avais une bonne paye, une sécurité, mais quelque chose manquait.",
        "startMs": 15640,
        "endMs": 19360
      }
    ],
    "audioDurationMs": 33738,
    "speakerCount": null  // ❌ NON PEUPLÉ
  }
}
```

**Problèmes** :
- 🔴 Impossible de savoir qui parle
- 🔴 Impossible de distinguer l'utilisateur des autres locuteurs
- 🔴 Segments au niveau phrase (longs, peu précis)
- 🔴 Pas de métadonnées sur les locuteurs

---

### 2. Nouvelle Structure (APRÈS - Avec Diarisation)

```json
{
  "id": "696a63a8d89de73d3a23e85f",
  "conversationId": "696998a50abd079ac7c2f89a",
  "senderId": "696998a40abd079ac7c2f898",
  "messageType": "audio",
  "transcription": {
    "transcribedText": "Entreprendre c'est tomber et se relever. Parfois je me sens incompris. Je ne m'attendais pas à vivre ça mais quand j'ai quitté mon emploi pour me lancer, les gens autour de moi ne comprenaient pas. Pourquoi quitter un CDI stable ? J'avais une bonne paye, une sécurité, mais quelque chose manquait.",
    "language": "fr",
    "confidence": 0.981,
    "source": "whisper",
    "model": null,

    // ✅ NOUVEAUX CHAMPS DE DIARISATION
    "speakerCount": 1,
    "primarySpeakerId": "speaker_0",
    "senderVoiceIdentified": true,
    "senderSpeakerId": "speaker_0",

    "segments": [
      {
        "text": "Entreprendre",
        "startMs": 940,
        "endMs": 1280,
        "confidence": 0.98,
        "speakerId": "speaker_0",        // ✅ NOUVEAU
        "isCurrentUser": true             // ✅ NOUVEAU
      },
      {
        "text": "c'est",
        "startMs": 1290,
        "endMs": 1480,
        "confidence": 0.97,
        "speakerId": "speaker_0",
        "isCurrentUser": true
      },
      {
        "text": "tomber et",
        "startMs": 1500,
        "endMs": 1920,
        "confidence": 0.96,
        "speakerId": "speaker_0",
        "isCurrentUser": true
      },
      {
        "text": "se relever.",
        "startMs": 1940,
        "endMs": 3280,
        "confidence": 0.98,
        "speakerId": "speaker_0",
        "isCurrentUser": true
      },
      // ... autres segments avec timestamps précis mot-par-mot fusionnés intelligemment
    ],

    "audioDurationMs": 33738,

    // ✅ NOUVEAU : Métadonnées détaillées sur les locuteurs
    "speakerAnalysis": {
      "speakers": [
        {
          "speaker_id": "speaker_0",
          "is_primary": true,
          "speaking_time_ms": 32800,
          "speaking_ratio": 0.972,
          "segments": [
            {
              "speaker_id": "speaker_0",
              "start_ms": 940,
              "end_ms": 33740,
              "duration_ms": 32800,
              "confidence": 0.98
            }
          ],
          "voice_characteristics": null
        }
      ],
      "total_duration_ms": 33738,
      "method": "pyannote"  // ou "pitch_clustering" ou "single_fallback"
    }
  }
}
```

**Avantages** :
- ✅ Identification de chaque locuteur avec `speakerId`
- ✅ Flag `isCurrentUser` pour distinguer l'expéditeur
- ✅ Timestamps précis au niveau mot (natifs de Whisper)
- ✅ Fusion intelligente des mots courts (Option D)
- ✅ Métadonnées complètes sur les locuteurs

---

## 🎨 Exemple Multi-Locuteurs

Imaginons un audio avec 2 locuteurs :

### Audio : Conversation entre Alice (utilisateur) et Bob

```json
{
  "transcription": {
    "transcribedText": "Bonjour comment vas-tu ? Salut ça va bien merci et toi ?",
    "language": "fr",
    "confidence": 0.95,
    "source": "whisper",

    // Métadonnées de diarisation
    "speakerCount": 2,
    "primarySpeakerId": "speaker_0",  // Alice parle le plus
    "senderVoiceIdentified": true,
    "senderSpeakerId": "speaker_0",  // Alice est l'expéditrice

    "segments": [
      // Alice parle
      {
        "text": "Bonjour",
        "startMs": 0,
        "endMs": 480,
        "confidence": 0.96,
        "speakerId": "speaker_0",
        "isCurrentUser": true  // ✅ C'est Alice (l'utilisateur)
      },
      {
        "text": "comment",
        "startMs": 500,
        "endMs": 920,
        "confidence": 0.95,
        "speakerId": "speaker_0",
        "isCurrentUser": true
      },
      {
        "text": "vas-tu ?",
        "startMs": 940,
        "endMs": 1400,
        "confidence": 0.94,
        "speakerId": "speaker_0",
        "isCurrentUser": true
      },

      // Bob répond
      {
        "text": "Salut",
        "startMs": 1600,
        "endMs": 1980,
        "confidence": 0.93,
        "speakerId": "speaker_1",     // ✅ Locuteur différent
        "isCurrentUser": false        // ✅ Ce n'est PAS l'utilisateur
      },
      {
        "text": "ça va",
        "startMs": 2000,
        "endMs": 2380,
        "confidence": 0.92,
        "speakerId": "speaker_1",
        "isCurrentUser": false
      },
      {
        "text": "bien",
        "startMs": 2400,
        "endMs": 2720,
        "confidence": 0.94,
        "speakerId": "speaker_1",
        "isCurrentUser": false
      },
      {
        "text": "merci",
        "startMs": 2740,
        "endMs": 3120,
        "confidence": 0.95,
        "speakerId": "speaker_1",
        "isCurrentUser": false
      },

      // Alice à nouveau
      {
        "text": "et toi ?",
        "startMs": 3200,
        "endMs": 3680,
        "confidence": 0.96,
        "speakerId": "speaker_0",
        "isCurrentUser": true
      }
    ],

    "audioDurationMs": 3680,

    // Analyse détaillée des locuteurs
    "speakerAnalysis": {
      "speakers": [
        {
          "speaker_id": "speaker_0",
          "is_primary": true,
          "speaking_time_ms": 2200,  // Alice parle 2.2 secondes
          "speaking_ratio": 0.598,   // Alice parle 59.8% du temps
          "segments": [
            {"speaker_id": "speaker_0", "start_ms": 0, "end_ms": 1400, "duration_ms": 1400},
            {"speaker_id": "speaker_0", "start_ms": 3200, "end_ms": 3680, "duration_ms": 480}
          ]
        },
        {
          "speaker_id": "speaker_1",
          "is_primary": false,
          "speaking_time_ms": 1480,  // Bob parle 1.48 secondes
          "speaking_ratio": 0.402,   // Bob parle 40.2% du temps
          "segments": [
            {"speaker_id": "speaker_1", "start_ms": 1600, "end_ms": 3120, "duration_ms": 1520}
          ]
        }
      ],
      "total_duration_ms": 3680,
      "method": "pyannote"
    }
  }
}
```

---

## 🎨 Utilisation Frontend

### Code TypeScript pour Affichage Coloré

```typescript
import type { MessageAudioTranscription, TranscriptionSegment } from '@/types';

interface SegmentDisplayProps {
  transcription: MessageAudioTranscription;
}

export function TranscriptionDisplay({ transcription }: SegmentDisplayProps) {
  const getSegmentColor = (segment: TranscriptionSegment): string => {
    // Cas 1 : C'est l'utilisateur actuel
    if (segment.isCurrentUser) {
      return 'text-blue-600';  // Bleu pour l'utilisateur
    }

    // Cas 2 : C'est le locuteur principal (mais pas l'utilisateur)
    if (segment.speakerId === transcription.primarySpeakerId) {
      return 'text-green-600';  // Vert pour le locuteur principal
    }

    // Cas 3 : Autre locuteur
    return 'text-gray-600';  // Gris pour les autres
  };

  const getSpeakerLabel = (segment: TranscriptionSegment): string => {
    if (segment.isCurrentUser) {
      return 'Vous';
    }

    // Trouver le nom du locuteur dans l'analyse
    const speaker = transcription.speakerAnalysis?.speakers.find(
      s => s.speaker_id === segment.speakerId
    );

    if (speaker?.is_primary) {
      return 'Locuteur principal';
    }

    return segment.speakerId || 'Inconnu';
  };

  return (
    <div className="space-y-2">
      {/* Statistiques générales */}
      {transcription.speakerCount && transcription.speakerCount > 1 && (
        <div className="text-sm text-gray-500 mb-4">
          🎙️ {transcription.speakerCount} locuteurs détectés
        </div>
      )}

      {/* Segments avec couleurs */}
      {transcription.segments.map((segment, index) => (
        <div key={index} className="flex items-start gap-2">
          <span className="text-xs text-gray-400 mt-1">
            {(segment.startMs / 1000).toFixed(1)}s
          </span>
          <span className={`font-medium ${getSegmentColor(segment)}`}>
            [{getSpeakerLabel(segment)}]
          </span>
          <span className="flex-1">
            {segment.text}
          </span>
          {segment.confidence && (
            <span className="text-xs text-gray-400">
              {(segment.confidence * 100).toFixed(0)}%
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
```

### Affichage Résultant

```
🎙️ 2 locuteurs détectés

0.0s [Vous] Bonjour
0.5s [Vous] comment
0.9s [Vous] vas-tu ?
1.6s [Locuteur principal] Salut
2.0s [Locuteur principal] ça va
2.4s [Locuteur principal] bien
2.7s [Locuteur principal] merci
3.2s [Vous] et toi ?
```

---

## 📋 Tableau Comparatif

| Fonctionnalité | Avant | Après |
|----------------|-------|-------|
| **Identification locuteurs** | ❌ Non | ✅ Oui (`speakerId`) |
| **Utilisateur actuel** | ❌ Non | ✅ Oui (`isCurrentUser`) |
| **Nombre de locuteurs** | ❌ `null` | ✅ Peuplé (`speakerCount`) |
| **Locuteur principal** | ❌ Non | ✅ Oui (`primarySpeakerId`) |
| **Métadonnées locuteurs** | ❌ Non | ✅ Oui (`speakerAnalysis`) |
| **Granularité segments** | ⚠️ Phrase | ✅ Mot fusionné intelligemment |
| **Précision timestamps** | ⚠️ Approximatif | ✅ Natif Whisper (exact) |
| **Confiance par segment** | ⚠️ Globale | ✅ Par segment |
| **Affichage coloré** | ❌ Impossible | ✅ Possible |
| **Temps de parole** | ❌ Non | ✅ Oui (`speaking_time_ms`) |
| **Ratio de parole** | ❌ Non | ✅ Oui (`speaking_ratio`) |

---

## 🔄 Migration des Transcriptions Existantes

### Option 1 : Migration Passive
- Les anciennes transcriptions restent inchangées
- Les nouvelles transcriptions utilisent la diarisation
- Le frontend gère les deux formats

```typescript
// Frontend - Gestion rétrocompatible
function displaySegment(segment: TranscriptionSegment) {
  // Ancien format : pas de speakerId
  if (!segment.speakerId) {
    return <span className="text-gray-800">{segment.text}</span>;
  }

  // Nouveau format : avec speakerId
  const color = segment.isCurrentUser ? 'text-blue-600' : 'text-gray-600';
  return <span className={color}>{segment.text}</span>;
}
```

### Option 2 : Migration Active (optionnelle)
- Script de migration pour ré-analyser les anciens audios
- Ajoute la diarisation aux transcriptions existantes

```bash
# Script de migration (à créer si nécessaire)
cd services/gateway
npm run migrate:add-diarization
```

---

## ⚙️ Activation de la Diarisation

### Variables d'Environnement

```bash
# Dans services/translator/.env
ENABLE_DIARIZATION=true           # Activer la diarisation
HF_TOKEN=your_huggingface_token   # Token pour pyannote.audio (optionnel)
```

### Niveaux de Diarisation

| Niveau | Configuration | Résultat |
|--------|--------------|----------|
| **Désactivé** | `ENABLE_DIARIZATION=false` | Comme avant (pas de diarisation) |
| **Basique** | `ENABLE_DIARIZATION=true` (sans HF_TOKEN) | Fallback pitch clustering |
| **Complet** | `ENABLE_DIARIZATION=true` + `HF_TOKEN` | pyannote.audio (précis) |

---

## 📊 Impact Performance

### Temps de Traitement Estimé

| Durée Audio | Avant | Après (pyannote) | Après (pitch) |
|-------------|-------|------------------|---------------|
| 10 secondes | 2s | 4s (+100%) | 2.5s (+25%) |
| 30 secondes | 5s | 10s (+100%) | 6s (+20%) |
| 1 minute | 10s | 20s (+100%) | 12s (+20%) |

**Note** : L'impact performance est acceptable pour la valeur ajoutée (identification des locuteurs).

---

## ✅ Résumé des Changements

### Nouveaux Champs Ajoutés

**Au niveau transcription** :
- `speakerCount: number` - Nombre de locuteurs détectés
- `primarySpeakerId: string` - ID du locuteur principal
- `senderVoiceIdentified: boolean` - Expéditeur identifié ?
- `senderSpeakerId: string` - ID du locuteur = expéditeur
- `speakerAnalysis: object` - Métadonnées complètes

**Au niveau segment** :
- `speakerId: string` - ID du locuteur pour ce segment
- `isCurrentUser: boolean` - Ce segment appartient à l'utilisateur ?
- `confidence: number` - Confiance du segment (déjà présent mais maintenant peuplé)

### Granularité des Segments

**Avant** : Phrase complète
```json
{
  "text": "Entreprendre c'est tomber et se relever.",
  "startMs": 940,
  "endMs": 3280
}
```

**Après** : Mots fusionnés intelligemment (Option D)
```json
[
  {"text": "Entreprendre", "startMs": 940, "endMs": 1280},
  {"text": "c'est", "startMs": 1290, "endMs": 1480},
  {"text": "tomber et", "startMs": 1500, "endMs": 1920},
  {"text": "se relever.", "startMs": 1940, "endMs": 3280}
]
```

**Règles de fusion (Option D)** :
- Pause entre mots < 90ms
- Somme des caractères < 8
- Même locuteur

---

## 🎯 Cas d'Usage Frontend

### 1. Affichage Simple (Un Seul Locuteur)

```typescript
// L'utilisateur parle seul
transcription.speakerCount === 1
transcription.segments.every(s => s.isCurrentUser === true)

// Affichage : couleur unique (bleu)
```

### 2. Conversation Multi-Locuteurs

```typescript
// 2+ locuteurs détectés
transcription.speakerCount > 1

// Segments colorés selon le locuteur
segments.map(s => ({
  color: s.isCurrentUser ? 'blue' : s.speakerId === primarySpeakerId ? 'green' : 'gray',
  label: s.isCurrentUser ? 'Vous' : s.speakerId
}))
```

### 3. Statistiques de Conversation

```typescript
// Qui parle le plus ?
const speakerStats = transcription.speakerAnalysis?.speakers.map(s => ({
  id: s.speaker_id,
  label: s.speaker_id === senderSpeakerId ? 'Vous' : s.speaker_id,
  timeMs: s.speaking_time_ms,
  ratio: s.speaking_ratio
}));

// Affichage : graphique en barres
```

---

## 📝 Conclusion

### Points Clés

1. **Compatibilité** : Le nouveau format est rétrocompatible (champs optionnels)
2. **Précision** : Timestamps exacts de Whisper (pas d'interpolation)
3. **Identification** : Savoir qui parle et si c'est l'utilisateur
4. **Affichage** : Coloration par locuteur au frontend
5. **Performance** : Impact acceptable (~+100% avec pyannote, +20% avec pitch)

### Activation

```bash
# Activer dans services/translator/.env
ENABLE_DIARIZATION=true
HF_TOKEN=your_token  # Optionnel mais recommandé
```

### Documentation Complète

- `RESUME_IMPLEMENTATION_DIARISATION.md` - Guide d'implémentation
- `OPTION_D_FUSION_INTELLIGENTE.md` - Détails de la fusion intelligente
- **CE FICHIER** - Comparaison avant/après

---

**Date** : 19 janvier 2026
**Auteur** : Claude Sonnet 4.5
**Version** : 1.0
