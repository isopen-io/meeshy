# Story timeline — calage (seek) vidéo sur le playhead (reader + preview)

Branche : `claude/story-timeline-video-playhead-seek` (depuis main post-#920).
Scope : **story reader** + **story preview** (les deux passent par `StoryReaderRepresentable` → `StoryCanvasUIView` en `.play`). Pas le composer `.edit`.

## Contexte plein écran (analyse)
- Plein écran = bascule **visuelle** (`StoryCanvasFraming` `.carded`↔`.free`, cornerRadius 22→0). Ne pause PAS la lecture.
- Long-press 200 ms = pause (`isLongPressPaused` → `.storyPlayerPause` → `setStoryPlaybackPaused(true)`) + toggle chrome. Playhead + médias gèlent EN PLACE.
- ⇒ Le seek NE DOIT PAS se déclencher sur une bascule plein écran ni sur un resume en place (médias déjà alignés). Garde de dérive obligatoire.

## Problème (brique manquante)
Les players vidéo (bg + fg) jouent depuis leur frame 0 ; aucun `seek(to: playhead − startTime)`. Désync si :
1. Vidéo fg arrive en retard (réseau) après son `startTime` → démarre à 0, en retard sur playhead/audio.
2. Ouverture/scrub à `currentTime > 0` → image non calée (seul l'audio back-date son origine).

## Plan
1. **StoryMediaLayer** (fg) : `slidePlayheadSeconds` (set par canvas) + `seekAlignedThenPlay()` (target = max(0, playhead − startTime), seek garde-dérive >300 ms, puis play). `attachPlayer` (.play) + `isPlaybackActive` didSet l'utilisent.
2. **StoryBackgroundLayer** (bg) : même `slidePlayheadSeconds` + seek aligné, avec modulo sur la durée de clip si looping (sinon skip défensif). Garde-dérive identique.
3. **StoryCanvasUIView** : propager `currentTime.seconds` aux layers (passe `forEachMediaLayer` du rebuild + bg) AVANT de lever les gates, pour qu'un player qui démarre/arrive tard se cale.
4. **computedTotalDuration** : étendre pour couvrir la fenêtre fg la plus longue (`startTime + duration`).
5. Tests : seek fg sur arrivée tardive ; pas de seek si dérive ~0 (resume en place) ; durée étendue par fenêtre fg.

## Invariants à préserver
- Pas de seek par frame (combat la lecture).
- Pas de seek sur bascule plein écran ni resume en place (garde-dérive).
- Démarrage synchronisé bg/fg/audio (#920) intact.
- Anti-gel bg #915 intact.

## Résultat (implémenté)
- ✅ `StoryMediaLayer` : `slidePlayheadSeconds` + `alignToTimelineThenPlay()` (seek garde-dérive 300 ms) ; `attachPlayer`/`isPlaybackActive` câblés.
- ✅ `StoryBackgroundLayer` : idem, seek **uniquement fond NON loopé** (un fond loopé remplit le slide, phase sans sens → pas de recalage / pas de saut).
- ✅ `StoryCanvasUIView` : `slidePlayheadSeconds` propagé au rebuild + `pushSlidePlayheadToLayers()` au GO et au resume.
- ✅ `computedTotalDuration` : fenêtre fg `startTime + duration` (au lieu de `duration` seule).
- ✅ Tests : durée étendue par fenêtre fg ; démarrage gardé OK avec playhead avancé ; défauts.
- ⚠️ Build Xcode non lançable (Linux) — revue manuelle + parité avec patterns testés CI.
