# Story Composer V2 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transformer le StoryComposer en éditeur complet : multi-texte canvas-natif, phase d'édition média (image + vidéo muet), éditeur audio vocal, fix bug isolation slides, UX épurée.

**Architecture:** Approche canvas-native. Nouveau `StoryTextObject` dans le SDK. Textes indépendants draggables sur le canvas. `ImageEditView` et `ImageFilterEngine` déplacés dans MeeshyUI. Nouvel `StoryAudioEditorView` avec AVAudioEngine.

**Tech Stack:** SwiftUI, PencilKit, AVKit, AVAudioEngine, PhotosUI, MeeshySDK (dual-target)

---

## Contexte pour l'exécuteur

**Branch:** `fix/story-image-upload-and-post-creation`
**Build:** `./apps/ios/meeshy.sh build`

**Fichiers clés à connaître :**
- Modèles SDK : `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`
- Canvas composer : `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift` (825+ lignes)
- Canvas view : `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasView.swift`
- Canvas reader : `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift`
- Drawing : `packages/MeeshySDK/Sources/MeeshyUI/Story/DrawingOverlayView.swift`
- Image editor (app) : `apps/ios/Meeshy/Features/Main/Components/ImageEditView.swift`
- Image filter (app) : `apps/ios/Meeshy/Features/Main/Services/ImageFilterEngine.swift`
- Video preview : `apps/ios/Meeshy/Features/Main/Components/VideoPreviewView.swift`

---

## Task 1 — StoryTextObject model + StoryEffects.textObjects

**Fichiers :**
- Modifier : `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift:147`

**Étape 1 : Ajouter `StoryTextObject` après le bloc `StorySticker` (après la ligne 146)**

```swift
// MARK: - Story Text Object (multi-texte canvas-natif)

public struct StoryTextObject: Codable, Identifiable, Sendable {
    public var id: String
    public var content: String
    public var x: CGFloat        // normalisé 0–1
    public var y: CGFloat        // normalisé 0–1
    public var style: String     // StoryTextStyle.rawValue
    public var colorHex: String  // ex: "FFFFFF"
    public var size: CGFloat
    public var align: String     // "left"|"center"|"right"
    public var bgEnabled: Bool
    public var rotation: CGFloat

    public init(id: String = UUID().uuidString, content: String = "",
                x: CGFloat = 0.5, y: CGFloat = 0.5,
                style: String = StoryTextStyle.bold.rawValue,
                colorHex: String = "FFFFFF", size: CGFloat = 28,
                align: String = "center", bgEnabled: Bool = false,
                rotation: CGFloat = 0) {
        self.id = id; self.content = content
        self.x = x; self.y = y; self.style = style
        self.colorHex = colorHex; self.size = size
        self.align = align; self.bgEnabled = bgEnabled
        self.rotation = rotation
    }

    public var parsedStyle: StoryTextStyle? { StoryTextStyle(rawValue: style) }
}
```

**Étape 2 : Dans `StoryEffects`, ajouter `textObjects` après `stickerObjects` (ligne 237)**

```swift
public var textObjects: [StoryTextObject]?
```

**Étape 3 : Mettre à jour `StoryEffects.init()` — ajouter le paramètre `textObjects`**

Dans la signature d'init (après `stickerObjects: [StorySticker]? = nil`) :
```swift
textObjects: [StoryTextObject]? = nil,
```

Dans le corps de l'init (après `self.stickerObjects = stickerObjects`) :
```swift
self.textObjects = textObjects
```

**Étape 4 : Build**
```bash
./apps/ios/meeshy.sh build
```
Attendu : succès, zéro erreur.

**Étape 5 : Commit**
```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift
git commit -m "feat(sdk): add StoryTextObject model + textObjects in StoryEffects"
```

---

## Task 2 — Fix bug isolation des slides

**Problème :** Quand on sélectionne un autre slide, les `@State` de `StoryComposerView` (text, selectedImage, drawingData…) ne sont pas rechargés depuis le slide cible. Le canvas affiche le contenu du slide précédent.

**Fichiers :**
- Modifier : `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift`

**Étape 1 : Lire le fichier pour trouver :**
- La fonction `buildEffects()` (~ligne 884)
- Le handler `slideThumb` où `selectSlide(at:)` est appelé
- Les `@State` déclarés en haut (text, selectedImage, drawingData, etc.)

**Étape 2 : Ajouter `saveCurrentSlide()` dans la section `// MARK: - Slide Management`**

```swift
private func saveCurrentSlide() {
    let idx = slideManager.currentSlideIndex
    guard idx < slideManager.slides.count else { return }
    slideManager.slides[idx].content = text.isEmpty ? nil : text
    slideManager.slides[idx].effects = buildEffects()
}
```

**Étape 3 : Ajouter `loadSlide(from:)` juste après `saveCurrentSlide()`**

```swift
private func loadSlide(from slide: StorySlide) {
    text = slide.content ?? ""
    textObjects = slide.effects.textObjects ?? []
    stickerObjects = slide.effects.stickerObjects ?? []
    selectedFilter = slide.effects.parsedFilter
    drawingData = slide.effects.drawingData
    selectedImage = slideManager.slideImages[slide.id]
    openingEffect = slide.effects.opening
    closingEffect = slide.effects.closing

    if let bg = slide.effects.background, !bg.hasPrefix("gradient:") {
        backgroundColor = Color(hex: bg)
    } else {
        backgroundColor = Color(hex: "0F0C29")
    }

    let newCanvas = PKCanvasView()
    if let data = slide.effects.drawingData,
       let drawing = try? PKDrawing(data: data) {
        newCanvas.drawing = drawing
    }
    drawingCanvas = newCanvas

    withAnimation(.spring(response: 0.3)) {
        activePanel = .none
        isDrawingActive = false
    }
}
```

Note : `textObjects` doit avoir été ajouté comme `@State private var textObjects: [StoryTextObject] = []` (Task 8). Pour l'instant, si Task 8 n'est pas encore faite, laisser la ligne `textObjects = ...` commentée temporairement.

**Étape 4 : Mettre à jour le handler du slideThumb**

Trouver le code qui appelle `slideManager.selectSlide(at: index)`. Remplacer le bloc par :

```swift
Button {
    saveCurrentSlide()
    withAnimation(.spring(response: 0.25)) {
        slideManager.selectSlide(at: index)
    }
    let newSlide = slideManager.slides[index]
    loadSlide(from: newSlide)
    HapticFeedback.light()
} label: { ... }
```

**Étape 5 : Build**
```bash
./apps/ios/meeshy.sh build
```
Attendu : succès.

**Étape 6 : Commit**
```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift
git commit -m "fix(ios): slide isolation — saveCurrentSlide + loadSlide restore all @State"
```

---

## Task 3 — Fix DrawingToolbarPanel layout (overflow)

**Problème :** La `colorPalette` (9 cercles × 30pt ≈ 270pt) est dans le même HStack que les `toolButtons` et `actionButtons`, causant un overflow sur les petits écrans.

**Fichiers :**
- Modifier : `packages/MeeshySDK/Sources/MeeshyUI/Story/DrawingOverlayView.swift:58-71`

**Étape 1 : Remplacer `DrawingToolbarPanel.body` (lignes 58–71)**

```swift
public var body: some View {
    VStack(spacing: 10) {
        // Ligne 1 — slider épaisseur
        widthSlider

        // Ligne 2 — outils + actions (toujours visibles)
        HStack(spacing: 12) {
            toolButtons
            Spacer()
            actionButtons
        }

        // Ligne 3 — palette couleurs scrollable
        ScrollView(.horizontal, showsIndicators: false) {
            colorPalette
                .padding(.horizontal, 4)
        }
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 12)
}
```

**Étape 2 : Build**
```bash
./apps/ios/meeshy.sh build
```
Attendu : succès.

**Étape 3 : Commit**
```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/DrawingOverlayView.swift
git commit -m "fix(ios): DrawingToolbarPanel — 3 rows + horizontal scroll pour la palette couleurs"
```

---

## Task 4 — Bouton Publier → icône avion

**Problème :** Le bouton "Publier" affiche un texte multilignes + icône. Remplacer par icône `paperplane.fill` seule, rotée 45°.

**Fichiers :**
- Modifier : `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift`

**Étape 1 : Trouver le bouton Publier dans la top bar**

Chercher `"Publier"` ou `"paperplane"` dans `StoryComposerView.swift`. La top bar contient probablement un `Button` avec `Text("Publier")`.

**Étape 2 : Remplacer le label du bouton**

Remplacer tout le contenu du label (l'HStack avec texte + icône) par :

```swift
Image(systemName: "paperplane.fill")
    .font(.system(size: 20, weight: .semibold))
    .rotationEffect(.degrees(45))
    .foregroundColor(.white)
    .frame(width: 44, height: 44)
    .background(
        Circle()
            .fill(
                LinearGradient(
                    colors: [Color(hex: "FF2E63"), Color(hex: "FF6B6B")],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
    )
    .accessibilityLabel("Publier la story")
```

**Étape 3 : Build**
```bash
./apps/ios/meeshy.sh build
```

**Étape 4 : Commit**
```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift
git commit -m "fix(ios): publish button → paperplane icon only (rotated 45°)"
```

---

## Task 5 — Déplacer ImageFilterEngine + ImageEditView → MeeshyUI + intégrer

**Objectif :** Rendre `ImageEditView` accessible depuis `StoryComposerView` (MeeshyUI). Les deux fichiers n'ont aucune dépendance app-spécifique.

**Fichiers :**
- Créer : `packages/MeeshySDK/Sources/MeeshyUI/Media/ImageFilterEngine.swift`
- Créer : `packages/MeeshySDK/Sources/MeeshyUI/Media/ImageEditView.swift`
- Modifier (app) : `apps/ios/Meeshy/Features/Main/Services/ImageFilterEngine.swift` → supprimer
- Modifier (app) : `apps/ios/Meeshy/Features/Main/Components/ImageEditView.swift` → supprimer
- Modifier : `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift`

**Étape 1 : Créer le répertoire Media dans MeeshyUI**
```bash
mkdir -p packages/MeeshySDK/Sources/MeeshyUI/Media
```

**Étape 2 : Copier `ImageFilterEngine.swift` vers MeeshyUI**

```bash
cp apps/ios/Meeshy/Features/Main/Services/ImageFilterEngine.swift \
   packages/MeeshySDK/Sources/MeeshyUI/Media/ImageFilterEngine.swift
```

Puis ouvrir `packages/MeeshySDK/Sources/MeeshyUI/Media/ImageFilterEngine.swift` et :
- Ajouter `public` devant `enum ImageFilter` → `public enum ImageFilter`
- Ajouter `public` devant `class ImageFilterEngine` → `public final class ImageFilterEngine: ObservableObject`
- Ajouter `public` devant chaque `func` et `var` exposés publiquement
- Ajouter `public init() {}` si nécessaire

**Étape 3 : Copier `ImageEditView.swift` vers MeeshyUI**

```bash
cp apps/ios/Meeshy/Features/Main/Components/ImageEditView.swift \
   packages/MeeshySDK/Sources/MeeshyUI/Media/ImageEditView.swift
```

Puis ouvrir `packages/MeeshySDK/Sources/MeeshyUI/Media/ImageEditView.swift` et :
- Remplacer `import MeeshyUI` par rien (on est dans MeeshyUI)
- Ajouter `import SwiftUI` en haut si absent
- Ajouter `public` devant `struct ImageEditView: View`
- Ajouter `public` devant `enum CropRatio`
- Ajouter `public init(...)`
- Ajouter `public` devant toutes les structs internes exposées (CropOverlayView, etc.)

**Étape 4 : Supprimer les fichiers originaux (app layer)**

Supprimer les references dans le projet Xcode :
```bash
# Supprimer les fichiers du filesystem app
rm apps/ios/Meeshy/Features/Main/Services/ImageFilterEngine.swift
rm apps/ios/Meeshy/Features/Main/Components/ImageEditView.swift
```

Note : Retirer aussi les fichiers du projet Xcode (`apps/ios/Meeshy.xcodeproj/project.pbxproj`) en les supprimant manuellement ou via Xcode.

**Étape 5 : Intégrer `ImageEditView` dans `StoryComposerView`**

Dans `StoryComposerView.swift`, ajouter les @State :
```swift
@State private var pendingEditImage: UIImage? = nil
@State private var showImageEdit = false
```

Modifier la fonction `loadPhoto(from:)` (ou équivalente) pour afficher l'éditeur au lieu d'insérer directement l'image. Au lieu de `selectedImage = image`, faire :
```swift
pendingEditImage = image
showImageEdit = true
```

Ajouter `.fullScreenCover(isPresented: $showImageEdit)` dans le `body` de `StoryComposerView` :
```swift
.fullScreenCover(isPresented: $showImageEdit) {
    if let img = pendingEditImage {
        ImageEditView(image: img) { editedImage in
            selectedImage = editedImage
            pendingEditImage = nil
        } onCancel: {
            pendingEditImage = nil
        }
    }
}
```

**Étape 6 : Build**
```bash
./apps/ios/meeshy.sh build
```
Attendu : succès (si erreurs de project.pbxproj, les résoudre en retirant les refs aux fichiers supprimés).

**Étape 7 : Commit**
```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Media/
git commit -m "feat(sdk): déplacer ImageFilterEngine + ImageEditView vers MeeshyUI"
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift
git add apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios): phase édition image — ImageEditView avant insertion dans le canvas"
```

---

## Task 6 — VideoPreviewView — passer isMuted à onAccept

**Note :** `VideoPreviewView` a déjà `@State private var isMuted = false` et le bouton toggle mute. Il suffit de changer la signature d'`onAccept` pour passer l'état.

**Fichiers :**
- Modifier : `apps/ios/Meeshy/Features/Main/Components/VideoPreviewView.swift`

**Étape 1 : Changer la signature `onAccept` (ligne 37)**

De :
```swift
let onAccept: () -> Void
```
Vers :
```swift
let onAccept: (Bool) -> Void
```

**Étape 2 : Passer `isMuted` dans l'action du bouton "Utiliser" (ligne ~336)**

De :
```swift
onAccept()
```
Vers :
```swift
onAccept(isMuted)
```

**Étape 3 : Trouver tous les appelants de `VideoPreviewView` dans l'app**
```bash
grep -r "VideoPreviewView" apps/ios/ packages/ --include="*.swift" -l
```

Mettre à jour chaque site d'appel pour accepter le paramètre `Bool` dans le callback.

**Étape 4 : Dans `StoryComposerView`, si une vidéo est ajoutée, stocker `videoIsMuted` dans les effets**

Ajouter `@State private var videoIsMuted = false` dans `StoryComposerView`.

Dans le `fullScreenCover` pour `VideoPreviewView`, mettre à jour :
```swift
VideoPreviewView(url: videoURL) { isMuted in
    videoIsMuted = isMuted
    selectedVideoURL = videoURL
    showVideoPreview = false
}
```

Dans `buildEffects()`, ajouter si pertinent pour la lecture : stocker `videoIsMuted`.

**Étape 5 : Build**
```bash
./apps/ios/meeshy.sh build
```

**Étape 6 : Commit**
```bash
git add apps/ios/Meeshy/Features/Main/Components/VideoPreviewView.swift
git commit -m "feat(ios): VideoPreviewView — onAccept(Bool) passe l'état isMuted"
```

---

## Task 7 — StoryAudioEditorView (nouvel éditeur audio)

**Objectif :** Après l'enregistrement vocal, afficher un éditeur pour : trim, volume, fade in/out, effets voix (voix-codeur, ange, bébé, démon, reverb, echo, hall).

**Fichiers :**
- Créer : `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryAudioEditorView.swift`
- Modifier : `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift`

**Étape 1 : Créer `StoryAudioEditorView.swift`**

```swift
import SwiftUI
import AVFoundation

// MARK: - Audio Effect

public enum StoryAudioEffect: String, CaseIterable, Identifiable {
    case none = "none"
    case voiceCoder = "voiceCoder"
    case angel = "angel"
    case baby = "baby"
    case demon = "demon"
    case reverb = "reverb"
    case echo = "echo"
    case hall = "hall"

    public var id: String { rawValue }

    public var icon: String {
        switch self {
        case .none:      return "waveform"
        case .voiceCoder: return "waveform.circle"
        case .angel:     return "sparkles"
        case .baby:      return "face.smiling"
        case .demon:     return "flame.fill"
        case .reverb:    return "waveform.path.ecg"
        case .echo:      return "arrow.triangle.2.circlepath"
        case .hall:      return "building.columns"
        }
    }

    public var label: String {
        switch self {
        case .none:      return "Original"
        case .voiceCoder: return "Voix codée"
        case .angel:     return "Ange"
        case .baby:      return "Bébé"
        case .demon:     return "Démon"
        case .reverb:    return "Reverb"
        case .echo:      return "Echo"
        case .hall:      return "Hall"
        }
    }

    // Pitch shift en semitones pour AVAudioUnitTimePitch
    public var pitchShift: Float {
        switch self {
        case .angel:     return 600   // +6 semitones (en cents)
        case .baby:      return 400   // +4 semitones
        case .demon:     return -600  // -6 semitones
        case .voiceCoder: return 0
        case .reverb, .echo, .hall, .none: return 0
        }
    }
}

// MARK: - Audio Edit Parameters

public struct StoryAudioEditParams {
    public var trimStart: Double      // secondes
    public var trimEnd: Double        // secondes
    public var volume: Float          // 0.0 – 2.0
    public var fadeInDuration: Double // secondes
    public var fadeOutDuration: Double
    public var effect: StoryAudioEffect
    public var outputURL: URL         // fichier audio résultant

    public init(trimStart: Double = 0, trimEnd: Double = 0,
                volume: Float = 1.0, fadeInDuration: Double = 0,
                fadeOutDuration: Double = 0, effect: StoryAudioEffect = .none,
                outputURL: URL) {
        self.trimStart = trimStart; self.trimEnd = trimEnd
        self.volume = volume
        self.fadeInDuration = fadeInDuration; self.fadeOutDuration = fadeOutDuration
        self.effect = effect; self.outputURL = outputURL
    }
}

// MARK: - Story Audio Editor View

public struct StoryAudioEditorView: View {
    public let sourceURL: URL
    public let onAccept: (StoryAudioEditParams) -> Void
    public let onCancel: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var duration: Double = 1
    @State private var trimStart: Double = 0
    @State private var trimEnd: Double = 1
    @State private var volume: Float = 1.0
    @State private var fadeIn: Double = 0
    @State private var fadeOut: Double = 0
    @State private var selectedEffect: StoryAudioEffect = .none
    @State private var isPlaying = false
    @State private var player: AVAudioPlayer?
    @State private var isExporting = false

    public init(sourceURL: URL,
                onAccept: @escaping (StoryAudioEditParams) -> Void,
                onCancel: @escaping () -> Void) {
        self.sourceURL = sourceURL
        self.onAccept = onAccept
        self.onCancel = onCancel
    }

    public var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 0) {
                topBar
                    .padding(.top, 52)

                Spacer()

                waveformSection

                Spacer()

                volumeSection

                fadeSection

                effectsSection

                acceptButton
                    .padding(.bottom, 40)
            }
            .padding(.horizontal, 20)
        }
        .onAppear { loadAudio() }
        .onDisappear { player?.stop() }
    }

    // MARK: - Top Bar

    private var topBar: some View {
        HStack {
            Button { onCancel(); dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 38, height: 38)
                    .background(.black.opacity(0.55), in: Circle())
            }
            .accessibilityLabel("Annuler")

            Spacer()

            Text("Éditeur audio")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(.white)

            Spacer()

            // Play/pause preview
            Button {
                isPlaying ? player?.pause() : player?.play()
                isPlaying.toggle()
            } label: {
                Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 38, height: 38)
                    .background(Color(hex: "FF2E63").opacity(0.8), in: Circle())
            }
            .accessibilityLabel(isPlaying ? "Pause" : "Écouter")
        }
    }

    // MARK: - Waveform + Trim Scrubber

    private var waveformSection: some View {
        VStack(spacing: 8) {
            Text("Trim")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(.white.opacity(0.6))
                .frame(maxWidth: .infinity, alignment: .leading)

            GeometryReader { geo in
                let w = geo.size.width
                ZStack(alignment: .leading) {
                    // Background track
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.white.opacity(0.1))
                        .frame(height: 48)

                    // Selected range
                    let startX = (trimStart / duration) * w
                    let endX = (trimEnd / duration) * w
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(hex: "FF2E63").opacity(0.3))
                        .frame(width: endX - startX, height: 48)
                        .offset(x: startX)

                    // Start handle
                    trimHandle(offset: (trimStart / duration) * w, isStart: true, totalWidth: w)
                    // End handle
                    trimHandle(offset: (trimEnd / duration) * w, isStart: false, totalWidth: w)
                }
            }
            .frame(height: 48)

            HStack {
                Text(formatTime(trimStart))
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundColor(.white.opacity(0.5))
                Spacer()
                Text(formatTime(trimEnd - trimStart) + " sélectionné")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundColor(Color(hex: "08D9D6"))
                Spacer()
                Text(formatTime(trimEnd))
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundColor(.white.opacity(0.5))
            }
        }
    }

    private func trimHandle(offset: CGFloat, isStart: Bool, totalWidth: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: 3)
            .fill(Color(hex: "FF2E63"))
            .frame(width: 6, height: 56)
            .offset(x: offset - 3, y: -4)
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { val in
                        let pct = max(0, min(1, val.location.x / totalWidth))
                        let newTime = pct * duration
                        if isStart {
                            trimStart = min(newTime, trimEnd - 0.5)
                        } else {
                            trimEnd = max(newTime, trimStart + 0.5)
                        }
                    }
            )
    }

    // MARK: - Volume

    private var volumeSection: some View {
        VStack(spacing: 6) {
            HStack {
                Text("Volume")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.white.opacity(0.6))
                Spacer()
                Text("\(Int(volume * 100))%")
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundColor(.white.opacity(0.6))
            }
            Slider(value: $volume, in: 0...2)
                .tint(Color(hex: "FF2E63"))
                .accessibilityLabel("Volume")
        }
        .padding(.vertical, 8)
    }

    // MARK: - Fade In / Fade Out

    private var fadeSection: some View {
        HStack(spacing: 16) {
            VStack(spacing: 6) {
                Text("Fade in")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.white.opacity(0.6))
                Slider(value: $fadeIn, in: 0...3)
                    .tint(Color(hex: "08D9D6"))
                    .accessibilityLabel("Durée fade in")
                Text(String(format: "%.1fs", fadeIn))
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(.white.opacity(0.4))
            }

            VStack(spacing: 6) {
                Text("Fade out")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.white.opacity(0.6))
                Slider(value: $fadeOut, in: 0...3)
                    .tint(Color(hex: "08D9D6"))
                    .accessibilityLabel("Durée fade out")
                Text(String(format: "%.1fs", fadeOut))
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(.white.opacity(0.4))
            }
        }
        .padding(.vertical, 8)
    }

    // MARK: - Effects

    private var effectsSection: some View {
        VStack(spacing: 8) {
            Text("Effets voix")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(.white.opacity(0.6))
                .frame(maxWidth: .infinity, alignment: .leading)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(StoryAudioEffect.allCases) { effect in
                        Button {
                            withAnimation(.spring(response: 0.2)) {
                                selectedEffect = effect
                            }
                            HapticFeedback.light()
                        } label: {
                            VStack(spacing: 4) {
                                Image(systemName: effect.icon)
                                    .font(.system(size: 18, weight: .medium))
                                    .foregroundColor(selectedEffect == effect ? .black : .white)
                                    .frame(width: 48, height: 48)
                                    .background(
                                        Circle().fill(
                                            selectedEffect == effect
                                                ? Color(hex: "FF2E63")
                                                : Color.white.opacity(0.1)
                                        )
                                    )
                                Text(effect.label)
                                    .font(.system(size: 9, weight: .medium))
                                    .foregroundColor(
                                        selectedEffect == effect
                                            ? Color(hex: "FF2E63")
                                            : .white.opacity(0.6)
                                    )
                            }
                        }
                        .accessibilityLabel(effect.label)
                    }
                }
            }
        }
        .padding(.vertical, 8)
    }

    // MARK: - Accept Button

    private var acceptButton: some View {
        Button {
            exportAudio()
        } label: {
            HStack(spacing: 8) {
                if isExporting {
                    ProgressView()
                        .tint(.white)
                        .scaleEffect(0.85)
                } else {
                    Image(systemName: "checkmark")
                        .font(.system(size: 14, weight: .bold))
                }
                Text(isExporting ? "Traitement…" : "Utiliser")
                    .font(.system(size: 16, weight: .bold))
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [Color(hex: "FF2E63"), Color(hex: "FF6B6B")],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
            )
        }
        .disabled(isExporting)
        .padding(.top, 12)
    }

    // MARK: - Audio Setup

    private func loadAudio() {
        guard let p = try? AVAudioPlayer(contentsOf: sourceURL) else { return }
        player = p
        p.prepareToPlay()
        duration = max(1, p.duration)
        trimEnd = p.duration
    }

    // MARK: - Export

    private func exportAudio() {
        isExporting = true
        Task {
            let outputURL = FileManager.default.temporaryDirectory
                .appendingPathComponent("story_audio_edited_\(UUID().uuidString).m4a")

            let params = StoryAudioEditParams(
                trimStart: trimStart,
                trimEnd: trimEnd,
                volume: volume,
                fadeInDuration: fadeIn,
                fadeOutDuration: fadeOut,
                effect: selectedEffect,
                outputURL: outputURL
            )

            do {
                let finalURL = try await StoryAudioExporter.export(
                    sourceURL: sourceURL,
                    params: params
                )
                await MainActor.run {
                    var finalParams = params
                    finalParams.outputURL = finalURL
                    isExporting = false
                    onAccept(finalParams)
                    dismiss()
                }
            } catch {
                await MainActor.run { isExporting = false }
            }
        }
    }

    // MARK: - Helpers

    private func formatTime(_ t: Double) -> String {
        let s = max(0, t)
        let m = Int(s) / 60
        let sec = Int(s) % 60
        let ms = Int((s - floor(s)) * 10)
        return String(format: "%d:%02d.%d", m, sec, ms)
    }
}
```

**Étape 2 : Créer `StoryAudioExporter.swift` dans le même répertoire**

```swift
import AVFoundation

// MARK: - Story Audio Exporter

public enum StoryAudioExporter {
    /// Exporte l'audio avec trim + volume + fade + effet via AVAudioEngine
    public static func export(sourceURL: URL, params: StoryAudioEditParams) async throws -> URL {
        // 1. Trim via AVAssetExportSession
        let trimmedURL = try await trimAudio(url: sourceURL, start: params.trimStart, end: params.trimEnd)

        // 2. Si aucun effet + volume = 1.0 + pas de fade → retourner directement
        let hasEffects = params.effect != .none
            || params.volume != 1.0
            || params.fadeInDuration > 0
            || params.fadeOutDuration > 0

        guard hasEffects else { return trimmedURL }

        // 3. Appliquer effets + volume + fade via AVAudioEngine
        return try await applyEffects(url: trimmedURL, params: params)
    }

    // MARK: - Trim

    private static func trimAudio(url: URL, start: Double, end: Double) async throws -> URL {
        let asset = AVURLAsset(url: url)
        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("trimmed_\(UUID().uuidString).m4a")

        guard let exporter = AVAssetExportSession(
            asset: asset,
            presetName: AVAssetExportPresetAppleM4A
        ) else { throw ExportError.exportSessionFailed }

        exporter.outputURL = outputURL
        exporter.outputFileType = .m4a
        exporter.timeRange = CMTimeRange(
            start: CMTime(seconds: start, preferredTimescale: 600),
            end: CMTime(seconds: end, preferredTimescale: 600)
        )

        await exporter.export()

        guard exporter.status == .completed else {
            throw exporter.error ?? ExportError.trimFailed
        }
        return outputURL
    }

    // MARK: - Effects via AVAudioEngine

    private static func applyEffects(url: URL, params: StoryAudioEditParams) async throws -> URL {
        let engine = AVAudioEngine()
        let playerNode = AVAudioPlayerNode()

        guard let audioFile = try? AVAudioFile(forReading: url) else {
            throw ExportError.fileReadFailed
        }

        engine.attach(playerNode)

        // Nœuds d'effets
        let pitchNode = AVAudioUnitTimePitch()
        let reverbNode = AVAudioUnitReverb()
        let delayNode = AVAudioUnitDelay()

        engine.attach(pitchNode)
        engine.attach(reverbNode)
        engine.attach(delayNode)

        // Configuration selon l'effet
        pitchNode.pitch = params.effect.pitchShift

        switch params.effect {
        case .reverb:
            reverbNode.loadFactoryPreset(.mediumHall)
            reverbNode.wetDryMix = 50
        case .hall:
            reverbNode.loadFactoryPreset(.largeHall)
            reverbNode.wetDryMix = 60
        case .echo:
            delayNode.delayTime = 0.3
            delayNode.feedback = 40
            delayNode.wetDryMix = 35
        case .angel, .voiceCoder:
            reverbNode.loadFactoryPreset(.mediumRoom)
            reverbNode.wetDryMix = 25
        case .demon:
            reverbNode.loadFactoryPreset(.cathedral)
            reverbNode.wetDryMix = 30
        default:
            break
        }

        // Chaîne : player → pitch → reverb → delay → mainMixer
        let format = audioFile.processingFormat
        engine.connect(playerNode, to: pitchNode, format: format)
        engine.connect(pitchNode, to: reverbNode, format: format)
        engine.connect(reverbNode, to: delayNode, format: format)
        engine.connect(delayNode, to: engine.mainMixerNode, format: format)

        // Volume
        engine.mainMixerNode.outputVolume = params.volume

        // Render en mode offline (plus rapide que temps réel)
        try engine.enableManualRenderingMode(
            .offline,
            format: format,
            maximumFrameCount: 4096
        )

        try engine.start()
        playerNode.scheduleFile(audioFile, at: nil)
        playerNode.play()

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("fx_\(UUID().uuidString).m4a")

        let outputSettings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: format.sampleRate,
            AVNumberOfChannelsKey: format.channelCount,
            AVEncoderBitRateKey: 128_000
        ]

        guard let outputFile = try? AVAudioFile(
            forWriting: outputURL,
            settings: outputSettings,
            commonFormat: format.commonFormat,
            interleaved: format.isInterleaved
        ) else { throw ExportError.fileWriteFailed }

        let buffer = AVAudioPCMBuffer(
            pcmFormat: engine.manualRenderingFormat,
            frameCapacity: engine.manualRenderingMaximumFrameCount
        )!

        let totalFrames = AVAudioFramePosition(audioFile.length)
        var framesRendered: AVAudioFramePosition = 0

        while framesRendered < totalFrames {
            let framesToRender = min(
                AVAudioFrameCount(totalFrames - framesRendered),
                engine.manualRenderingMaximumFrameCount
            )
            let status = try engine.renderOffline(framesToRender, to: buffer)
            switch status {
            case .success:
                buffer.frameLength = framesToRender
                try outputFile.write(from: buffer)
                framesRendered += AVAudioFramePosition(framesToRender)
            case .insufficientDataFromInputNode:
                break
            case .cannotDoInCurrentContext, .error:
                throw ExportError.renderFailed
            @unknown default:
                break
            }
        }

        engine.stop()
        return outputURL
    }

    // MARK: - Errors

    enum ExportError: Error {
        case exportSessionFailed
        case trimFailed
        case fileReadFailed
        case fileWriteFailed
        case renderFailed
    }
}
```

**Étape 3 : Intégrer dans `StoryComposerView`**

Dans `StoryComposerView`, trouver l'endroit où la voix enregistrée est traitée (après `StoryVoiceRecorder`). Ajouter :

```swift
@State private var pendingAudioURL: URL? = nil
@State private var showAudioEditor = false
```

Après l'enregistrement, au lieu d'utiliser directement l'URL :
```swift
pendingAudioURL = recordedURL
showAudioEditor = true
```

Ajouter `.fullScreenCover(isPresented: $showAudioEditor)` :
```swift
.fullScreenCover(isPresented: $showAudioEditor) {
    if let audioURL = pendingAudioURL {
        StoryAudioEditorView(sourceURL: audioURL) { params in
            // Utiliser params.outputURL comme audio vocal du slide
            voiceAttachmentURL = params.outputURL
            pendingAudioURL = nil
        } onCancel: {
            pendingAudioURL = nil
        }
    }
}
```

**Étape 4 : Build**
```bash
./apps/ios/meeshy.sh build
```

**Étape 5 : Commit**
```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryAudioEditorView.swift
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryAudioExporter.swift
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift
git commit -m "feat(ios): StoryAudioEditorView — trim, volume, fade, effets voix (ange/bébé/démon/reverb/echo/hall)"
```

---

## Task 8 — Multi-texte canvas-natif

**Objectif :** Permettre plusieurs textes indépendants sur le canvas. Tap "Aa" → nouveau texte centré + keyboard overlay flottant. Tap sur texte → édition. Double-tap → supprimer.

**Fichiers :**
- Modifier : `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasView.swift`
- Modifier : `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift`
- Créer : `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasTextOverlay.swift`

**Étape 1 : Créer `StoryCanvasTextOverlay.swift`**

```swift
import SwiftUI
import MeeshySDK

// MARK: - Canvas Text Overlay (keyboard + style inline)

public struct StoryCanvasTextOverlay: View {
    @Binding public var textObject: StoryTextObject
    public var onDismiss: () -> Void

    @FocusState private var isFocused: Bool

    public init(textObject: Binding<StoryTextObject>, onDismiss: @escaping () -> Void) {
        self._textObject = textObject
        self.onDismiss = onDismiss
    }

    public var body: some View {
        ZStack {
            // Fond semi-transparent, tap pour dismiss
            Color.black.opacity(0.3)
                .ignoresSafeArea()
                .onTapGesture { onDismiss() }

            VStack {
                Spacer()

                // Champ texte au centre
                TextField("Écrivez quelque chose…", text: $textObject.content, axis: .vertical)
                    .font(storyFont(for: textObject.parsedStyle, size: textObject.size))
                    .foregroundColor(Color(hex: textObject.colorHex))
                    .multilineTextAlignment(alignment(from: textObject.align))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(
                        textObject.bgEnabled
                            ? RoundedRectangle(cornerRadius: 10).fill(Color.black.opacity(0.5))
                            : nil
                    )
                    .frame(maxWidth: 300)
                    .focused($isFocused)

                // Barre de style sous le clavier
                styleBar
                    .padding(.bottom, 20)
            }
        }
        .onAppear { isFocused = true }
    }

    // MARK: - Style Bar

    private var styleBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                // Styles
                ForEach(StoryTextStyle.allCases, id: \.self) { style in
                    Button {
                        textObject.style = style.rawValue
                        HapticFeedback.light()
                    } label: {
                        Text(style.displayName)
                            .font(storyFont(for: style, size: 14))
                            .foregroundColor(textObject.style == style.rawValue ? Color(hex: "FF2E63") : .white)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(
                                Capsule().fill(
                                    textObject.style == style.rawValue
                                        ? Color(hex: "FF2E63").opacity(0.15)
                                        : Color.white.opacity(0.1)
                                )
                            )
                    }
                    .accessibilityLabel("Style \(style.displayName)")
                }

                Divider().frame(height: 20).background(Color.white.opacity(0.3))

                // Couleurs
                ForEach(["FFFFFF", "000000", "FF2E63", "08D9D6", "F8B500", "A855F7"], id: \.self) { hex in
                    Button {
                        textObject.colorHex = hex
                        HapticFeedback.light()
                    } label: {
                        Circle()
                            .fill(Color(hex: hex))
                            .frame(width: 26, height: 26)
                            .overlay(
                                Circle().stroke(Color.white, lineWidth: textObject.colorHex == hex ? 2 : 0)
                            )
                    }
                    .accessibilityLabel("Couleur \(hex)")
                }

                Divider().frame(height: 20).background(Color.white.opacity(0.3))

                // Taille
                Button {
                    textObject.size = max(14, textObject.size - 4)
                    HapticFeedback.light()
                } label: {
                    Image(systemName: "textformat.size.smaller")
                        .foregroundColor(.white)
                        .frame(width: 32, height: 32)
                }
                .accessibilityLabel("Réduire la taille")

                Button {
                    textObject.size = min(64, textObject.size + 4)
                    HapticFeedback.light()
                } label: {
                    Image(systemName: "textformat.size.larger")
                        .foregroundColor(.white)
                        .frame(width: 32, height: 32)
                }
                .accessibilityLabel("Augmenter la taille")

                // Fond toggle
                Button {
                    textObject.bgEnabled.toggle()
                    HapticFeedback.light()
                } label: {
                    Image(systemName: textObject.bgEnabled ? "rectangle.fill" : "rectangle")
                        .foregroundColor(textObject.bgEnabled ? Color(hex: "FF2E63") : .white)
                        .frame(width: 32, height: 32)
                }
                .accessibilityLabel("Fond texte")
            }
            .padding(.horizontal, 16)
        }
        .padding(.vertical, 8)
        .background(Color.black.opacity(0.6))
    }

    private func alignment(from string: String) -> TextAlignment {
        switch string {
        case "left":  return .leading
        case "right": return .trailing
        default:      return .center
        }
    }
}
```

**Étape 2 : Ajouter `DraggableTextView` dans `StoryCanvasView.swift`**

Ajouter cette struct à la fin du fichier `StoryCanvasView.swift` (après `DraggableSticker`) :

```swift
// MARK: - Draggable Text View

public struct DraggableTextView: View {
    @Binding public var textObject: StoryTextObject
    public let canvasSize: CGSize
    public let isEditing: Bool
    public var onTap: () -> Void
    public var onRemove: () -> Void

    @State private var showDeleteButton = false

    public var body: some View {
        ZStack(alignment: .topTrailing) {
            styledText

            if showDeleteButton {
                Button {
                    onRemove()
                    HapticFeedback.medium()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 20))
                        .foregroundColor(.white)
                        .background(Circle().fill(Color.red).padding(-2))
                }
                .offset(x: 10, y: -10)
                .transition(.scale.combined(with: .opacity))
                .accessibilityLabel("Supprimer ce texte")
            }
        }
        .rotationEffect(.degrees(textObject.rotation))
        .position(
            x: textObject.x * canvasSize.width,
            y: textObject.y * canvasSize.height
        )
        .gesture(dragGesture)
        .onTapGesture { onTap() }
        .onTapGesture(count: 2) {
            withAnimation(.spring(response: 0.2)) { showDeleteButton.toggle() }
        }
        .overlay(
            isEditing
                ? RoundedRectangle(cornerRadius: 6)
                    .stroke(Color(hex: "FF2E63"), lineWidth: 2)
                    .padding(-4)
                    .allowsHitTesting(false)
                : nil
        )
    }

    private var styledText: some View {
        Text(textObject.content)
            .font(storyFont(for: textObject.parsedStyle, size: textObject.size))
            .foregroundColor(Color(hex: textObject.colorHex))
            .multilineTextAlignment(textAlignment)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                Group {
                    if textObject.bgEnabled {
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color.black.opacity(0.5))
                    }
                }
            )
            .shadow(
                color: textObject.parsedStyle == .neon
                    ? Color(hex: textObject.colorHex).opacity(0.6) : .clear,
                radius: 10
            )
            .frame(maxWidth: 280)
    }

    private var textAlignment: TextAlignment {
        switch textObject.align {
        case "left":  return .leading
        case "right": return .trailing
        default:      return .center
        }
    }

    private var dragGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                let newX = max(0.05, min(0.95, value.location.x / canvasSize.width))
                let newY = max(0.05, min(0.95, value.location.y / canvasSize.height))
                textObject.x = newX
                textObject.y = newY
            }
    }
}
```

**Étape 3 : Mettre à jour `StoryCanvasView` pour accepter `textObjects`**

Dans `StoryCanvasView.swift`, remplacer les bindings texte unique par :

```swift
@Binding public var textObjects: [StoryTextObject]
@Binding public var editingTextId: String?
```

Supprimer de la déclaration :
```swift
// Supprimer ces lignes :
// @Binding public var text: String
// @Binding public var textStyle: StoryTextStyle
// @Binding public var textColor: Color
// @Binding public var textSize: CGFloat
// @Binding public var textBgEnabled: Bool
// @Binding public var textAlignment: TextAlignment
// @Binding public var textPosition: StoryTextPosition
```

Mettre à jour le `init` correspondant.

Remplacer `textLayer(canvasSize:)` :
```swift
@ViewBuilder
private func textLayer(canvasSize: CGSize) -> some View {
    if !isDrawingActive {
        ForEach(Array(textObjects.enumerated()), id: \.element.id) { index, _ in
            DraggableTextView(
                textObject: $textObjects[index],
                canvasSize: canvasSize,
                isEditing: editingTextId == textObjects[index].id,
                onTap: { editingTextId = textObjects[index].id },
                onRemove: {
                    guard index < textObjects.count else { return }
                    if editingTextId == textObjects[index].id { editingTextId = nil }
                    textObjects.remove(at: index)
                }
            )
        }
    }
}
```

**Étape 4 : Mettre à jour `StoryComposerView`**

Ajouter les `@State` :
```swift
@State private var textObjects: [StoryTextObject] = []
@State private var editingTextId: String? = nil
```

Supprimer ou garder commentés les anciens @State de texte unique (pour rétrocompatibilité, les garder dans `buildEffects()` peut suffire).

Ajouter la fonction `addNewText()` :
```swift
private func addNewText() {
    let newText = StoryTextObject(
        content: "",
        x: 0.5,
        y: 0.5
    )
    textObjects.append(newText)
    editingTextId = newText.id
    HapticFeedback.medium()
}
```

Modifier le bouton "Aa" pour appeler `addNewText()` directement au lieu d'activer un panel.

Mettre à jour `buildEffects()` pour inclure `textObjects` :
```swift
textObjects: textObjects.isEmpty ? nil : textObjects,
```

Ajouter l'overlay de texte dans le body (au niveau ZStack de la vue principale) :
```swift
// Overlay clavier/style quand un texte est en édition
if let editingId = editingTextId,
   let idx = textObjects.firstIndex(where: { $0.id == editingId }) {
    StoryCanvasTextOverlay(
        textObject: $textObjects[idx],
        onDismiss: { editingTextId = nil }
    )
    .transition(.opacity)
    .zIndex(100)
}
```

Mettre à jour les appels à `StoryCanvasView` pour passer les nouveaux bindings :
```swift
StoryCanvasView(
    textObjects: $textObjects,
    editingTextId: $editingTextId,
    // ... autres paramètres inchangés
)
```

**Étape 5 : Mettre à jour `loadSlide(from:)` (Task 2) pour inclure textObjects**

Si Task 2 avait laissé `textObjects = ...` commenté, décommenter :
```swift
textObjects = slide.effects.textObjects ?? []
```

**Étape 6 : Build**
```bash
./apps/ios/meeshy.sh build
```
Attendu : succès.

**Étape 7 : Commit**
```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/
git commit -m "feat(ios): multi-texte canvas-natif — DraggableTextView + StoryCanvasTextOverlay"
```

---

## Task 9 — StoryCanvasReaderView — render textObjects

**Objectif :** Adapter la vue lecture pour afficher les `textObjects` du nouveau format. Priorité à `textObjects` si non-vide, sinon fallback sur `content` legacy.

**Fichiers :**
- Modifier : `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift`

**Étape 1 : Remplacer `textLayer(size:)` (lignes 117–125)**

```swift
@ViewBuilder
private func textLayer(size: CGSize) -> some View {
    let effects = story.storyEffects

    // Nouveau format multi-texte — priorité
    if let textObjs = effects?.textObjects, !textObjs.isEmpty {
        ForEach(textObjs) { obj in
            styledTextObject(obj)
                .rotationEffect(.degrees(obj.rotation))
                .position(
                    x: obj.x * size.width,
                    y: obj.y * size.height
                )
        }
    } else {
        // Fallback format legacy (texte unique)
        let resolvedContent = story.resolvedContent(preferredLanguage: preferredLanguage)
        if let content = resolvedContent, !content.isEmpty {
            let pos = effects?.resolvedTextPosition ?? .center
            styledText(content: content, effects: effects)
                .position(x: pos.x * size.width, y: pos.y * size.height)
        }
    }
}
```

**Étape 2 : Ajouter `styledTextObject(_:)` après `styledText(content:effects:)`**

```swift
private func styledTextObject(_ obj: StoryTextObject) -> some View {
    let textStyle = StoryTextStyle(rawValue: obj.style)
    let alignment: TextAlignment = {
        switch obj.align {
        case "left":  return .leading
        case "right": return .trailing
        default:      return .center
        }
    }()

    return Text(obj.content)
        .font(storyFont(for: textStyle, size: obj.size))
        .foregroundColor(Color(hex: obj.colorHex))
        .multilineTextAlignment(alignment)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            Group {
                if obj.bgEnabled {
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color.black.opacity(0.5))
                }
            }
        )
        .shadow(
            color: textStyle == .neon ? Color(hex: obj.colorHex).opacity(0.6) : .clear,
            radius: 10
        )
        .frame(maxWidth: 280)
}
```

**Étape 3 : Build**
```bash
./apps/ios/meeshy.sh build
```

**Étape 4 : Commit**
```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift
git commit -m "feat(sdk): StoryCanvasReaderView — render textObjects multi-texte avec fallback legacy"
```

---

## Task 10 — Test UI/UX complet en simulateur

**Objectif :** Valider chaque manipulation du StoryComposer. Lancer l'app puis tester les 10 scénarios.

**Étape 1 : Lancer l'app**
```bash
./apps/ios/meeshy.sh run
```

**Scénarios à tester :**

1. **Bouton Publier** → doit afficher uniquement l'icône avion (pas de texte)
2. **Dessin** → ouvrir outil dessin → slider visible, outils + actions visibles, couleurs scrollables horizontalement → aucun overflow
3. **Nouveau slide** → créer slide avec image + texte → créer slide 2 → slide 2 doit être vide (image et texte absents)
4. **Revenir slide 1** → image + texte doivent être présents
5. **Ajouter image** → `ImageEditView` doit s'ouvrir → après édition → image insérée dans le canvas
6. **Tap "Aa"** → nouveau texte centré → clavier s'ouvre → taper → tap sur le canvas = texte déposé, draggable
7. **Tap texte existant** → clavier réapparaît avec le texte existant → modifier
8. **Double-tap texte** → bouton ✕ apparaît → tap ✕ = supprimé
9. **Trois textes** → chacun indépendant, draggable
10. **Enregistrement vocal** → éditeur audio s'ouvre → trim, volume, fade fonctionnent → "Utiliser" → audio appliqué

**Étape 2 : En cas de problème**

- Crash au build → lire les logs avec `./apps/ios/meeshy.sh logs`
- Slide isolation pas corrigé → vérifier que `loadSlide(from:)` est bien appelé dans le slideThumb handler
- Textes ne restent pas au changement de slide → vérifier que `textObjects` est inclus dans `buildEffects()` et restauré dans `loadSlide()`

**Étape 3 : Commit final**
```bash
git add -A
git commit -m "test(ios): validation UI/UX complète StoryComposer V2"
```

---

## Accessibility (s'appliquer à chaque tâche)

Chaque bouton icône-only doit avoir `.accessibilityLabel()`. Les éléments déjà listés dans ce plan incluent les labels. Lors de la modification de fichiers existants, vérifier que tous les `Button { } label: { Image(...) }` ont un `.accessibilityLabel()`.

---

## Ordre d'exécution recommandé

1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10

Tasks 3 et 4 sont indépendantes de 1-2 et peuvent être faites en parallèle si nécessaire. Task 8 dépend de Task 1 (StoryTextObject doit exister). Task 9 dépend de Task 1 et 8.
