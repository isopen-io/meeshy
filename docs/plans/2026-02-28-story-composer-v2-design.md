# Story Composer V2 — Design Document

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create the implementation plan.

**Goal:** Transformer le StoryComposer en éditeur de stories complet : multi-texte canvas-natif, phase d'édition média (image + vidéo mute), fix bugs critiques, UX épurée.

**Architecture:** Approche A — canvas-native. Nouveau type `StoryTextObject` dans le SDK. Canvas reçoit un tableau de textes plutôt qu'un texte unique. L'édition se fait directement sur le canvas (overlay keyboard flottant), pas dans un panel inférieur.

**Tech Stack:** SwiftUI, PencilKit, AVKit, PhotosUI, MeeshySDK (dual-target)

---

## Scope des changements

### 1. Bug critique — Isolation des slides

**Problème :** `selectSlide(at:)` change `currentSlideIndex` mais ne restaure pas les `@State` de la vue (text, selectedImage, stickerObjects, drawingData, etc.). Résultat : un nouveau slide hérite visuellement du contenu du slide précédent.

**Fix :** Ajouter `loadSlide(from: StorySlide)` dans `StoryComposerView` qui recharge tous les états depuis les effets du slide cible. Appelé dans `slideThumb` handler après `saveCurrentSlide()`.

```swift
private func saveCurrentSlide() { /* sauvegarde text + buildEffects() */ }
private func loadSlide(from slide: StorySlide) {
    text = slide.content ?? ""
    textObjects = slide.effects.textObjects ?? []
    stickerObjects = slide.effects.stickerObjects ?? []
    selectedFilter = slide.effects.parsedFilter
    drawingData = slide.effects.drawingData
    // backgroundColor from effects.background
    selectedImage = slideManager.slideImages[slide.id]
    openingEffect = slide.effects.opening
    closingEffect = slide.effects.closing
}
```

### 2. Modèle `StoryTextObject` (SDK)

Nouveau type dans `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` :

```swift
public struct StoryTextObject: Codable, Identifiable, Sendable {
    public var id: String
    public var content: String
    public var x: CGFloat        // normalisé 0–1
    public var y: CGFloat        // normalisé 0–1
    public var style: StoryTextStyle
    public var colorHex: String  // ex: "FFFFFF"
    public var size: CGFloat
    public var align: String     // "left"|"center"|"right"
    public var bgEnabled: Bool
    public var rotation: CGFloat
}
```

`StoryEffects` reçoit `textObjects: [StoryTextObject]?`. Le champ `content` dans `StorySlide` est conservé pour rétrocompatibilité.

### 3. Multi-texte canvas-natif

**Principe :** Tap "Aa" → nouveau `StoryTextObject` centré, `editingTextId = id` → overlay flottant avec `TextField` + styling inline → tap ailleurs → dismiss clavier, texte déposé sur canvas, draggable.

- **`StoryCanvasView`** : supprime bindings texte unique → reçoit `textObjects: Binding<[StoryTextObject]>` + `editingTextId: Binding<String?>`. Chaque texte = `DraggableTextView` (pattern des stickers).
- **`DraggableTextView`** : drag, scale (pinch), rotation. Double-tap → bouton ✕. Tap simple → active l'édition (`editingTextId = id`).
- **`StoryCanvasTextOverlay`** : view modale légère sur le canvas quand `editingTextId != nil`. Contient : TextField transparent + contrôles de style (sous le clavier ou au-dessus).
- Suppression du panel `.text` dans `activeToolPanel` → bouton "Aa" appelle `addNewText()` directement.

### 4. Phase d'édition média

**Image :** `loadPhoto(from:)` → charge l'image en mémoire → publie `showImageEdit = true` → `ImageEditView` en `.fullScreenCover` → `onAccept { editedImage in selectedImage = editedImage }`. L'image n'arrive **jamais** dans le canvas sans passer par l'éditeur.

**Vidéo :** Étendre `.photosPicker` pour inclure `.mpeg4Movie`, `.video`. Si item est une vidéo → exporter vers fichier temp → `selectedVideoURL` → `.fullScreenCover` avec `VideoPreviewView` amélioré. `VideoPreviewView` reçoit un `@State isMuted` et expose `onAccept(isMuted: Bool)`.

Canvas : `StoryCanvasView` supporte `selectedVideoURL: URL?` avec `AVPlayer` en boucle, overlay des autres layers par-dessus.

### 5. Corrections UX / Design

| Problème | Solution |
|---------|----------|
| Bouton Publier ("Publi\ner") | Remplacé par `Image(systemName: "paperplane.fill").rotationEffect(.degrees(45))` — icône seule sans texte |
| Drawing panel déborde | `DrawingToolbarPanel` redessiné : slider ligne 1, `ScrollView(.horizontal)` pour outils+couleurs ligne 2, undo/clear toujours visibles à droite |
| Bouton "Done" dans texte | Supprimé. Dismiss : tap sur le canvas (en dehors du texte actif) ou changement d'outil |
| Texte trop large | L'éditeur texte est inline sur le canvas, plus de panel panel largeur-écran |
| Accessibilité icônes | `.accessibilityLabel()` sur tous les boutons icône-only |

### 6. VideoPreviewView — mute toggle

```swift
@State private var isMuted = false
// AVPlayer.isMuted = isMuted
// Bouton toggle dans l'overlay:
Button { isMuted.toggle() } label: {
    Image(systemName: isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
}
// onAccept(isMuted: Bool) → StorySlide.effects.videoIsMuted = isMuted
```

### 7. `StoryCanvasReaderView` — lecture textes multiples

Adapter pour rendre `textObjects` en plus du `content` legacy. Priorité à `textObjects` si non-vide.

---

## Fichiers touchés

| Fichier | Changement |
|---------|-----------|
| `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` | +`StoryTextObject`, +`textObjects` dans `StoryEffects` |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift` | Refonte multi-texte, fix slides, publish icon, media edit flow |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasView.swift` | Multi-texte bindings, support vidéo AVPlayer |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift` | Lecture textObjects |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/DrawingOverlayView.swift` | Fix DrawingToolbarPanel layout |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryTextEditorView.swift` | Remplacé par `StoryCanvasTextOverlay` (canvas-natif) |
| `apps/ios/Meeshy/Features/Main/Components/VideoPreviewView.swift` | +mute toggle |

---

## Tests UI/UX à valider

1. Créer un slide → ajouter image → `ImageEditView` s'ouvre → éditer → insérer ✅
2. Créer un slide → ajouter vidéo → `VideoPreviewView` s'ouvre → toggle mute → insérer ✅
3. Tap "Aa" → nouveau texte sur canvas → clavier → taper → tap ailleurs → texte placé, draggable ✅
4. Tap sur texte existant → clavier réapparaît avec le texte → modifier ✅
5. Double-tap texte → ✕ → supprimé ✅
6. Placer 3 textes → chacun indépendant ✅
7. Créer slide 1 avec image+texte → créer slide 2 → canvas vide ✅
8. Revenir sur slide 1 → image+texte présents ✅
9. Outil Dessin → panneau ne déborde pas → slider + outils + couleurs tous visibles/scrollables ✅
10. Bouton Publier = icône avion inclinée, une seule ligne ✅
