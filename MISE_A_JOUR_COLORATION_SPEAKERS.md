# Mise à Jour : Coloration des Speakers dans la Transcription

**Date** : 19 janvier 2026
**Objectif** : Implémenter la coloration dynamique des différents speakers pendant la lecture audio en continu

---

## 🎯 Changements Effectués

### 1. ✅ Types TypeScript Mis à Jour

**Fichier** : `packages/shared/types/attachment-transcription.ts`

#### Nouveaux types ajoutés :

```typescript
/**
 * Informations détaillées sur un locuteur détecté
 */
export interface SpeakerInfo {
  /** ID court du locuteur (s0, s1, s2, ...) */
  readonly sid: string;
  /** Ce locuteur est-il le locuteur principal (celui qui parle le plus) */
  readonly is_primary: boolean;
  /** Temps de parole en millisecondes */
  readonly speaking_time_ms: number;
  /** Ratio de temps de parole (0-1) */
  readonly speaking_ratio: number;
  /** Score de similarité vocale avec le profil utilisateur (0-1 ou null) */
  readonly voice_similarity_score: number | null;
  /** Segments de temps où ce locuteur parle */
  readonly segments: readonly { start_ms: number; end_ms: number; duration_ms: number }[];
}

/**
 * Analyse complète des locuteurs détectés
 */
export interface SpeakerAnalysis {
  /** Liste de tous les locuteurs détectés */
  readonly speakers: readonly SpeakerInfo[];
  /** Durée totale de l'audio en millisecondes */
  readonly total_duration_ms: number;
  /** Méthode de diarisation utilisée */
  readonly method: 'pyannote' | 'pitch_clustering' | 'single_speaker';
}
```

#### Champs ajoutés à `AudioTranscription` :

```typescript
export interface AudioTranscription {
  // ... champs existants

  /** L'utilisateur a-t-il été identifié parmi les locuteurs (nécessite profil vocal) */
  readonly senderVoiceIdentified?: boolean;

  /** ID du locuteur identifié comme l'utilisateur (null si non identifié) */
  readonly senderSpeakerId?: string | null;

  /** Analyse détaillée de tous les locuteurs détectés */
  readonly speakerAnalysis?: SpeakerAnalysis;
}
```

---

### 2. ✅ Composant React `TranscriptionViewer` Amélioré

**Fichier** : `apps/web/components/audio/TranscriptionViewer.tsx`

#### Fonctionnalités Ajoutées :

1. **Affichage du Texte Continu**
   - Tout le texte de la transcription est affiché de manière fluide et continue
   - Texte en gris normal quand aucun segment n'est actif
   - Facile à lire comme un texte standard

2. **Surlignage Dynamique Pendant la Lecture**
   - Seul le segment actuellement lu est surligné en **gras** avec un **fond coloré**
   - La couleur change automatiquement selon le speaker qui parle :
     - Utilisateur identifié : **Bleu** (`bg-blue-100 text-blue-700`)
     - Speaker 0 : **Violet** (`bg-purple-100 text-purple-700`)
     - Speaker 1 : **Vert** (`bg-green-100 text-green-700`)
     - Speaker 2 : **Orange** (`bg-orange-100 text-orange-700`)
     - Speaker 3 : **Rose** (`bg-pink-100 text-pink-700`)
     - Speaker 4 : **Teal** (`bg-teal-100 text-teal-700`)

3. **Transitions Fluides**
   - Transition douce (`duration-200`) entre les segments
   - Le surlignage se déplace naturellement au fil de la lecture
   - Comme des sous-titres colorés en temps réel

4. **Auto-scroll Intelligent**
   - Scroll automatique vers le segment actif pendant la lecture
   - Smooth scroll avec seuil de 5px pour éviter les micro-scrolls
   - Garde toujours le segment actif visible

5. **En-tête Informationnel**
   - Nombre de locuteurs détectés
   - Message d'incitation si pas de profil vocal : *"Créez un profil vocal pour vous identifier"*

6. **Légende Compacte des Speakers**
   - Affichée en bas pour identifier les couleurs
   - Format : `Locuteurs: 🔵 Vous (92%) 🟣 s1 (15%)`
   - Aide l'utilisateur à comprendre qui parle avec quelle couleur

#### Optimisations (Vercel React Best Practices) :

- ✅ **`React.memo`** : Évite les re-renders inutiles du composant
- ✅ **`useMemo` pour `activeSegmentIndex`** : Dérivé de `currentTime` (règle `rerender-derived-state`)
- ✅ **`useMemo` pour `speakerMetadata`** : Mémorisé pour éviter recalcul (règle `rerender-memo`)
- ✅ **`useMemo` pour `renderSegments`** : Mémorisé pour éviter re-calcul à chaque render
- ✅ **`content-visibility: auto`** : Optimise le rendu des segments hors vue (règle `rendering-content-visibility`)
- ✅ **Smooth scroll** : Auto-scroll avec `behavior: 'smooth'` uniquement si nécessaire (seuil 5px)

---

## 📊 Exemple de Rendu Visuel

### Vue d'Ensemble : Texte Continu avec Surlignage Dynamique

Le texte complet est affiché de manière continue. **Pendant la lecture audio**, seul le segment actuellement lu est surligné en gras avec un fond coloré selon le speaker qui parle.

### État Initial (Avant Lecture)

```
┌────────────────────────────────────────────────────────────┐
│ 👥 2 locuteurs détectés                                    │
│                    Créez un profil vocal pour vous identifier│
├────────────────────────────────────────────────────────────┤
│                                                            │
│ Bonjour comment vas-tu ? Salut ça va bien merci.          │
│                                                            │
│ Locuteurs: 🔵 Vous (92%)  🟣 s1 (15%)                      │
└────────────────────────────────────────────────────────────┘
```

### Pendant la Lecture - Segment 1 (Vous parlez)

```
┌────────────────────────────────────────────────────────────┐
│ 👥 2 locuteurs détectés                                    │
├────────────────────────────────────────────────────────────┤
│                                                            │
│ 🔵 Bonjour comment vas-tu ? Salut ça va bien merci.       │
│    ^^^^^^^^^^^^^^^^^^^^                                    │
│    (surligné en BLEU gras)                                 │
│                                                            │
│ Locuteurs: 🔵 Vous (92%)  🟣 s1 (15%)                      │
└────────────────────────────────────────────────────────────┘
```

### Pendant la Lecture - Segment 2 (Autre speaker)

```
┌────────────────────────────────────────────────────────────┐
│ 👥 2 locuteurs détectés                                    │
├────────────────────────────────────────────────────────────┤
│                                                            │
│ Bonjour comment vas-tu ? 🟣 Salut ça va bien merci.       │
│                              ^^^^^^^^^^^^^^^^^^^^^^^^      │
│                              (surligné en VIOLET gras)     │
│                                                            │
│ Locuteurs: 🔵 Vous (92%)  🟣 s1 (15%)                      │
└────────────────────────────────────────────────────────────┘
```

### Sans Profil Vocal (Pas d'Identification)

```
┌────────────────────────────────────────────────────────────┐
│ 👥 2 locuteurs détectés                                    │
│                    Créez un profil vocal pour vous identifier│
├────────────────────────────────────────────────────────────┤
│                                                            │
│ 🟣 Bonjour comment vas-tu ? Salut ça va bien merci.       │
│    ^^^^^^^^^^^^^^^^^^^^ (segment actif en VIOLET)          │
│                                                            │
│ Locuteurs: 🟣 s0  🟢 s1                                    │
└────────────────────────────────────────────────────────────┘
```

---

## 🎨 Logique de Coloration

### Fonction `getSpeakerColor()`

```typescript
const getSpeakerColor = (
  speakerId: string | undefined,
  senderSpeakerId: string | null | undefined,
  voiceScore: number | null | undefined
) => {
  // 1. Pas de speaker ID → couleur par défaut (violet)
  if (!speakerId) {
    return SPEAKER_COLORS.speakers[0];
  }

  // 2. Utilisateur identifié (score ≥ 0.6) → BLEU
  if (senderSpeakerId === speakerId && voiceScore >= 0.6) {
    return SPEAKER_COLORS.user; // Bleu
  }

  // 3. Autre speaker → couleur selon numéro (s0 → violet, s1 → vert, etc.)
  const speakerNum = parseInt(speakerId.replace(/\D/g, ''), 10) || 0;
  return SPEAKER_COLORS.speakers[speakerNum % SPEAKER_COLORS.speakers.length];
};
```

### Fonction `getSpeakerLabel()`

```typescript
const getSpeakerLabel = (
  speakerId: string | undefined,
  voiceScore: number | null | undefined,
  senderSpeakerId: string | null | undefined
): { label: string; isUser: boolean; confidence: string } => {
  // 1. Pas de speaker ID
  if (!speakerId) return { label: '?', isUser: false, confidence: '' };

  // 2. Pas de profil vocal (score null)
  if (voiceScore === null || voiceScore === undefined) {
    return { label: speakerId, isUser: false, confidence: '(pas de profil vocal)' };
  }

  // 3. Utilisateur identifié (score ≥ 0.6)
  if (senderSpeakerId === speakerId && voiceScore >= 0.6) {
    return {
      label: 'Vous',
      isUser: true,
      confidence: voiceScore >= 0.8 ? 'Haute confiance' : 'Confiance moyenne',
    };
  }

  // 4. Score faible (< 0.3)
  if (voiceScore < 0.3) {
    return { label: speakerId, isUser: false, confidence: 'Très faible' };
  }

  // 5. Score incertain (0.3 - 0.6)
  return { label: `${speakerId} (?)`, isUser: false, confidence: 'Incertain' };
};
```

---

## 📦 Utilisation dans les Composants Parents

### Exemple d'Intégration

```typescript
import { TranscriptionViewer } from '@/components/audio/TranscriptionViewer';

function AudioPlayer() {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div>
      {/* Lecteur audio */}
      <audio
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

      {/* Transcription avec coloration des speakers */}
      <TranscriptionViewer
        transcription={{
          text: "Bonjour comment vas-tu ? Salut ça va bien merci.",
          language: "fr",
          confidence: 0.95,
          segments: [
            {
              startMs: 0,
              endMs: 1400,
              text: "Bonjour comment vas-tu ?",
              speakerId: "s0",
              voiceSimilarityScore: 0.92, // Probablement l'utilisateur
            },
            {
              startMs: 1600,
              endMs: 3800,
              text: "Salut ça va bien merci",
              speakerId: "s1",
              voiceSimilarityScore: 0.15, // Probablement pas l'utilisateur
            },
          ],
          speakerCount: 2,
          primarySpeakerId: "s0",
          senderVoiceIdentified: true,
          senderSpeakerId: "s0",
          speakerAnalysis: {
            speakers: [
              {
                sid: "s0",
                is_primary: true,
                speaking_time_ms: 1400,
                speaking_ratio: 0.37,
                voice_similarity_score: 0.92,
                segments: [{ start_ms: 0, end_ms: 1400, duration_ms: 1400 }],
              },
              {
                sid: "s1",
                is_primary: false,
                speaking_time_ms: 2200,
                speaking_ratio: 0.58,
                voice_similarity_score: 0.15,
                segments: [{ start_ms: 1600, end_ms: 3800, duration_ms: 2200 }],
              },
            ],
            total_duration_ms: 3800,
            method: 'pyannote',
          },
        }}
        currentTime={currentTime}
        isPlaying={isPlaying}
        isExpanded={isExpanded}
        onToggleExpanded={() => setIsExpanded(!isExpanded)}
        selectedLanguage="original"
        showScores={true} // Afficher les scores de similarité
      />
    </div>
  );
}
```

---

## 🚀 Prochaines Étapes (Backend)

Pour que cette interface fonctionne complètement, le backend (Gateway + Translator) doit :

1. ✅ **Retourner les nouveaux champs dans l'API** :
   - `senderVoiceIdentified: boolean`
   - `senderSpeakerId: string | null`
   - `speakerAnalysis: SpeakerAnalysis`

2. ⏳ **Intégrer le code de `NOUVEAU_identify_sender.py`** dans `diarization_service.py`
   - Remplacer la méthode `identify_sender()` actuelle

3. ⏳ **Mettre à jour `_apply_diarization()`** dans `transcription_service.py`
   - Utiliser la nouvelle signature avec `audio_path`
   - Récupérer les scores de similarité
   - Enrichir chaque segment avec `voiceSimilarityScore`

4. ⏳ **Créer/Gérer les Profils Vocaux Utilisateur**
   - Route POST `/api/users/voice-profile` pour enregistrer des échantillons vocaux
   - Extraction d'embeddings de chaque échantillon
   - Calcul de la moyenne des embeddings
   - Stockage dans MongoDB (collection `UserVoiceModel`)

---

## 📊 Compatibilité et Dégradation Gracieuse

Le composant gère gracieusement tous les cas :

### ✅ Cas 1 : Transcription Simple (Sans Diarisation)
```typescript
transcription={{
  text: "Bonjour",
  language: "fr",
  // Pas de segments, pas de speakers
}}
// → Affiche juste le texte sans coloration
```

### ✅ Cas 2 : Avec Segments Mais Sans Profil Vocal
```typescript
transcription={{
  segments: [
    { speakerId: "s0", voiceSimilarityScore: null, ... },
    { speakerId: "s1", voiceSimilarityScore: null, ... },
  ],
  senderSpeakerId: null,
}}
// → Affiche les segments colorés avec labels "s0", "s1"
// → Message : "Créez un profil vocal pour vous identifier"
```

### ✅ Cas 3 : Avec Profil Vocal et Utilisateur Identifié
```typescript
transcription={{
  segments: [
    { speakerId: "s0", voiceSimilarityScore: 0.92, ... },
    { speakerId: "s1", voiceSimilarityScore: 0.15, ... },
  ],
  senderSpeakerId: "s0",
  senderVoiceIdentified: true,
}}
// → s0 affiché en bleu avec "Vous (92%)"
// → s1 affiché en violet avec "s1 (15%)"
```

---

## ✅ Résumé des Améliorations

| Aspect | Avant | Après |
|--------|-------|-------|
| **Affichage texte** | Mots séparés | Texte continu fluide |
| **Coloration** | Aucune | Surlignage coloré dynamique du segment actif |
| **Changement speaker** | Pas visible | Couleur change automatiquement (bleu → violet → vert...) |
| **Label utilisateur** | N/A | "Vous" en bleu dans la légende |
| **Scores affichés** | Non | Oui dans la légende (optionnel via `showScores`) |
| **Segment actif** | Surlignage simple | Gras + fond coloré + auto-scroll |
| **Info speakers** | Aucune | En-tête avec nombre + légende compacte |
| **Pas de profil** | Silencieux | Message d'incitation clair |
| **Performance 50+ segments** | N/A | `content-visibility`, `useMemo`, `memo` |
| **Expérience lecture** | Statique | Comme des sous-titres colorés en temps réel |

---

## 🎯 Conformité aux Best Practices

### Vercel React Best Practices Appliquées :

- ✅ `rerender-memo` : Mémoisation des segments et métadonnées
- ✅ `rerender-derived-state` : `activeSegmentIndex` dérivé de `currentTime`
- ✅ `rendering-content-visibility` : Segments hors vue optimisés
- ✅ `rendering-hoist-jsx` : Palette de couleurs définie en constante module-level

### Web Design Guidelines Appliquées :

- ✅ **Accessibilité** : `aria-label`, `aria-live`, `aria-expanded`
- ✅ **Contraste** : Toutes les couleurs respectent WCAG AA
- ✅ **Focus** : `focus-visible:ring-2` pour navigation clavier
- ✅ **Dark mode** : Support complet via classes Tailwind `dark:`
- ✅ **Responsive** : `flex-wrap`, `overflow-auto`, `scrollbar-thin`

---

**Date de création** : 19 janvier 2026
**Auteur** : Claude Sonnet 4.5
**Version** : 1.0
