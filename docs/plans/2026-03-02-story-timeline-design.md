# Story Timeline Editor — Design Document

## Overview

Refonte complète du TimelinePanel pour en faire un éditeur temporel NLE (Non-Linear Editor) style CapCut/iMovie, optimisé mobile. Permet d'orchestrer visuellement quand et comment chaque élément (texte, vidéo, audio, image) apparaît sur le canvas d'une story.

## Principes

- **Minimal UI** : N'afficher que ce qui est utile à l'instant
- **Direct manipulation** : Drag pour tout — pas de formulaires numériques sauf en popover de précision
- **Performance first** : Extraction video frames en arrière-plan, waveform pré-calculée, pas de freeze UI
- **Thème Meeshy** : Indigo brand, dark/light mode complet

## Architecture

### Composants

1. **TimelinePanel** — Conteneur principal (refonte de l'existant)
   - Transport bar (play/pause, temps courant/total)
   - Time ruler zoomable avec pinch
   - Track lanes scrollables verticalement
   - Playhead draggable
   - Slide duration handle (bord droit)

2. **TimelineTrackBar** — Barre visuelle par élément
   - Vidéo : strip de thumbnails (AVAssetImageGenerator)
   - Audio : mini-waveform depuis waveformSamples
   - Texte : barre colorée + label tronqué
   - Drag bords = ajuster startTime/duration
   - Drag centre = déplacer dans le temps
   - Tap = popover détail (fade, volume, loop)

3. **TrackDetailPopover** — Contrôles de précision
   - Sliders fade-in/fade-out (0–3s)
   - Slider volume (audio/vidéo)
   - Toggle loop
   - Champs numériques startTime/duration

4. **TimelinePlaybackEngine** — Moteur de preview in-place
   - Timer CADisplayLink pour avance du playhead
   - Publie currentTime observé par le canvas
   - Coordonne AVPlayers vidéo et AVAudioPlayers
   - Gère apparition/disparition des éléments texte

5. **VideoFrameExtractor** — Extraction thumbnails
   - Actor Swift pour thread safety
   - Cache LRU en mémoire par objectId
   - Extraction async en background, jamais sur main thread
   - ~1 frame/seconde de vidéo, max 30 frames

## Data Flow

```
User drag bar → TimelineTrack.startTime/duration updated
  → syncTrackToModel() → viewModel.currentEffects mutated
  → Canvas re-renders element positions

Play button → TimelinePlaybackEngine.start()
  → CADisplayLink fires at 60fps → currentTime published
  → Canvas observes: elements with startTime <= currentTime
    AND (startTime + duration) >= currentTime → visible with fade
  → AVPlayers started/paused at correct offsets
  → Playhead position updated

Slide duration drag → slide.duration mutated
  → Time ruler redraws → tracks constrained to new bounds
```

## Performance Strategy

1. **Video frame extraction** : Actor + async, cached, extracted once on track appear
2. **Waveform rendering** : Pre-computed samples (already in model), drawn as Path — no real-time analysis
3. **CADisplayLink** : Native 60fps timer, no Timer.scheduledTimer
4. **Lazy rendering** : Only visible tracks rendered (LazyVStack)
5. **Debounced sync** : Track edits debounce 100ms before writing to viewModel
6. **Frame extraction limit** : Max 1 frame/sec, max 30 frames total per video
7. **Memory** : Video frame cache evicts on memory pressure notification
8. **Main thread** : All heavy work (frame extraction, waveform computation) off main thread

## Theme

| Element | Dark | Light |
|---------|------|-------|
| Panel BG | #0D0B14 | #F5F3FF |
| Track bars video | indigo700 | indigo600@80% |
| Track bars audio | indigo500 | indigo400@80% |
| Track bars text | indigo300 | indigo200@80% |
| Playhead | white + indigo glow | indigo600 |
| Time ruler | indigo400@40% | indigo300@60% |
| Drag handles | white circles | indigo700 circles |
| Popover | #13111C + blur | #FFFFFF + blur |

## Slide Duration

- Default: 5s
- Range: 2s – 30s
- Drag right edge of time ruler to adjust
- Auto-extends if element exceeds current duration
- Syncs to `viewModel.currentSlide.duration`

## Files

### New
- `TimelinePlaybackEngine.swift` — Preview playback coordination
- `VideoFrameExtractor.swift` — Async video thumbnail extraction
- `TrackDetailPopover.swift` — Fade/volume/loop popover

### Rewrite
- `TimelinePanel.swift` — Complete rewrite as NLE editor
- `TimelineTrackView.swift` — Rewrite as drag-resizable track bars

### Modify
- `StoryComposerViewModel.swift` — Add playback state, zoom, duration editing
- `StoryCanvasView.swift` — Observe playback time for element visibility
- `StoryComposerView.swift` — Wire new timeline playback
