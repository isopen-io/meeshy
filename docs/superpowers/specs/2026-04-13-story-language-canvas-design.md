# Story: Per-Element Language, 9:16 Canvas, iPad Support

**Date**: 2026-04-13
**Status**: Approved

## Problem

1. Les stories envoient une seule `originalLanguage` globale, mais un utilisateur peut mixer des langues (texte en anglais + audio en francais). Le backend supporte deja `sourceLanguage` par textObject — iOS ne l'envoie pas.
2. Le canvas viewer/composer n'a pas de ratio fixe — les medias et elements se deforment sur iPad.
3. Des tailles hardcodees (280pt texte, 160pt media, /393 normalisation) cassent sur iPad.

## Design

### 1. sourceLanguage par element

**Modeles SDK** — ajouter `sourceLanguage: String?` a :
- `StoryTextObject` (deja supporte backend PostService.ts:349)
- `StoryAudioPlayerObject` (Whisper transcription pipeline)
- `StoryMediaObject` (future-proofing, pas de pipeline actuel)

**Valeur par defaut a la creation** : detectee depuis le clavier actif (`UITextInputMode.activeInputModes.first?.primaryLanguage`). Meme logique que le composer de messages.

**UI : listing des elements (timeline panel)** :
- Chaque element (texte, audio, media) affiche un badge langue cliquable a cote de son nom/preview
- Format : pill `FR` / `EN` / etc. avec drapeau emoji
- Tap sur le badge → menu contextuel (Menu SwiftUI) avec les langues supportees
- Changer la langue met a jour `element.sourceLanguage`

**Chip langue global du composer** : supprime. Remplace par les badges individuels dans le listing.

**`CreateStoryRequest.originalLanguage`** : reste pour la legende (`content`) de la story. Initialise depuis le clavier. Les elements canvas ont chacun leur `sourceLanguage` dans le JSON `storyEffects`.

### 2. Canvas 9:16 fixe

Contraindre le canvas a un aspect ratio 9/16 sur tous les appareils :

```
let canvasSize: CGSize = {
    let available = geo.size
    let targetRatio: CGFloat = 9.0 / 16.0
    if available.width / available.height < targetRatio {
        return CGSize(width: available.width, height: available.width / targetRatio)
    } else {
        return CGSize(width: available.height * targetRatio, height: available.height)
    }
}()
```

- **iPhone portrait** : canvas = pleine largeur (comportement actuel inchange)
- **iPad** : canvas 9:16 centre, fond noir sur les cotes
- **Composer (`StoryCanvasView`)** : GeometryReader → frame 9:16 centree
- **Viewer (`StoryCanvasReaderView`)** : meme contrainte 9:16
- **`StoryViewerView`** : ZStack noir plein ecran, canvas 9:16 centre dedans

### 3. Tailles proportionnelles (plus de hardcode)

| Hardcode actuel | Remplacement |
|---|---|
| `maxWidth: 280` (texte reader) | `canvasSize.width * 0.75` |
| `baseMediaSize: 160` (foreground media) | `canvasSize.width * 0.4` |
| `/ 393` (SlideMiniPreview font) | `/ canvasSize.width` |

Toutes les tailles deviennent proportionnelles a `canvasSize`, qui est toujours 9:16.

### 4. Background media

Pas de changement fonctionnel. `.scaledToFill()` + `.clipped()` dans le cadre 9:16 garantit que le media remplit le canvas sans distorsion. Le `bgTransform` (scale, offset, rotation) applique par l'utilisateur dans le composer est preserve.

## Fichiers impactes

### SDK (packages/MeeshySDK/)
| Fichier | Changement |
|---|---|
| `Models/StoryModels.swift` | +`sourceLanguage: String?` sur StoryTextObject, StoryMediaObject, StoryAudioPlayerObject |
| `Sources/MeeshyUI/Story/StoryCanvasView.swift` | Contrainte 9:16 via GeometryReader |
| `Sources/MeeshyUI/Story/StoryCanvasReaderView.swift` | Contrainte 9:16 + tailles proportionnelles |
| `Sources/MeeshyUI/Story/DraggableMediaView.swift` | baseMediaSize proportionnel |
| `Sources/MeeshyUI/Story/SlideMiniPreview.swift` | Font normalisee sur largeur reelle |
| `Sources/MeeshyUI/Story/StoryComposerView.swift` | Supprimer chip langue global, passer canvasSize |
| `Sources/MeeshyUI/Story/StoryComposerViewModel.swift` | sourceLanguage auto-detecte sur addText/addMedia/addAudio |

### App (apps/ios/Meeshy/)
| Fichier | Changement |
|---|---|
| `Features/Main/Views/StoryViewerView.swift` | Canvas 9:16 centre dans ZStack noir |
| `Features/Main/Views/StoryViewerContainer.swift` | Passer canvasSize constraint |

### UI listing elements (SDK)
| Fichier | Changement |
|---|---|
| `Sources/MeeshyUI/Story/TimelinePanel.swift` (ou equivalent) | Badge langue par element, menu selection |

## Hors scope

- Pipeline traduction image/video backend
- Mode paysage iPhone
- Langue par sticker/drawing
