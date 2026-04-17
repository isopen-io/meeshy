# Story Toolbar Unification — FOND/FRONT → CONTENU/EFFETS

**Date:** 2026-04-17
**Status:** Approved

## Problem

The story composer toolbar still shows a FOND/FRONT toggle even though the rendering engine was unified in `c85200ae` (all media in a single layer, position-based placement). The UI no longer matches the architecture. Users see two tabs that make an artificial distinction the system no longer enforces.

## Design

Replace the FOND/FRONT segmented toggle with a CONTENU/EFFETS toggle. Both tabs use the same pill pattern for sub-tools.

### Tab CONTENU — Unified creative tools

```
┌──────────────────────────────────────┐
│       [ CONTENU  |  EFFETS ]         │
│                                      │
│  📷Photo  ✏️Dessin  Aa Texte  🎵Audio │
└──────────────────────────────────────┘
```

| Pill | Tool mode | Behavior |
|------|-----------|----------|
| Photo | `.photo` | Opens photo/video picker. Smart placement: 1st media fills canvas as background, subsequent media positioned at center with preserved aspect ratio |
| Dessin | `.drawing` | PencilKit drawing overlay (unchanged) |
| Texte | `.text` | Add text object (unchanged) |
| Audio | `.audio` | Add audio object (unchanged) |

Background color selector (palette dots) remains accessible when no tool is active — no dedicated pill needed.

Badge counts on pills:
- Photo: total media count
- Dessin: 1 if drawing exists, 0 otherwise
- Texte: text object count
- Audio: audio object count

### Tab EFFETS — Filters + Timeline

```
┌──────────────────────────────────────┐
│       [ CONTENU  |  EFFETS ]         │
│                                      │
│  🎬Filtres  ⏱️Timeline              │
│                                      │
│  ┌──────────────────────────────┐    │
│  │  Active pill content below   │    │
│  └──────────────────────────────┘    │
└──────────────────────────────────────┘
```

| Pill | Tool mode | Content |
|------|-----------|---------|
| Filtres | `.filters` | Horizontal scroll of slide thumbnails with CIFilter applied. Tap to select. Slider below for intensity (0-100%). Filters applied to entire slide render. |
| Timeline | `.timeline` | Existing SimpleTimelineView/TimelinePanel — fade in/out per element, duration adjustment, mechanical extension of story duration |

### Available CIFilters

Use native `CIFilter` for zero-dependency implementation:

| Name | CIFilter | Description |
|------|----------|-------------|
| Original | (none) | No filter |
| Vivid | CIColorControls (saturation: 1.5) | Boosted saturation |
| B&W | CIPhotoEffectMono | Monochrome |
| Warm | CITemperatureAndTint (warm shift) | Warm tones |
| Cool | CITemperatureAndTint (cool shift) | Cool tones |
| Vintage | CIPhotoEffectTransfer | Retro look |
| Fade | CIPhotoEffectFade | Washed out |
| Chrome | CIPhotoEffectChrome | High contrast chrome |

Intensity slider controls blend between original and filtered image (0% = original, 100% = full filter).

## Data Model Changes

### StoryEffects (StoryModels.swift)

Add two optional fields:

```swift
var filterName: String?       // CIFilter name, nil = no filter
var filterIntensity: Double?  // 0.0-1.0, nil = 1.0 default
```

These are persisted with the story and applied on read in StoryCanvasReaderView.

### StoryToolMode / StoryToolGroup replacements

```swift
enum StoryTab: String {
    case contenu, effets
}

enum StoryToolMode: String, CaseIterable {
    // Contenu
    case photo      // replaces bgMedia + media
    case drawing
    case text
    case audio
    // Effets
    case filters
    case timeline
    
    var tab: StoryTab {
        switch self {
        case .photo, .drawing, .text, .audio: return .contenu
        case .filters, .timeline: return .effets
        }
    }
}
```

`StoryToolGroup` is deleted entirely.

### StoryComposerViewModel

- Replace `isFondToolActive` / `isFrontToolActive` with a single `isEditingContent: Bool` (true when any contenu tool is active)
- Add `selectedFilter: String?` and `filterIntensity: Double` (default 1.0)
- The `addMedia()` method already uses position-in-list for smart placement (from c85200ae) — no change needed

## File Changes

| File | Action |
|------|--------|
| `StoryComposerViewModel.swift` | Replace `StoryToolGroup` with `StoryTab`. Merge bgMedia+media into `.photo`. Add `.filters`/`.timeline` modes. Add `selectedFilter`/`filterIntensity`. Remove `isFondToolActive`/`isFrontToolActive`. |
| `ContextualToolbar.swift` | Rewrite: CONTENU/EFFETS toggle, unified pills for contenu, filters grid + timeline for effets |
| `StoryCanvasView.swift` | Replace `isFondToolActive`/`isFrontToolActive` refs with single editing state |
| `StoryModels.swift` | Add `filterName`/`filterIntensity` to StoryEffects |
| `StoryCanvasReaderView.swift` | Apply CIFilter to slide render when `filterName` is set |
| `StorySlideRenderer.swift` | Apply filter to thumbHash composite render |
| `StoryComposerView.swift` | Update refs from `.bgMedia`/`.media` to `.photo`, adapt picker callbacks |

## Out of Scope

- Custom/user-created filters
- Per-element filters (filters are slide-global)
- Changes to publish/upload pipeline
- Audio ambiance (stays disabled)
- Slide selector / multi-slide management (unchanged)
