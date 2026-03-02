# Story Composer V3 — Design Document

**Date**: 2026-03-02
**Auteur**: Claude + User
**Statut**: Validé

## Vue d'ensemble

Refonte majeure du Story Composer iOS (StoryComposerView) pour simplifier l'UX et introduire un système de timeline par piste. Le composer actuel (82KB, 2064 lignes, 50+ @State) est remplacé par une architecture clean avec un ViewModel unique @Observable.

### Principes directeurs

- **Toolbar contextuelle unique** — outils groupés Fond/Front, pas de switch de mode
- **Gestes purs** — pas de chrome de sélection, glow subtil + long press menu
- **Timeline par piste** — Simple (défaut) + Avancé (toggle), pas de paywall
- **Playback individuel** — bouton play intégré sur chaque vidéo/audio du canvas
- **Thème Meeshy** — palette indigo cohérente, respecte dark/light mode

## Architecture des vues

```
StoryComposerView (racine)
├── @State viewModel = StoryComposerViewModel()
├── TopBar
│   ├── [X] Dismiss
│   ├── SlideStrip (miniatures scrollables)
│   ├── [▶] Preview (fullscreen playback)
│   └── [Publier] (gradient indigo)
├── StoryCanvasView (9:16)
│   ├── FOND (ordre fixe, non-interactif en mode Front)
│   │   ├── Layer 0: Couleur / Dégradé
│   │   ├── Layer 1: Image ou Vidéo de fond
│   │   └── Layer 2: Dessin PKDrawing
│   ├── FRONT (éléments draggable/pinch/rotate)
│   │   ├── CanvasMediaElement × N (images, vidéos avec ▶)
│   │   ├── CanvasTextElement × N (draggable text)
│   │   └── CanvasAudioElement × N (waveform avec ▶)
│   └── SelectionGlow (highlight subtil sur élément actif)
├── ContextualToolbar
│   ├── Groupe FOND: [Bg Image] [Dessin] [Audio ambiant]
│   ├── Groupe FRONT: [Texte] [Image] [Vidéo] [Audio]
│   └── Commun: [Filtre] [Effets] [Timeline]
└── ActivePanel (bottom sheet animé selon outil sélectionné)
    ├── TextEditorPanel
    ├── DrawingToolbar
    ├── MediaPickerPanel
    ├── BackgroundPanel
    ├── ElementTimingPanel
    └── TimelinePanel (Simple ◆ Avancé toggle)
```

## State Management — ViewModel unique

```swift
@Observable
final class StoryComposerViewModel {
    // Slides
    var slides: [StorySlide]
    var currentSlideIndex: Int
    var currentSlide: StorySlide { get }

    // Sélection
    var selectedElementId: String?
    var selectedElement: CanvasElement? { get }

    // Outils
    var activeTool: ToolMode?  // .bgImage, .drawing, .bgAudio, .text, .image, .video, .audio, .filter, .effects, .timeline

    // Média
    var loadedMedia: [String: MediaAsset]  // images/vidéos/audios en mémoire

    // Timeline
    var isTimelineVisible: Bool
    var timelineMode: TimelineMode  // .simple | .advanced

    // Méthodes
    func addText() -> StoryTextObject
    func addMedia(type: MediaType) -> StoryMediaObject
    func addAudio() -> StoryAudioPlayerObject
    func deleteElement(id: String)
    func bringToFront(id: String)
    func sendToBack(id: String)
    func duplicateElement(id: String)
    func toggleLock(id: String)
}
```

## Fond — Ordre fixe des couches

| Layer | Contenu | Interactivité |
|-------|---------|---------------|
| 0 | Couleur / Dégradé | Picker dans panel Fond |
| 1 | Image OU Vidéo de fond | Pinch/drag pour repositionner |
| 2 | Dessin main levée (PKDrawing) | PKCanvasView quand outil Dessin actif |
| 3 | Fond sonore (invisible, audio only) | Contrôle via panel ou timeline |

## Front — Éléments canvas

### Limites par slide (= 1 story publiée)

- **Textes** : max 5 (pas des PostMedia)
- **PostMedia total** : max 10 (images + vidéos + audios combinés)
  - Images : max 5
  - Vidéos : max 4
  - Audios : max 5

### CanvasElement (protocol unifié côté Vue)

```swift
protocol CanvasElement: Identifiable {
    var id: String { get }
    var x: Float { get set }       // 0-1 normalisé
    var y: Float { get set }       // 0-1 normalisé
    var scale: Float { get set }
    var rotation: Float { get set }
    var zIndex: Int { get set }    // auto-incrémenté au touch
    var elementType: CanvasElementType { get }
}
```

### Matrice d'interactions

| Geste | Aucune sélection | Élément sélectionné |
|-------|-------------------|---------------------|
| Tap canvas vide | Désélectionne tout | Désélectionne |
| Tap élément | Sélectionne (glow indigo) | Change sélection |
| Double-tap texte | Sélectionne + ouvre éditeur | Ouvre éditeur |
| Double-tap image/vidéo | Sélectionne + ouvre édition | Ouvre édition |
| Drag | — | Déplace (normalise x,y) |
| Pinch | — | Resize (scale) |
| Rotation 2 doigts | — | Rotation (degrés) |
| Tap ▶ sur vidéo/audio | Play/pause individuel | Play/pause |
| Long press | — | Menu contextuel |

### Z-order

- Dernier touché monte automatiquement au front
- Long press → "Mettre devant" / "Mettre derrière" pour ajuster manuellement

### Menu contextuel (long press)

- Dupliquer
- Supprimer
- Mettre devant / Mettre derrière
- Timing ⏱ (ouvre ElementTimingPanel si audio/vidéo/texte)
- Verrouiller 🔒

## Toolbar contextuelle

```
── FOND ──  │  ── FRONT ──  │  ── PLUS ──
[🖼Bg] [✏️] [🎵]│ [T] [📷] [🎬] [🔊]│ [⚡Fx] [⏱TL]
```

### Comportement

- Outil Fond actif → éléments Front atténués (opacity 0.4), non-interactifs
- Outil Front actif → fond visible mais non-interactif
- Aucun outil → tous les éléments front draggables
- Badges compteurs sur chaque pill si contenu existe

## Timeline par piste

### Pistes gérées

| Type | Icône | Contrôles Simple | Contrôles Avancé |
|------|-------|-------------------|-------------------|
| Vidéo BG | 🖼 | Volume, loop, barre début/fin | + fade, trim, courbe volume |
| Audio BG | 🎵 | Volume, loop, barre début/fin | + fade, trim, courbe volume |
| Texte × N | T | Début, durée d'affichage | + fade in/out |
| Vidéo FG × N | 🎬 | Volume, loop, barre début/fin, play | + fade, trim, courbe volume, snap |
| Audio FG × N | 🔊 | Volume, loop, barre début/fin, play | + fade, trim, courbe volume, snap |

### Mode Simple (défaut)

Liste verticale de pistes. Chaque piste affiche :
- Icône type + nom
- Bouton play/pause individuel (audio/vidéo)
- Barre de timing (drag les bords pour début/fin)
- Slider volume (audio/vidéo)
- Toggle loop

### Mode Avancé (toggle)

Même vue par piste + :
- Axe temporel horizontal avec graduations (pinch-to-zoom)
- Playhead vertical draggable
- Fade-in/fade-out visuels (dégradé sur bords des barres)
- Trim inline (✂️)
- Courbe volume (📊)
- Transport global : prev / play / next + compteur
- Drag horizontal des barres pour décaler le start
- Snap magnétique entre pistes

### Couleurs des pistes

| Piste | Couleur | Token |
|-------|---------|-------|
| Vidéo BG | #4338CA | indigo700 |
| Audio BG | #4F46E5 | indigo600 |
| Texte | #C7D2FE | indigo200 |
| Vidéo FG | #818CF8 | indigo400 |
| Audio FG | #A5B4FC | indigo300 |
| Playhead | blanc (dark) / indigo950 (light) | — |

## Extensions modèle de données

### StoryTextObject (nouveaux champs)

```
+ startTime: Float         // quand le texte apparaît (défaut: 0)
+ displayDuration: Float?  // combien de temps visible (nil = permanent)
+ fadeIn: Float?           // animation d'entrée en secondes
+ fadeOut: Float?          // animation de sortie en secondes
```

### StoryMediaObject (nouveaux champs)

```
+ startTime: Float     // offset en secondes
+ duration: Float?     // durée de lecture (nil = jusqu'à la fin)
+ loop: Bool           // boucle automatique
+ fadeIn: Float?       // fade-in en secondes
+ fadeOut: Float?      // fade-out en secondes
```

### StoryAudioPlayerObject (nouveaux champs)

```
+ startTime: Float     // offset en secondes
+ duration: Float?     // durée de lecture (nil = jusqu'à la fin)
+ loop: Bool           // boucle automatique
+ fadeIn: Float?       // fade-in en secondes
+ fadeOut: Float?      // fade-out en secondes
```

## Thème visuel Meeshy

| Élément | Dark | Light |
|---------|------|-------|
| Glow sélection | indigo #6366F1, blur 8, opacity 0.6 | idem |
| Toolbar fond | #13111C (surface secondaire) | #F8F7FF |
| Pill active | gradient #6366F1 → #4338CA | idem |
| Pill inactive | text tertiaire, fond transparent | idem |
| Dividers | indigo900 opacity 0.3 | indigo200 |
| Badges compteurs | cercle indigo400, texte blanc | idem |

## Publication

Flux inchangé dans l'esprit :

1. Snapshot canvas → UIImage
2. Collecter médias chargés
3. Sérialiser StoryEffects (avec nouveaux champs timing)
4. Callback onPublishSlide
5. Backend upload → PostMedia IDs
6. Progression dans bouton publier

Les champs startTime, duration, loop, fadeIn, fadeOut sont inclus dans les effects sérialisés → StoryCanvasReaderView les utilise pour orchestrer le playback.

## Performance

- Lazy loading : médias du slide actif + 1 avant/après
- Vidéo thumbnail : frame statique sauf quand play pressé
- Audio waveform : calculer une fois à l'import
- Canvas : drawingGroup() pour couches composées
- Gesture : @GestureState pour deltas transitoires
- Timeline : rendu via Canvas (SwiftUI)

## Gestion d'erreurs

| Situation | Comportement |
|-----------|-------------|
| Import média échoue | Toast + élément non ajouté |
| Limite 10 PostMedia | Toast + boutons grisés |
| Limite 5 textes | Bouton grisé + badge "5/5" |
| Publication échoue | Retry/Skip/Cancel |
| Mémoire faible | Décharger médias slides non-actifs |

## Draft & Persistance

- Auto-save (UserDefaults "storyComposerDraft")
- Nouveaux champs timing inclus dans le draft
- Restauration : alert "Reprendre le brouillon ?"
