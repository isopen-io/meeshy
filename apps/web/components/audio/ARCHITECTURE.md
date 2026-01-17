# SimpleAudioPlayer - Architecture refactorisée

## Vue d'ensemble

Le composant `SimpleAudioPlayer` a été refactorisé de **2155 lignes** à **353 lignes** (-83.6%) en séparant la logique métier de l'UI.

```
┌─────────────────────────────────────────────────────────────┐
│                  SimpleAudioPlayer.tsx                      │
│                      (353 lignes)                           │
│                                                             │
│  Orchestre les hooks et composants enfants                 │
└─────────────────────────────────────────────────────────────┘
                             │
                             │ utilise
                             ▼
┌──────────────────────┬──────────────────────┬──────────────┐
│   HOOKS (logique)    │  COMPOSANTS (UI)     │  UTILS       │
└──────────────────────┴──────────────────────┴──────────────┘
```

## Architecture détaillée

### 1. Hooks (Logique métier)

```
/hooks/
├── use-audio-playback.ts (340 lignes)
│   ├─ Chargement audio via apiService
│   ├─ Lecture/pause/seek
│   ├─ Gestion de la vitesse
│   └─ Animation 60fps (requestAnimationFrame)
│
├── use-audio-translation.ts (200 lignes)
│   ├─ Abonnement WebSocket aux traductions
│   ├─ Transcription audio → texte
│   ├─ Traduction audio complète
│   └─ Sélection de langue
│
└── use-audio-effects-analysis.ts (180 lignes)
    ├─ Extraction des effets appliqués
    ├─ Timeline des activations
    └─ Configurations des paramètres
```

### 2. Composants UI

```
/components/audio/
├── SimpleAudioPlayer.tsx (353 lignes) ⭐ PRINCIPAL
│   └─ Orchestre tous les composants
│
├── AudioProgressBar.tsx (60 lignes)
│   └─ Barre de progression 60fps optimisée
│
├── AudioControls.tsx (150 lignes)
│   ├─ Bouton play/pause
│   ├─ Sélecteur de vitesse
│   ├─ Sélecteur de langue
│   ├─ Bouton transcription
│   └─ Bouton traduction
│
├── AudioTranscriptionPanel.tsx (80 lignes)
│   ├─ Affichage transcription
│   └─ Gestion des erreurs
│
├── AudioEffectsPanel.tsx (120 lignes) 🚀 DYNAMIC IMPORT
│   └─ Tabs pour chaque effet
│
├── AudioEffectsGraph.tsx (200 lignes)
│   └─ Graphique SVG des paramètres
│
├── AudioEffectsTimeline.tsx (80 lignes)
│   └─ Timeline visuelle des segments
│
├── AudioEffectsOverview.tsx (220 lignes)
│   └─ Vue fusionnée de tous les effets
│
└── AudioEffectIcon.tsx (20 lignes)
    └─ Icône réutilisable
```

### 3. Utilitaires

```
/utils/
├── audio-formatters.ts
│   ├─ formatTime(seconds) → "MM:SS.ms"
│   ├─ formatDuration(seconds) → "MM:SS"
│   └─ snapPlaybackRate(value) → snapped value
│
└── audio-effects-config.ts
    ├─ LANGUAGE_NAMES (mapping)
    ├─ EFFECT_NAMES (mapping)
    ├─ EFFECT_COLORS (mapping)
    ├─ EFFECT_ICONS (mapping)
    └─ Helper functions
```

## Flux de données

### Lecture audio

```
┌─────────────────┐
│  User clicks    │
│  Play button    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ SimpleAudio     │
│ Player          │
│ togglePlay()    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ useAudioPlayback│
│ - Stop others   │
│ - Start audio   │
│ - Start RAF     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ AudioProgress   │
│ Bar updates     │
│ (60fps)         │
└─────────────────┘
```

### Traduction audio

```
┌─────────────────┐
│ User requests   │
│ translation     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ useAudio        │
│ Translation     │
│ API call        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ WebSocket       │
│ AUDIO_          │
│ TRANSLATION_    │
│ READY event     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Update state:   │
│ - transcription │
│ - translatedAudios│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ UI re-renders   │
│ with new data   │
└─────────────────┘
```

## Optimisations de performance

### 1. Mémoization

Tous les composants utilisent `React.memo`:

```typescript
export const AudioProgressBar = memo<AudioProgressBarProps>(({ ... }) => {
  // Re-render seulement si props changent
});
```

### 2. Callbacks stables

```typescript
const handleSeek = useCallback((e) => {
  // Référence stable, pas de re-création
}, [dependencies]);
```

### 3. Calculs mémorisés

```typescript
const appliedEffects = useMemo(() => {
  // Calcul coûteux, exécuté seulement si attachment change
  return extractEffects(attachment);
}, [attachment]);
```

### 4. Chargement dynamique

```typescript
const AudioEffectsPanel = dynamic(
  () => import('./AudioEffectsPanel'),
  { ssr: false }
);
// Chargé seulement si des effets sont appliqués
```

### 5. Animation 60fps

```typescript
const updateProgress = useCallback(() => {
  setCurrentTime(audioRef.current.currentTime);
  animationFrameRef.current = requestAnimationFrame(updateProgress);
}, []);
```

## Responsabilités

### SimpleAudioPlayer (Principal)

**Responsabilités:**
- Orchestration des hooks
- Gestion des états UI locaux (dropdown open/close)
- Rendu de la structure principale

**Ne fait PAS:**
- Logique audio directe
- Calculs des effets
- Gestion WebSocket

### useAudioPlayback

**Responsabilités:**
- Chargement du fichier audio
- Play/pause/seek
- Animation de progression
- Gestion des erreurs

**Ne fait PAS:**
- Rendu UI
- Traduction
- Analyse des effets

### useAudioTranslation

**Responsabilités:**
- Abonnement WebSocket
- Requêtes API transcription/traduction
- Sélection de langue
- Calcul de l'URL audio actuelle

**Ne fait PAS:**
- Lecture audio
- Rendu UI
- Gestion de la progression

### useAudioEffectsAnalysis

**Responsabilités:**
- Extraction des effets de la timeline
- Calcul des segments d'activation
- Extraction des configurations

**Ne fait PAS:**
- Rendu des graphiques
- Modification des effets
- Lecture audio

## Patterns utilisés

### 1. Separation of Concerns
Logique métier (hooks) séparée de l'UI (composants)

### 2. Single Responsibility Principle
Chaque composant/hook a une responsabilité unique

### 3. Composition over Inheritance
Composition de composants petits et réutilisables

### 4. Container/Presenter Pattern
`SimpleAudioPlayer` = Container
Autres composants = Presenters

### 5. Custom Hooks Pattern
Encapsulation de la logique réutilisable

## Métriques

| Fichier | Lignes | Responsabilité |
|---------|--------|----------------|
| SimpleAudioPlayer.old.tsx | 2155 | TOUT |
| SimpleAudioPlayer.tsx | 353 | Orchestration |
| useAudioPlayback.ts | 340 | Lecture |
| useAudioTranslation.ts | 200 | Traduction |
| useAudioEffectsAnalysis.ts | 180 | Analyse effets |
| AudioControls.tsx | 150 | UI controls |
| AudioEffectsOverview.tsx | 220 | Vue fusionnée |
| AudioEffectsGraph.tsx | 200 | Graphique effet |
| AudioEffectsPanel.tsx | 120 | Panneau effets |
| AudioTranscriptionPanel.tsx | 80 | Panneau transcription |
| AudioEffectsTimeline.tsx | 80 | Timeline |
| AudioProgressBar.tsx | 60 | Barre progression |
| AudioEffectIcon.tsx | 20 | Icône |

**Total: 2003 lignes** (vs 2155 avant, mais avec meilleure organisation)

## Avantages du refactoring

### ✅ Maintenabilité
- Fichiers plus petits et focalisés
- Plus facile à comprendre et modifier
- Moins de risques de régressions

### ✅ Testabilité
- Hooks testables indépendamment
- Composants testables en isolation
- Mocking plus simple

### ✅ Réutilisabilité
- Hooks réutilisables dans d'autres contextes
- Composants réutilisables
- Utils partagés

### ✅ Performance
- Mémoization appropriée
- Chargement dynamique
- Animation optimisée

### ✅ Développement
- Modifications plus rapides
- Moins de conflits git
- Meilleure DX (Developer Experience)
