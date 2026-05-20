# Image Editor — Architecture Technique

Éditeur d'image unifié iOS (`MeeshyUI`). Une seule vue immersive remplace
l'ancien flux fragmenté en deux étapes (preview « use » + éditeur à onglets).
Utilisé partout : profil, posts, stories, messages, communautés, avatars,
bannières.

## Périmètre

L'éditeur **édite une image existante** — ce n'est pas un outil de création.
Il prend une `UIImage`, applique des transformations non-destructives, et
retourne une `UIImage` finale via `onAccept`.

## Couches (séparation stricte UI / rendering / processing)

| Couche | Fichier | Rôle |
|--------|---------|------|
| Modèle | `Media/ImageEditorModel.swift` | `ImageEditState`, `ImageAdjustments`, `AdjustmentKind`, `ImageEditorMode` — value types purs, `Codable`/`Sendable` |
| Historique | `Media/ImageEditHistory.swift` | Undo/redo snapshot-based (curseur + tableau, façon `CommandStack`) |
| Rendering | `Media/ImageFilterEngine.swift` | Renderer GPU sans état : `(UIImage, ImageEditState) → UIImage` |
| État/loop | `Media/ImageEditorViewModel.swift` | `@MainActor ObservableObject` — état, historique, boucle de rendu débounce |
| UI | `Media/MeeshyImageEditorView.swift` | Vue SwiftUI présentation-only |
| Switcher | `Media/ImageEditorModeSwitcher.swift` | Toggle Simple/Pro (style timeline Story) |

## Pipeline non-destructif

```
original (UIImage, jamais mutée)
   │
   ├─ working = downscale(original, ≤2400px)   ← copie légère pour preview
   │
ImageEditState ──► ImageFilterEngine.render():
   orientation/flips → crop → filtre → ajustements → effet
   │
   ├─ preview : render(working, state)   débounce 90ms, cancelable
   └─ export  : render(original, state)  plein résolution, une seule fois
```

- L'image originale n'est **jamais** copiée ni mutée.
- `ImageEditState` est un value type ~100 octets : un historique complet de
  snapshots ne coûte presque rien et le rendu est rejouable à toute résolution.
- L'historique est *session-scoped* : détenu par le ViewModel, détruit à la
  fermeture (export ou abandon).

## Modes Simple / Pro

Toggle animé en haut de l'écran, style identique au switcher de la timeline
Story (`TimelineModeSwitcher`). Le mode est persisté (`UserDefaults`).

- **Simple** : outils essentiels — recadrage, filtres principaux, 3 ajustements
  (luminosité/contraste/saturation).
- **Pro** : tous les outils — 5 ratios + flips, 12 filtres, 9 ajustements,
  effets créatifs.

La granularité est portée par les drapeaux `isEssential` sur `EditorTool`,
`ImageFilter` et `AdjustmentKind` — ajouter un mode n'exige aucun changement
de layout.

## Chrome (pattern Story composer)

Canvas plein écran + contrôles flottants :

- **Barre supérieure** flottante : annuler · switcher Simple/Pro · Terminé.
- **FABs outils** (bas-gauche) : un FAB verre par outil. Masqués quand un
  controller est ouvert.
- **FABs historique** (bas-droite) : undo · redo · historique.
- **Controller** : panneau verre flottant glissant du bas pour l'outil actif
  (handle de glissement, sélecteur d'outils, undo/redo, fermeture).

## Gestes

`pinch-to-zoom`, `pan` (quand zoomé), `double-tap` reset, `hold` pour la
comparaison avant/après. Le recadrage a ses propres poignées (coins + arêtes).
Le zoom/pan est purement *inspection* — jamais cuit dans l'image.

## Robustesse

- Toutes les opérations CoreGraphics/CoreImage sont gardées (dimensions
  validées, `guard` sur `cgImage`, intersection de rects).
- Rendu débounce + cancelable (`Task` annulable) — pas de blocage UI.
- Le crop n'est cuit dans l'état que si l'utilisateur a réellement manipulé
  le cadre (`cropDirty`) — ouvrir/fermer l'outil est un vrai no-op.
- `ThemeManager` : support complet dark/light, safe areas respectées.

## Tests

`packages/MeeshySDK/Tests/MeeshyUITests/Media/` :

- `ImageEditorModelTests` — état, transformations géométriques, Codable.
- `ImageEditHistoryTests` — undo/redo, troncature de branche, jump.
- `ImageFilterEngineTests` — downscale, dimensions après orientation/crop.
- `ImageEditorViewModelTests` — édition, historique, mode, export.

## Extensibilité (passes futures)

L'architecture est prête pour les outils additionnels du brief, non inclus
dans cette passe :

- Dessin/annotation (PencilKit), texte, stickers — calques non-destructifs
  additifs ; `ImageEditState` recevrait un champ `layers: [EditorLayer]`.
- Suppression d'arrière-plan (Vision `VNGenerateForegroundInstanceMaskRequest`).
- Correction de perspective (`CIPerspectiveCorrection`), blend modes.
- Effets IA.

Chaque outil futur s'ajoute comme un `EditorTool` + un champ d'état + une étape
de pipeline, sans toucher au chrome.

> i18n : tout média porteur d'une langue (OCR, texte image) devra utiliser la
> liste de langues officiellement supportée par l'app — jamais une liste locale.
