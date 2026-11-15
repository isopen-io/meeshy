## 2026-05: Story Canvas — Cartographie GPU/Metal (NE PAS SUPPRIMER)

**Statut**: Reference document — règle de préservation

**Contexte**: Lors de l'audit 2026-05-11 plusieurs composants story-canvas étaient orphelins (0 référence production). Risque de suppression accidentelle d'optimisations Metal pendant cleanup. Spec mère D-6 (`docs/superpowers/specs/2026-05-08-story-canvas-fidelity-design.md`) précise les 4 hot paths GPU.

**Inventaire Metal/GPU dans `Story/Canvas/`** :

| Composant | Optimisation | Wiré ? | Règle |
|---|---|---|---|
| `Metal/StoryFilters.metal` + `Layers/StoryFilteredLayer.swift` | Custom Metal compute kernels (vintageFilter, bwContrastFilter) via CAMetalLayer | ✅ | KEEP — filter pipeline production |
| `StoryBlurFilter.swift` | **MPSImageGaussianBlur** (Metal Performance Shaders, GPU) — 3× plus rapide que `CIGaussianBlur` | ❌ Orphelin actuellement | **🚨 NE PAS SUPPRIMER** — réservé glass UI / sticker glow (Phase 3 Task 3.2 spec). Wiring quand le modèle exposera `backgroundStyle: .glass` ou `glowRadius: Float`. |
| `StoryMediaDecoder.swift` | VideoToolbox HW decode + MetalKit textures | ✅ Via `StoryMediaLoader` | KEEP — production |
| `StoryRenderingContext.swift` | Singleton Metal device + command queue partagés | ✅ Partout | KEEP — fondamentale |
| `StoryRendererCache.swift` (B3) | Cache CALayer (GPU via Core Animation render server) entre frames d'export | ✅ `StoryAVCompositor` | KEEP — Plan B production |
| `StoryAVCompositor.swift` (Phase 4) | Custom `AVVideoCompositing` → render direct CALayer dans CVPixelBuffer | ❌ Pipeline export pas consommé par `StoryPublishService` actuellement | KEEP — feature post-launch (video story exports) |

**Composants supprimés 2026-05-11** (commit `a1b58da8`) : `StoryComposerVC`, `StoryViewerVC`, `StoryComposerRepresentable`, `StoryModelMigration`. **AUCUN Metal/GPU**. C'étaient des wrappers UIKit/SwiftUI dev-time autour de `StoryCanvasUIView` qui n'ont jamais été branchés. La voie active est `StoryComposerCanvasView` (UIViewRepresentable direct sur `StoryCanvasUIView`).

**Decision/règle** : Avant tout cleanup d'orphelin dans `Story/Canvas/`, vérifier :
1. Le fichier importe-t-il `Metal` / `MetalKit` / `MetalPerformanceShaders` / `VideoToolbox` ? Si oui → préserver, ouvrir une issue "wire X feature".
2. Sinon → safe à supprimer.

**Alternatives rejetées** : Suppression aveugle des orphans aurait perdu `StoryBlurFilter` (39L) qui réutilise l'infrastructure Metal partagée et est pré-câblé pour des features glass UI futures.

**Cons** : Carry-over de ~40L de code non-wiré. Acceptable — coût de maintenance < coût de re-implémenter l'optimisation Metal.
