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

**Phase 1 — Core existant :** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10

Tasks 3 et 4 sont indépendantes de 1-2 et peuvent être faites en parallèle si nécessaire. Task 8 dépend de Task 1 (StoryTextObject doit exister). Task 9 dépend de Task 1 et 8.

**Phase 2 — Système média + Prisme :** 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18 → 19 → 20 → 21

Task 11 (SDK modèles) doit précéder toutes les autres tasks de la Phase 2. Tasks 16–19 sont indépendantes. Task 20 dépend de 16–19. Task 21 dépend de 11 et 12.

---

## Task 11 — SDK : StoryMediaObject + StoryAudioPlayerObject + StoryTextObject.translations

**Fichiers :**
- Modifier : `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`

**Contexte :** `StoryTextObject` existe déjà (ajouté en Task 1) sans champ `translations`. Ajouter les nouveaux types et compléter le modèle.

**Étape 1 : Ajouter `translations` à `StoryTextObject` (après `rotation`)**

```swift
public var translations: [String: String]?  // { "en": "Hello", "es": "Hola", ... }
```

Mettre à jour l'`init` de `StoryTextObject` :
```swift
public init(/* paramètres existants */, translations: [String: String]? = nil) {
    // ... init existant ...
    self.translations = translations
}
```

**Étape 2 : Ajouter `StoryMediaObject` après le bloc `StoryTextObject`**

```swift
// MARK: - Story Media Object (image/vidéo sur canvas)

public struct StoryMediaObject: Codable, Identifiable, Sendable {
    public var id: String
    public var postMediaId: String      // référence PostMedia en DB
    public var mediaType: String        // "image" | "video"
    public var placement: String        // "foreground" | "background"
    public var x: CGFloat              // normalisé 0–1 (ignoré si background)
    public var y: CGFloat
    public var scale: CGFloat
    public var rotation: CGFloat
    public var volume: Float           // 0.0–1.0 (vidéos foreground uniquement)

    public init(id: String = UUID().uuidString, postMediaId: String,
                mediaType: String, placement: String = "foreground",
                x: CGFloat = 0.5, y: CGFloat = 0.5,
                scale: CGFloat = 1.0, rotation: CGFloat = 0,
                volume: Float = 1.0) {
        self.id = id; self.postMediaId = postMediaId
        self.mediaType = mediaType; self.placement = placement
        self.x = x; self.y = y; self.scale = scale
        self.rotation = rotation; self.volume = volume
    }
}
```

**Étape 3 : Ajouter `StoryAudioPlayerObject` après `StoryMediaObject`**

```swift
// MARK: - Story Audio Player Object (player waveform sur canvas)

public struct StoryAudioPlayerObject: Codable, Identifiable, Sendable {
    public var id: String
    public var postMediaId: String      // référence PostMedia en DB
    public var placement: String        // "foreground" | "background"
    public var x: CGFloat              // normalisé 0–1 (foreground uniquement)
    public var y: CGFloat
    public var volume: Float           // 0.0–1.0
    public var waveformSamples: [Float] // ~80 samples extraits à la composition

    public init(id: String = UUID().uuidString, postMediaId: String,
                placement: String = "foreground",
                x: CGFloat = 0.5, y: CGFloat = 0.8,
                volume: Float = 1.0, waveformSamples: [Float] = []) {
        self.id = id; self.postMediaId = postMediaId
        self.placement = placement; self.x = x; self.y = y
        self.volume = volume; self.waveformSamples = waveformSamples
    }
}
```

**Étape 4 : Ajouter `StoryAudioVariant` après `StoryAudioPlayerObject`**

```swift
// MARK: - Story Audio Variant (TTS auto-généré par langue)

public struct StoryAudioVariant: Codable, Sendable {
    public var postMediaId: String      // référence PostMedia de la variante
    public var language: String         // code langue IETF ex: "fr", "en"
    public var isAutoGenerated: Bool

    public init(postMediaId: String, language: String, isAutoGenerated: Bool = true) {
        self.postMediaId = postMediaId; self.language = language
        self.isAutoGenerated = isAutoGenerated
    }
}
```

**Étape 5 : Mettre à jour `StoryEffects` — 3 nouveaux champs après `backgroundAudioId`**

```swift
public var mediaObjects: [StoryMediaObject]?
public var audioPlayerObjects: [StoryAudioPlayerObject]?
public var backgroundAudioVariants: [StoryAudioVariant]?
```

Mettre à jour l'`init` de `StoryEffects` — ajouter paramètres avec valeur par défaut `nil` :
```swift
mediaObjects: [StoryMediaObject]? = nil,
audioPlayerObjects: [StoryAudioPlayerObject]? = nil,
backgroundAudioVariants: [StoryAudioVariant]? = nil,
```

Et dans le corps de l'init :
```swift
self.mediaObjects = mediaObjects
self.audioPlayerObjects = audioPlayerObjects
self.backgroundAudioVariants = backgroundAudioVariants
```

**Étape 6 : Build**
```bash
./apps/ios/meeshy.sh build
```
Attendu : succès, zéro erreur.

**Étape 7 : Commit**
```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift
git commit -m "feat(sdk): StoryMediaObject, StoryAudioPlayerObject, StoryAudioVariant + translations"
```

---

## Task 12 — Prisma Schema : 5 nouveaux champs

**Fichiers :**
- Modifier : `packages/shared/prisma/schema.prisma`

**Contexte :** `PostMedia` (ligne ~2687) et `StoryBackgroundAudio` (ligne ~2670) sont les deux modèles à étendre. Pas de migration MongoDB requise (champs optionnels).

**Étape 1 : Lire les deux blocs de modèles**
```bash
# Trouver les lignes exactes
grep -n "model PostMedia\|model StoryBackgroundAudio" packages/shared/prisma/schema.prisma
```

**Étape 2 : Dans `PostMedia`, ajouter après `transcription`**

```prisma
/// Code langue du média ex: "fr", "en" (pour variantes TTS/sous-titres)
language    String?
/// ID PostMedia source si ce média est une variante générée automatiquement
variantOf   String?  @db.ObjectId
```

**Étape 3 : Dans `StoryBackgroundAudio`, ajouter après `isPublic`**

```prisma
/// Généré automatiquement par le pipeline TTS depuis un audio existant
isAutoGenerated Boolean @default(false)
/// Code langue source de l'audio original
sourceLanguage  String?
/// ID StoryBackgroundAudio original si cette entrée est une variante de langue
variantOf       String? @db.ObjectId
```

**Étape 4 : Régénérer le client Prisma**
```bash
cd packages/shared && npx prisma generate
```
Attendu : "Generated Prisma Client".

**Étape 5 : Build gateway pour vérifier les types Prisma**
```bash
cd services/gateway && npm run build
```
Attendu : zéro erreur TypeScript.

**Étape 6 : Commit**
```bash
git add packages/shared/prisma/schema.prisma packages/shared/prisma/client/
git commit -m "feat(schema): add language/variantOf to PostMedia and StoryBackgroundAudio"
```

---

## Task 13 — Gateway : types + PostService triggerStoryTextObjectTranslation

**Fichiers :**
- Lire : `services/gateway/src/services/PostService.ts`
- Lire : `services/gateway/src/routes/posts/types.ts` (ou chemin équivalent)
- Modifier : `services/gateway/src/services/PostService.ts`

**Contexte :** `triggerStoryTextTranslation()` existe pour `Post.content`. Ajouter la version pour les textObjects. `Post.content` doit être rempli comme index de recherche quand `textObjects` existent.

**Étape 1 : Lire PostService.ts**
```bash
grep -n "triggerStoryText\|storyEffects\|textObjects\|content" services/gateway/src/services/PostService.ts | head -40
```

**Étape 2 : Identifier le type local pour StoryTextObject**

Chercher si un type `StoryTextObjectRaw` ou similaire existe :
```bash
grep -rn "StoryTextObject\|textObjects" services/gateway/src/ packages/shared/types/
```
Si absent, déclarer localement dans PostService.ts :
```typescript
interface StoryTextObjectRaw {
  id?: string;
  text: string;
  sourceLanguage?: string;
  translations?: Record<string, string>;
  [key: string]: unknown;
}
```

**Étape 3 : Ajouter `triggerStoryTextObjectTranslation` dans PostService**

Après la méthode `triggerStoryTextTranslation` existante, ajouter :

```typescript
private triggerStoryTextObjectTranslation(
  postId: string,
  textObjects: StoryTextObjectRaw[]
): void {
  const targetLanguages = this.getActiveTargetLanguages();

  textObjects.forEach((obj, index) => {
    const text = obj.text?.trim();
    if (!text) return;

    this.zmqClient.translateTextObject({
      postId,
      textObjectIndex: index,
      text,
      sourceLanguage: obj.sourceLanguage ?? 'fr',
      targetLanguages,
    });
  });
}

private getActiveTargetLanguages(): string[] {
  // Langues principales supportées par le Prisme Linguistique
  return ['en', 'fr', 'es', 'de', 'pt', 'ar', 'zh', 'ja', 'ko', 'ru'];
}
```

**Étape 4 : Modifier `createPost()` — déclencher pipeline + remplir Post.content**

Trouver où `createPost` persiste le post. Après la création, ajouter :

```typescript
// Si story avec textObjects : content = index de recherche
const effects = data.storyEffects as Record<string, unknown> | undefined;
const textObjects = effects?.textObjects as StoryTextObjectRaw[] | undefined;

if (textObjects?.length) {
  const searchContent = textObjects
    .map((t) => t.text)
    .filter(Boolean)
    .join(' ');

  if (searchContent && !data.content) {
    await prisma.post.update({
      where: { id: post.id },
      data: { content: searchContent },
    });
  }

  this.triggerStoryTextObjectTranslation(post.id, textObjects);
}
```

**Étape 5 : Build TypeScript**
```bash
cd services/gateway && npm run build
```
Attendu : zéro erreur.

**Étape 6 : Commit**
```bash
git add services/gateway/src/services/PostService.ts
git commit -m "feat(gateway): triggerStoryTextObjectTranslation + content search index"
```

---

## Task 14 — ZMQ : type story_text_object_translation

**Fichiers :**
- Lire : `services/gateway/src/services/zmq-translation/ZmqTranslationClient.ts`
- Modifier : `services/gateway/src/services/zmq-translation/ZmqTranslationClient.ts`

**Étape 1 : Lire le fichier pour comprendre la structure**
```bash
grep -n "translateTo\|pushSocket\|send\|interface\|type " services/gateway/src/services/zmq-translation/ZmqTranslationClient.ts | head -40
```

**Étape 2 : Ajouter l'interface `TranslateTextObjectParams`**

Avant ou après les interfaces existantes :
```typescript
export interface TranslateTextObjectParams {
  postId: string;
  textObjectIndex: number;
  text: string;
  sourceLanguage: string;
  targetLanguages: string[];
}
```

**Étape 3 : Ajouter la méthode `translateTextObject`**

```typescript
translateTextObject(params: TranslateTextObjectParams): void {
  const metadata = JSON.stringify({
    type: 'story_text_object_translation',
    postId: params.postId,
    textObjectIndex: params.textObjectIndex,
    text: params.text,
    sourceLanguage: params.sourceLanguage,
    targetLanguages: params.targetLanguages,
  });

  this.pushSocket.send([metadata]);
}
```

**Étape 4 : Build TypeScript**
```bash
cd services/gateway && npm run build
```

**Étape 5 : Commit**
```bash
git add services/gateway/src/services/zmq-translation/ZmqTranslationClient.ts
git commit -m "feat(zmq): add translateTextObject for story textObjects translation"
```

---

## Task 15 — Gateway : handler réception traductions + Socket.IO post:story-effects-updated

**Fichiers :**
- Lire : `services/gateway/src/services/PostService.ts` ou le fichier qui gère les événements ZMQ entrants
- Lire : `packages/shared/types/socketio-events.ts`
- Modifier : fichier EventEmitter ZMQ entrant
- Modifier : `packages/shared/types/socketio-events.ts`

**Étape 1 : Trouver où les événements ZMQ entrants sont traités**
```bash
grep -rn "story_text_translation_completed\|zmqSub\|subSocket\|on.*translation" services/gateway/src/ | head -20
```

**Étape 2 : Ajouter `STORY_TRANSLATION_UPDATED` dans `SERVER_EVENTS`**

Dans `packages/shared/types/socketio-events.ts` :
```typescript
STORY_TRANSLATION_UPDATED: 'post:story-translation-updated',
```

**Étape 3 : Ajouter l'interface de données de l'événement**

```typescript
export interface StoryTranslationUpdatedEventData {
  postId: string;
  textObjectIndex: number;
  translations: Record<string, string>;
}
```

**Étape 4 : Ajouter l'entrée dans `ServerToClientEvents`**

```typescript
'post:story-translation-updated': (data: StoryTranslationUpdatedEventData) => void;
```

**Étape 5 : Ajouter le handler dans le listener ZMQ entrant**

```typescript
case 'story_text_object_translation_completed': {
  const { postId, textObjectIndex, translations } = parsedData as {
    postId: string;
    textObjectIndex: number;
    translations: Record<string, string>;
  };

  // Read-merge-write (Prisma Json? ne supporte pas dot-notation $set)
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { storyEffects: true, authorId: true },
  });
  if (!post?.storyEffects) break;

  const effects = post.storyEffects as Record<string, unknown>;
  const textObjects = (effects.textObjects as Array<Record<string, unknown>>) ?? [];

  if (textObjects[textObjectIndex]) {
    textObjects[textObjectIndex]['translations'] = translations;
    effects['textObjects'] = textObjects;
    await prisma.post.update({
      where: { id: postId },
      data: { storyEffects: effects },
    });
  }

  // Notifier le client iOS
  io.to(`feed:${post.authorId}`).emit('post:story-translation-updated', {
    postId,
    textObjectIndex,
    translations,
  });
  break;
}
```

**Étape 6 : Build shared + gateway**
```bash
cd packages/shared && npm run build
cd services/gateway && npm run build
```

**Étape 7 : Commit**
```bash
git add packages/shared/types/socketio-events.ts packages/shared/
git add services/gateway/src/
git commit -m "feat(gateway): handler story_text_object_translation_completed + post:story-effects-updated"
```

---

## Task 16 — iOS : WaveformGenerator actor

**Fichiers :**
- Créer : `packages/MeeshySDK/Sources/MeeshySDK/Audio/WaveformGenerator.swift`

**Contexte :** Extrait ~80 amplitudes normalisées d'un fichier audio local. Utilisé après upload audio pour peupler `StoryAudioPlayerObject.waveformSamples`. `actor` pour thread-safety (AVAssetReader n'est pas concurrency-safe).

**Étape 1 : Créer le fichier**

```swift
import AVFoundation

public actor WaveformGenerator {

    public static let shared = WaveformGenerator()
    private init() {}

    /// Extrait ~sampleCount amplitudes normalisées (0.0–1.0) depuis une URL audio locale.
    public func generateSamples(from url: URL, sampleCount: Int = 80) async throws -> [Float] {
        let asset = AVURLAsset(url: url)
        let duration = try await asset.load(.duration)
        guard duration.seconds > 0 else { return [] }

        guard let track = try await asset.loadTracks(withMediaType: .audio).first else {
            return []
        }

        let reader = try AVAssetReader(asset: asset)
        let outputSettings: [String: Any] = [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsFloatKey: false,
        ]
        let output = AVAssetReaderTrackOutput(track: track, outputSettings: outputSettings)
        reader.add(output)
        reader.startReading()

        var allSamples: [Float] = []
        while let buffer = output.copyNextSampleBuffer() {
            guard let blockBuffer = CMSampleBufferGetDataBuffer(buffer) else { continue }
            let length = CMBlockBufferGetDataLength(blockBuffer)
            var data = Data(count: length)
            data.withUnsafeMutableBytes { ptr in
                CMBlockBufferCopyDataBytes(blockBuffer, atOffset: 0,
                                           dataLength: length, destination: ptr.baseAddress!)
            }
            let samples = data.withUnsafeBytes { ptr -> [Float] in
                let int16Ptr = ptr.bindMemory(to: Int16.self)
                return int16Ptr.map { Float(abs($0)) / Float(Int16.max) }
            }
            allSamples.append(contentsOf: samples)
        }

        guard !allSamples.isEmpty else { return [] }

        // Réduire à sampleCount amplitudes (moyennes de buckets)
        let bucketSize = allSamples.count / sampleCount
        guard bucketSize > 0 else { return Array(allSamples.prefix(sampleCount)) }

        return (0..<sampleCount).map { i in
            let start = i * bucketSize
            let end = min(start + bucketSize, allSamples.count)
            let bucket = allSamples[start..<end]
            return bucket.reduce(0, +) / Float(bucket.count)
        }
    }
}
```

**Étape 2 : Build**
```bash
./apps/ios/meeshy.sh build
```
Attendu : succès.

**Étape 3 : Commit**
```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Audio/WaveformGenerator.swift
git commit -m "feat(sdk): WaveformGenerator actor — extract normalized amplitude samples"
```

---

## Task 17 — iOS : StoryAudioPlayerView (waveform player sur canvas)

**Fichiers :**
- Créer : `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryAudioPlayerView.swift`

**Contexte :** Composant SwiftUI draggable sur le canvas, affiche une waveform animée à partir des `waveformSamples`. Suit le pattern `StorySticker` pour la position normalisée.

**Étape 1 : Créer le fichier**

```swift
import SwiftUI
import AVKit

public struct StoryAudioPlayerView: View {
    @Binding public var audioObject: StoryAudioPlayerObject
    public let isEditing: Bool
    public let onDragEnd: () -> Void

    @State private var isPlaying = false
    @State private var playbackProgress: Double = 0
    @GestureState private var dragOffset = CGSize.zero

    public init(audioObject: Binding<StoryAudioPlayerObject>,
                isEditing: Bool = false,
                onDragEnd: @escaping () -> Void = {}) {
        self._audioObject = audioObject
        self.isEditing = isEditing
        self.onDragEnd = onDragEnd
    }

    public var body: some View {
        GeometryReader { geo in
            playerContent
                .position(
                    x: audioObject.x * geo.size.width + dragOffset.width,
                    y: audioObject.y * geo.size.height + dragOffset.height
                )
                .gesture(isEditing ? dragGesture(geo: geo) : nil)
        }
    }

    private var playerContent: some View {
        HStack(spacing: 8) {
            Button(action: togglePlayback) {
                Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.white)
            }
            .accessibilityLabel(isPlaying ? "Pause" : "Lire")

            waveformView
                .frame(width: 120, height: 32)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial, in: Capsule())
    }

    private var waveformView: some View {
        TimelineView(.animation(minimumInterval: 0.05)) { timeline in
            Canvas { ctx, size in
                let samples = audioObject.waveformSamples
                guard !samples.isEmpty else { return }
                let barWidth = size.width / CGFloat(samples.count)
                let centerY = size.height / 2

                for (i, sample) in samples.enumerated() {
                    let x = CGFloat(i) * barWidth + barWidth / 2
                    let height = max(2, CGFloat(sample) * size.height * 0.9)

                    // Barres jouées = blanc plein, non jouées = blanc 40%
                    let progress = isPlaying ? playbackProgress : 0
                    let isPlayed = Double(i) / Double(samples.count) < progress
                    let alpha: Double = isPlayed ? 1.0 : 0.4

                    // Animation légère sur les barres actives
                    let animOffset: CGFloat = isPlaying && isPlayed
                        ? CGFloat.random(in: -2...2) : 0

                    ctx.fill(
                        Path(CGRect(x: x - barWidth * 0.3,
                                    y: centerY - height / 2 + animOffset,
                                    width: barWidth * 0.6,
                                    height: height)),
                        with: .color(.white.opacity(alpha))
                    )
                }
            }
        }
    }

    private func dragGesture(geo: GeometryProxy) -> some Gesture {
        DragGesture()
            .updating($dragOffset) { value, state, _ in state = value.translation }
            .onEnded { value in
                audioObject.x = min(1, max(0, audioObject.x + value.translation.width / geo.size.width))
                audioObject.y = min(1, max(0, audioObject.y + value.translation.height / geo.size.height))
                onDragEnd()
            }
    }

    private func togglePlayback() {
        isPlaying.toggle()
        // TODO Task 20 : connecter à AVPlayer via StoryComposerView
    }
}
```

**Étape 2 : Build**
```bash
./apps/ios/meeshy.sh build
```

**Étape 3 : Commit**
```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryAudioPlayerView.swift
git commit -m "feat(ui): StoryAudioPlayerView — waveform canvas player component"
```

---

## Task 18 — iOS : DraggableMediaView (image/vidéo foreground)

**Fichiers :**
- Créer : `packages/MeeshySDK/Sources/MeeshyUI/Story/DraggableMediaView.swift`

**Contexte :** Composant draggable/pinchable pour les médias visuels en `placement: "foreground"`. Suit le pattern `StoryAudioPlayerView` pour la position normalisée. Les médias `placement: "background"` sont rendus directement comme fond de canvas (pas ce composant).

**Étape 1 : Créer le fichier**

```swift
import SwiftUI
import AVKit

public struct DraggableMediaView: View {
    @Binding public var mediaObject: StoryMediaObject
    public let image: UIImage?
    public let videoURL: URL?
    public let isEditing: Bool
    public let onDragEnd: () -> Void

    @GestureState private var gestureScale: CGFloat = 1.0
    @GestureState private var gestureRotation: Angle = .zero
    @GestureState private var dragOffset: CGSize = .zero

    public init(mediaObject: Binding<StoryMediaObject>,
                image: UIImage? = nil, videoURL: URL? = nil,
                isEditing: Bool = false, onDragEnd: @escaping () -> Void = {}) {
        self._mediaObject = mediaObject
        self.image = image; self.videoURL = videoURL
        self.isEditing = isEditing; self.onDragEnd = onDragEnd
    }

    public var body: some View {
        GeometryReader { geo in
            mediaContent
                .frame(width: 160, height: 160)
                .scaleEffect(mediaObject.scale * gestureScale)
                .rotationEffect(.radians(mediaObject.rotation) + gestureRotation)
                .position(
                    x: mediaObject.x * geo.size.width + dragOffset.width,
                    y: mediaObject.y * geo.size.height + dragOffset.height
                )
                .gesture(isEditing ? combinedGesture(geo: geo) : nil)
        }
    }

    @ViewBuilder
    private var mediaContent: some View {
        if let image {
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .clipShape(RoundedRectangle(cornerRadius: 8))
        } else if let videoURL {
            VideoPlayer(player: AVPlayer(url: videoURL))
                .clipShape(RoundedRectangle(cornerRadius: 8))
        }
    }

    private func combinedGesture(geo: GeometryProxy) -> some Gesture {
        let drag = DragGesture()
            .updating($dragOffset) { v, s, _ in s = v.translation }
            .onEnded { v in
                mediaObject.x = min(1, max(0, mediaObject.x + v.translation.width / geo.size.width))
                mediaObject.y = min(1, max(0, mediaObject.y + v.translation.height / geo.size.height))
                onDragEnd()
            }

        let pinch = MagnificationGesture()
            .updating($gestureScale) { v, s, _ in s = v }
            .onEnded { v in
                mediaObject.scale = min(4.0, max(0.3, mediaObject.scale * v))
                onDragEnd()
            }

        let rotation = RotationGesture()
            .updating($gestureRotation) { v, s, _ in s = v }
            .onEnded { v in
                mediaObject.rotation += v.radians
                onDragEnd()
            }

        return drag.simultaneously(with: pinch.simultaneously(with: rotation))
    }
}
```

**Étape 2 : Build**
```bash
./apps/ios/meeshy.sh build
```

**Étape 3 : Commit**
```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/DraggableMediaView.swift
git commit -m "feat(ui): DraggableMediaView — foreground image/video overlay on canvas"
```

---

## Task 19 — iOS : MediaPlacementSheet + AudioSourceSheet

**Fichiers :**
- Créer : `packages/MeeshySDK/Sources/MeeshyUI/Story/MediaPlacementSheet.swift`

**Contexte :** Deux bottom sheets présentés successivement lors de l'ajout d'un média. `MediaPlacementSheet` demande arrière-plan ou premier plan. `AudioSourceSheet` demande bibliothèque ou enregistrement (puis enchaîne sur `MediaPlacementSheet`).

**Étape 1 : Créer le fichier**

```swift
import SwiftUI

public enum MediaPlacement: String, Sendable {
    case background = "background"
    case foreground = "foreground"
}

public enum AudioSource: Sendable {
    case library
    case record
}

// MARK: - MediaPlacementSheet

public struct MediaPlacementSheet: View {
    public let mediaType: String           // "image" | "video" | "audio"
    public let onSelect: (MediaPlacement) -> Void
    @Environment(\.dismiss) private var dismiss

    public init(mediaType: String, onSelect: @escaping (MediaPlacement) -> Void) {
        self.mediaType = mediaType; self.onSelect = onSelect
    }

    public var body: some View {
        VStack(spacing: 0) {
            Text("Où placer ce \(mediaType) ?")
                .font(.headline)
                .padding(.top, 20)
                .padding(.bottom, 16)

            HStack(spacing: 16) {
                placementButton(placement: .background,
                                icon: "rectangle.fill",
                                label: "Arrière-plan",
                                subtitle: "Remplit la slide")

                placementButton(placement: .foreground,
                                icon: "square.on.square",
                                label: "Premier plan",
                                subtitle: "Élément draggable")
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
        }
        .presentationDetents([.height(160)])
        .presentationDragIndicator(.visible)
    }

    private func placementButton(placement: MediaPlacement,
                                  icon: String, label: String, subtitle: String) -> some View {
        Button {
            onSelect(placement)
            dismiss()
        } label: {
            VStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 28))
                    .foregroundColor(.primary)
                Text(label)
                    .font(.subheadline).fontWeight(.semibold)
                Text(subtitle)
                    .font(.caption).foregroundColor(.secondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
        }
        .accessibilityLabel("\(label) — \(subtitle)")
    }
}

// MARK: - AudioSourceSheet

public struct AudioSourceSheet: View {
    public let onSelect: (AudioSource) -> Void
    @Environment(\.dismiss) private var dismiss

    public init(onSelect: @escaping (AudioSource) -> Void) {
        self.onSelect = onSelect
    }

    public var body: some View {
        VStack(spacing: 0) {
            Text("Source audio")
                .font(.headline)
                .padding(.top, 20)
                .padding(.bottom, 16)

            HStack(spacing: 16) {
                sourceButton(source: .library,
                             icon: "folder.fill",
                             label: "Bibliothèque")

                sourceButton(source: .record,
                             icon: "mic.fill",
                             label: "Enregistrer")
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
        }
        .presentationDetents([.height(160)])
        .presentationDragIndicator(.visible)
    }

    private func sourceButton(source: AudioSource, icon: String, label: String) -> some View {
        Button {
            onSelect(source)
            dismiss()
        } label: {
            VStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 28))
                    .foregroundColor(.primary)
                Text(label)
                    .font(.subheadline).fontWeight(.semibold)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
        }
        .accessibilityLabel(label)
    }
}
```

**Étape 2 : Build**
```bash
./apps/ios/meeshy.sh build
```

**Étape 3 : Commit**
```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/MediaPlacementSheet.swift
git commit -m "feat(ui): MediaPlacementSheet + AudioSourceSheet — media placement selection"
```

---

## Task 20 — iOS : StoryComposerView — intégration média picker + mixage volume

**Fichiers :**
- Lire : `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift`
- Modifier : `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift`
- Modifier : `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasView.swift`

**Contexte :** Ajouter les boutons média dans la toolbar, le flow de sélection/placement, et les curseurs de volume dans un overlay au-dessus du canvas.

**Étape 1 : Lire la toolbar actuelle**
```bash
grep -n "toolbar\|PhotosPicker\|sheet\|volumeSlider\|mediaObject" \
  packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift | head -30
```

**Étape 2 : Ajouter les états nécessaires dans `StoryComposerView`**

```swift
// Media
@State private var showMediaPicker = false
@State private var showAudioSourceSheet = false
@State private var pendingMediaItem: PhotosPickerItem? = nil
@State private var showMediaPlacementSheet = false
@State private var pendingMediaType: String = "image"    // "image" | "video" | "audio"
@State private var pendingMediaURL: URL? = nil
@State private var pendingAudioSource: AudioSource? = nil

// Volume mixer
@State private var showVolumeMixer = false
```

**Étape 3 : Ajouter les boutons dans la toolbar**

Dans la section boutons de la toolbar (après le bouton dessiner ou text), ajouter :

```swift
// Bouton galerie/média visuel
PhotosPicker(selection: $pendingMediaItem, matching: .any(of: [.images, .videos])) {
    Image(systemName: "photo.on.rectangle")
        .font(.system(size: 22))
}
.accessibilityLabel("Ajouter image ou vidéo")
.onChange(of: pendingMediaItem) { item in
    guard item != nil else { return }
    pendingMediaType = "image"  // sera déterminé après chargement
    showMediaPlacementSheet = true
}

// Bouton audio
Button {
    showAudioSourceSheet = true
} label: {
    Image(systemName: "music.note")
        .font(.system(size: 22))
}
.accessibilityLabel("Ajouter audio")

// Bouton volume (visible seulement si médias audio/vidéo présents)
if hasAudioContent {
    Button {
        showVolumeMixer = true
    } label: {
        Image(systemName: "speaker.wave.2.fill")
            .font(.system(size: 22))
    }
    .accessibilityLabel("Mixage volume")
}
```

**Étape 4 : Ajouter la propriété calculée `hasAudioContent`**

```swift
private var hasAudioContent: Bool {
    let effects = currentSlideEffects
    let hasVideo = effects?.mediaObjects?.contains { $0.mediaType == "video" } ?? false
    let hasAudio = !(effects?.audioPlayerObjects ?? []).isEmpty
    return hasVideo || hasAudio
}
```

**Étape 5 : Ajouter les sheets**

Dans le `.sheet` de la vue principale :

```swift
.sheet(isPresented: $showAudioSourceSheet) {
    AudioSourceSheet { source in
        pendingAudioSource = source
        pendingMediaType = "audio"
        showMediaPlacementSheet = true
    }
}
.sheet(isPresented: $showMediaPlacementSheet) {
    MediaPlacementSheet(mediaType: pendingMediaType) { placement in
        handleMediaPlacement(placement)
    }
}
.sheet(isPresented: $showVolumeMixer) {
    VolumeMixerSheet(effects: $currentSlideEffectsBinding)
}
```

**Étape 6 : Ajouter `VolumeMixerSheet` (inline dans ce fichier ou fichier séparé)**

```swift
struct VolumeMixerSheet: View {
    @Binding var effects: StoryEffects?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Arrière-plan") {
                    if let _ = effects?.audioPlayerObjects?.first(where: { $0.placement == "background" }) {
                        Slider(value: backgroundVolumeBinding, in: 0...1,
                               label: { Text("Volume") })
                        .accessibilityLabel("Volume arrière-plan")
                    }
                }
                Section("Premier plan") {
                    if let _ = effects?.mediaObjects?.first(where: { $0.mediaType == "video" && $0.placement == "foreground" }) {
                        Slider(value: foregroundVideoVolumeBinding, in: 0...1,
                               label: { Text("Volume vidéo") })
                        .accessibilityLabel("Volume vidéo premier plan")
                    }
                    if let _ = effects?.audioPlayerObjects?.first(where: { $0.placement == "foreground" }) {
                        Slider(value: foregroundAudioVolumeBinding, in: 0...1,
                               label: { Text("Volume audio") })
                        .accessibilityLabel("Volume audio premier plan")
                    }
                }
            }
            .navigationTitle("Mixage")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("OK") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium])
    }

    private var backgroundVolumeBinding: Binding<Float> {
        Binding(
            get: { effects?.audioPlayerObjects?.first(where: { $0.placement == "background" })?.volume ?? 1.0 },
            set: { v in
                if let i = effects?.audioPlayerObjects?.firstIndex(where: { $0.placement == "background" }) {
                    effects?.audioPlayerObjects?[i].volume = v
                }
            }
        )
    }

    private var foregroundVideoVolumeBinding: Binding<Float> {
        Binding(
            get: { effects?.mediaObjects?.first(where: { $0.mediaType == "video" && $0.placement == "foreground" })?.volume ?? 1.0 },
            set: { v in
                if let i = effects?.mediaObjects?.firstIndex(where: { $0.mediaType == "video" && $0.placement == "foreground" }) {
                    effects?.mediaObjects?[i].volume = v
                }
            }
        )
    }

    private var foregroundAudioVolumeBinding: Binding<Float> {
        Binding(
            get: { effects?.audioPlayerObjects?.first(where: { $0.placement == "foreground" })?.volume ?? 1.0 },
            set: { v in
                if let i = effects?.audioPlayerObjects?.firstIndex(where: { $0.placement == "foreground" }) {
                    effects?.audioPlayerObjects?[i].volume = v
                }
            }
        )
    }
}
```

**Étape 7 : Implémenter `handleMediaPlacement`**

```swift
private func handleMediaPlacement(_ placement: MediaPlacement) {
    guard pendingMediaType != "audio" else {
        handleAudioPlacement(placement)
        return
    }
    // Traitement image/vidéo : charger le PhotosPickerItem
    guard let item = pendingMediaItem else { return }
    Task {
        if pendingMediaType == "video" {
            if let url = try? await loadVideoURL(from: item) {
                pendingMediaURL = url
                // Présenter VideoPreviewView (Task 6) puis créer StoryMediaObject
                await createMediaObject(url: url, type: "video", placement: placement)
            }
        } else {
            if let data = try? await item.loadTransferable(type: Data.self),
               let image = UIImage(data: data) {
                // Présenter ImageEditView (Task 5) puis créer StoryMediaObject
                await createMediaObjectFromImage(image: image, placement: placement)
            }
        }
        pendingMediaItem = nil
    }
}

private func handleAudioPlacement(_ placement: MediaPlacement) {
    guard let source = pendingAudioSource else { return }
    // TODO : présenter DocumentPicker (library) ou micro enregistrement selon `source`
    // Puis upload + WaveformGenerator + créer StoryAudioPlayerObject
    pendingAudioSource = nil
}

private func createMediaObject(url: URL, type: String, placement: MediaPlacement) async {
    // Upload via APIClient
    // Créer StoryMediaObject avec le postMediaId retourné
    // L'ajouter au slide courant : currentSlideEffects?.mediaObjects?.append(...)
}
```

**Étape 8 : Rendre `DraggableMediaView` et `StoryAudioPlayerView` dans `StoryCanvasView`**

Dans `StoryCanvasView`, après le rendu des stickers, ajouter :

```swift
// Médias foreground
ForEach($effects.mediaObjects ?? .constant([])) { $media in
    if media.placement == "foreground" {
        DraggableMediaView(
            mediaObject: $media,
            image: loadedImages[media.postMediaId],
            videoURL: loadedVideoURLs[media.postMediaId],
            isEditing: isEditing
        ) { /* onDragEnd : marquer draft dirty */ }
    }
}

// Players audio foreground
ForEach($effects.audioPlayerObjects ?? .constant([])) { $audio in
    if audio.placement == "foreground" {
        StoryAudioPlayerView(audioObject: $audio, isEditing: isEditing)
    }
}
```

**Étape 9 : Build**
```bash
./apps/ios/meeshy.sh build
```
Corriger les erreurs de compilation.

**Étape 10 : Commit**
```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasView.swift
git commit -m "feat(ui): media picker + placement + volume mixer in StoryComposerView"
```

---

## Task 21 — iOS : StoryCanvasReaderView — rendu médias + résolution langue textObjects

**Fichiers :**
- Lire : `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift`
- Modifier : `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift`

**Contexte :** Le reader affiche les stories. Il doit : (1) résoudre la langue des textObjects, (2) afficher les médias background/foreground, (3) afficher les players audio avec waveform, (4) jouer l'audio de fond automatiquement.

**Étape 1 : Lire le reader actuel**
```bash
grep -n "textObjects\|StoryTextObject\|backgroundAudio\|mediaObject\|audioPlayer" \
  packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift | head -30
```

**Étape 2 : Ajouter la résolution de langue pour textObjects**

```swift
private func resolvedText(for obj: StoryTextObject, userLang: String) -> String {
    obj.translations?[userLang]
        ?? obj.translations?["en"]
        ?? obj.content
}
```

Remplacer l'affichage direct `obj.content` par `resolvedText(for: obj, userLang: userPreferredLanguage)` dans le rendu des textObjects.

**Étape 3 : Ajouter le rendu des médias background**

Avant le canvas principal (en tant que fond), ajouter :

```swift
// Médias arrière-plan (image ou vidéo qui remplit la slide)
if let bgMedia = effects.mediaObjects?.first(where: { $0.placement == "background" }) {
    if bgMedia.mediaType == "image", let img = loadedImages[bgMedia.postMediaId] {
        Image(uiImage: img)
            .resizable()
            .scaledToFill()
            .clipped()
    } else if bgMedia.mediaType == "video", let url = loadedVideoURLs[bgMedia.postMediaId] {
        VideoPlayer(player: AVPlayer(url: url))
            .disabled(true)  // auto-play géré séparément
    }
}
```

**Étape 4 : Ajouter le rendu des médias foreground + players audio**

Après le canvas (en overlay) :

```swift
// Médias foreground
ForEach(effects.mediaObjects ?? []) { media in
    if media.placement == "foreground" {
        DraggableMediaView(
            mediaObject: .constant(media),
            image: loadedImages[media.postMediaId],
            videoURL: loadedVideoURLs[media.postMediaId],
            isEditing: false
        )
    }
}

// Players audio foreground
ForEach(effects.audioPlayerObjects ?? []) { audio in
    if audio.placement == "foreground" {
        StoryAudioPlayerView(audioObject: .constant(audio), isEditing: false)
    }
}
```

**Étape 5 : Auto-play audio de fond**

Résoudre l'audio par langue et démarrer à l'apparition :

```swift
private func resolvedBackgroundAudioPostMediaId(effects: StoryEffects, userLang: String) -> String? {
    let variant = effects.backgroundAudioVariants?.first { $0.language == userLang }
    return variant?.postMediaId ?? effects.backgroundAudioId
}
```

Dans `.onAppear` ou `.task` :

```swift
if let audioId = resolvedBackgroundAudioPostMediaId(effects: effects, userLang: userPreferredLanguage),
   let url = loadedAudioURLs[audioId] {
    let player = AVPlayer(url: url)
    player.volume = effects.backgroundAudioVolume ?? 1.0
    player.play()
    backgroundAudioPlayer = player
}
```

**Étape 6 : Écouter `post:story-effects-updated` depuis SocialSocketManager**

```swift
// Dans le ViewModel ou la vue qui gère les stories
SocialSocketManager.shared.storyTranslationUpdatedPublisher
    .receive(on: DispatchQueue.main)
    .sink { [weak self] update in
        guard update.postId == self?.currentPost?.id else { return }
        // Mettre à jour la story en cache
        self?.currentStoryEffects?.textObjects?[update.textObjectIndex].translations = update.translations
    }
    .store(in: &cancellables)
```

**Étape 7 : Build**
```bash
./apps/ios/meeshy.sh build
```
Corriger toutes les erreurs.

**Étape 8 : Commit**
```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift
git commit -m "feat(ui): StoryCanvasReaderView — media render + language resolution + background audio"
```
