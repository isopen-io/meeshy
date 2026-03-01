# Story Composer Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactorer `StoryComposerView` pour corriger le bug du panel UX, intégrer le strip de slides dans la top bar, ajouter le bouton ▶ (preview) + Publish multi-slides avec progression, et la persistence de brouillon.

**Architecture:** Patch Approach A — patcher `StoryComposerView` en place. Aucun nouveau fichier créé sauf pour l'extension `StorySlide.toPreviewStoryItem()`. La logique de boucle multi-slide (upload + publish) reste dans `StoryComposerView` via le callback `onPublishSlide`. L'interface de preview est gérée dans `StoryTrayView` (app) pour éviter le couplage SDK/App.

**Tech Stack:** SwiftUI, MeeshySDK (Swift Package), UserDefaults (draft), Combine, TusUploadManager (existant), MediaCompressor (existant)

---

## Contexte clé pour les subagents

### Fichiers principaux

| Fichier | Rôle |
|---------|------|
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift` | Vue principale — refactor complet |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StorySlideManager.swift` | Manager + `StorySlideCarousel` (ne PAS modifier, juste réutiliser) |
| `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` | `StorySlide`, `StoryItem`, `StoryEffects` |
| `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift` | Viewer — ajouter `isPreviewMode` |
| `apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift` | Point d'entrée — adapter les callbacks |
| `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift` | Ajouter `publishStorySingle()` |

### Architecture des callbacks (CRITIQUE)

`StoryComposerView` (SDK) ne peut PAS accéder à `StoryViewModel` (app). L'interface est :

```swift
// NOUVELLE signature de StoryComposerView
public struct StoryComposerView: View {
    // Remplace l'ancien onPublish: (StoryEffects, String?, UIImage?) -> Void
    public var onPublishSlide: (StorySlide, UIImage?) async throws -> Void
    // Nouveau callback pour preview — StoryTrayView présente StoryViewerView
    public var onPreview: ([StorySlide], [String: UIImage]) -> Void
    public var onDismiss: () -> Void
}
```

### État des slides

`StorySlideManager.slideImages: [String: UIImage]` stocke les images en mémoire (keyed par `slide.id`). Pour publier, `StoryComposerView` construit un snapshot des slides avec l'état actuel de l'éditeur :

```swift
private func allSlidesSnapshot() -> ([StorySlide], [String: UIImage]) {
    var slides = slideManager.slides
    // Sauvegarder l'état courant de l'éditeur dans le slide actif
    slides[slideManager.currentSlideIndex].content = text.isEmpty ? nil : text
    slides[slideManager.currentSlideIndex].effects = buildEffects()
    return (slides, slideManager.slideImages)
}
```

---

## Task 1: Refactoring topBar + slide strip

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift`

### Step 1: Ajouter les nouvelles @State vars

Après la ligne `@State private var activePanel: StoryComposerPanel = .none` (ligne ~67), ajouter :

```swift
// Preview + contextual menu
@State private var showPreview = false
@State private var visibility: String = "PUBLIC"
@State private var showContextMenu = false
// Dismiss alert
@State private var showDiscardAlert = false
// Multi-slide publish
@State private var isPublishingAll = false
@State private var publishProgressText: String? = nil
@State private var slidePublishError: String? = nil
@State private var slidePublishContinuation: CheckedContinuation<SlidePublishAction, Never>? = nil
```

Ajouter l'enum avant la struct :

```swift
public enum SlidePublishAction {
    case retry, skip, cancel
}
```

### Step 2: Changer l'interface publique

Remplacer les propriétés et init existants (lignes ~71-77) :

```swift
// AVANT:
public var onPublish: (StoryEffects, String?, UIImage?) -> Void
public var onDismiss: () -> Void

public init(onPublish: @escaping (StoryEffects, String?, UIImage?) -> Void,
            onDismiss: @escaping () -> Void) {
    self.onPublish = onPublish; self.onDismiss = onDismiss
}

// APRÈS:
public var onPublishSlide: (StorySlide, UIImage?) async throws -> Void
public var onPreview: ([StorySlide], [String: UIImage]) -> Void
public var onDismiss: () -> Void

public init(onPublishSlide: @escaping (StorySlide, UIImage?) async throws -> Void,
            onPreview: @escaping ([StorySlide], [String: UIImage]) -> Void,
            onDismiss: @escaping () -> Void) {
    self.onPublishSlide = onPublishSlide
    self.onPreview = onPreview
    self.onDismiss = onDismiss
}
```

### Step 3: Réécrire topBar

Remplacer toute la computed var `topBar` (lignes ~107-166) :

```swift
private var topBar: some View {
    HStack(spacing: 0) {
        // [✕] Dismiss
        Button {
            handleDismiss()
        } label: {
            Image(systemName: "xmark")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(.white)
                .frame(width: 32, height: 32)
                .background(Circle().fill(Color.black.opacity(0.4)))
        }
        .padding(.leading, 12)

        // Strip de slides scrollable
        slideStrip
            .frame(maxWidth: .infinity)

        // Séparateur visuel
        Rectangle()
            .fill(Color.white.opacity(0.2))
            .frame(width: 1, height: 24)
            .padding(.horizontal, 6)

        // [▶] Preview
        Button {
            let (slides, images) = allSlidesSnapshot()
            onPreview(slides, images)
        } label: {
            Image(systemName: "play.circle.fill")
                .font(.system(size: 22))
                .foregroundColor(.white.opacity(0.9))
        }

        // [Publish] ou [Publier X/N...]
        Button {
            publishAllSlides()
        } label: {
            Group {
                if let progress = publishProgressText {
                    HStack(spacing: 4) {
                        ProgressView()
                            .progressViewStyle(.circular)
                            .scaleEffect(0.7)
                            .tint(.white)
                        Text(progress)
                            .font(.system(size: 12, weight: .bold))
                    }
                } else {
                    HStack(spacing: 4) {
                        Image(systemName: "paperplane.fill")
                            .font(.system(size: 12))
                        Text("Publish")
                            .font(.system(size: 13, weight: .bold))
                    }
                }
            }
            .foregroundColor(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(
                Capsule().fill(
                    LinearGradient(
                        colors: [Color(hex: "FF2E63"), Color(hex: "E94057")],
                        startPoint: .leading, endPoint: .trailing
                    )
                )
            )
        }
        .disabled(isPublishingAll)
        .padding(.leading, 6)

        // [···] Menu contextuel
        Menu {
            Button { saveDraft() } label: {
                Label("Sauvegarder le brouillon", systemImage: "square.and.arrow.down")
            }
            Menu {
                Button { visibility = "PUBLIC" } label: {
                    Label("Public", systemImage: visibility == "PUBLIC" ? "checkmark" : "globe")
                }
                Button { visibility = "FRIENDS" } label: {
                    Label("Amis", systemImage: visibility == "FRIENDS" ? "checkmark" : "person.2")
                }
                Button { visibility = "PRIVATE" } label: {
                    Label("Privé", systemImage: visibility == "PRIVATE" ? "checkmark" : "lock")
                }
            } label: {
                Label("Visibilité", systemImage: "eye")
            }
            Divider()
            Button(role: .destructive) {
                slideManager.slides = [StorySlide()]
                slideManager.currentSlideIndex = 0
            } label: {
                Label("Supprimer tous les slides", systemImage: "trash")
            }
        } label: {
            Image(systemName: "ellipsis.circle")
                .font(.system(size: 20))
                .foregroundColor(.white.opacity(0.8))
                .frame(width: 32, height: 32)
        }
        .padding(.leading, 6)
        .padding(.trailing, 12)
    }
    .frame(height: 52)
    .background(Color.black.opacity(0.3))
    .alert("Quitter sans publier ?", isPresented: $showDiscardAlert) {
        Button("Sauvegarder") { saveDraft(); onDismiss() }
        Button("Quitter", role: .destructive) { clearDraft(); onDismiss() }
        Button("Annuler", role: .cancel) { }
    }
}
```

### Step 4: Ajouter la computed var `slideStrip`

Après `topBar`, ajouter :

```swift
private var slideStrip: some View {
    ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 6) {
            ForEach(Array(slideManager.slides.enumerated()), id: \.element.id) { index, slide in
                slideThumb(slide: slide, index: index)
            }
            // [+ Slide]
            if slideManager.canAddSlide {
                Button {
                    slideManager.addSlide()
                    HapticFeedback.medium()
                } label: {
                    RoundedRectangle(cornerRadius: 6)
                        .fill(Color.white.opacity(0.08))
                        .frame(width: 40, height: 52)
                        .overlay(
                            RoundedRectangle(cornerRadius: 6)
                                .stroke(Color.white.opacity(0.25),
                                        style: StrokeStyle(lineWidth: 1, dash: [4]))
                        )
                        .overlay(
                            Image(systemName: "plus")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(.white.opacity(0.5))
                        )
                }
                .accessibilityLabel("Ajouter un slide")
            }
        }
        .padding(.horizontal, 8)
    }
}

private func slideThumb(slide: StorySlide, index: Int) -> some View {
    let isSelected = slideManager.currentSlideIndex == index
    return Button {
        withAnimation(.spring(response: 0.25)) {
            slideManager.selectSlide(at: index)
        }
        HapticFeedback.light()
    } label: {
        ZStack {
            if let image = slideManager.slideImages[slide.id] {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else if let bg = slide.effects.background {
                Color(hex: bg)
            } else {
                Color(hex: "1A1A2E")
            }
        }
        .frame(width: 40, height: 52)
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .overlay(
            RoundedRectangle(cornerRadius: 6)
                .stroke(
                    isSelected ? Color(hex: "FF2E63") : Color.white.opacity(0.25),
                    lineWidth: isSelected ? 2 : 1
                )
        )
        .scaleEffect(isSelected ? 1.08 : 1.0)
        .animation(.spring(response: 0.2), value: isSelected)
    }
    .contextMenu {
        if slideManager.slides.count > 1 {
            Button(role: .destructive) {
                slideManager.removeSlide(at: index)
            } label: {
                Label("Supprimer", systemImage: "trash")
            }
        }
        Button {
            slideManager.duplicateSlide(at: index)
        } label: {
            Label("Dupliquer", systemImage: "doc.on.doc")
        }
    }
}
```

### Step 5: Nettoyer body — supprimer StorySlideCarousel conditionnel

Dans `body`, supprimer le bloc conditionnel :

```swift
// SUPPRIMER ces lignes:
if slideManager.slideCount > 1 {
    StorySlideCarousel(manager: slideManager) {
        slideManager.addSlide()
    }
}
```

`StorySlideCarousel` n'est plus utilisé dans `StoryComposerView` (le strip est intégré dans `topBar`).

### Step 6: Ajouter `allSlidesSnapshot()` dans MARK: - Actions

```swift
private func allSlidesSnapshot() -> ([StorySlide], [String: UIImage]) {
    var slides = slideManager.slides
    let idx = slideManager.currentSlideIndex
    guard idx < slides.count else { return (slides, slideManager.slideImages) }
    slides[idx].content = text.isEmpty ? nil : text
    slides[idx].effects = buildEffects()
    return (slides, slideManager.slideImages)
}
```

### Step 7: Ajouter `handleDismiss()`

```swift
private func handleDismiss() {
    let hasContent = slideManager.slides.contains {
        $0.content != nil || slideManager.slideImages[$0.id] != nil ||
        $0.effects.background != nil
    }
    if hasContent {
        showDiscardAlert = true
    } else {
        clearDraft()
        onDismiss()
    }
}
```

### Step 8: Build + commit

```bash
cd /Users/smpceo/Documents/v2_meeshy
./apps/ios/meeshy.sh build
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift
git commit -m "feat(composer): topBar redesign with slide strip, preview, publish, context menu"
```

Vérifier: build sans erreur. Les warnings sont tolérés pour `onPublish` non encore utilisé (sera corrigé dans Task 4).

---

## Task 2: Multi-slide publish + gestion d'erreur

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift`

### Step 1: Ajouter publishAllSlides() dans MARK: - Actions

```swift
private func publishAllSlides() {
    Task {
        let (slides, images) = allSlidesSnapshot()
        isPublishingAll = true

        var index = 0
        while index < slides.count {
            let slide = slides[index]
            let image = images[slide.id]
            publishProgressText = "Publier \(index + 1)/\(slides.count)..."

            var retrying = true
            while retrying {
                do {
                    try await onPublishSlide(slide, image)
                    retrying = false
                    index += 1
                } catch {
                    let action = await withCheckedContinuation { continuation in
                        slidePublishContinuation = continuation
                        slidePublishError = "Erreur slide \(index + 1)/\(slides.count) : \(error.localizedDescription)"
                    }
                    slidePublishContinuation = nil
                    slidePublishError = nil
                    switch action {
                    case .retry: break // retrying reste true
                    case .skip: retrying = false; index += 1
                    case .cancel:
                        isPublishingAll = false
                        publishProgressText = nil
                        return
                    }
                }
            }
        }

        clearDraft()
        isPublishingAll = false
        publishProgressText = nil
        HapticFeedback.success()
        onDismiss()
    }
}
```

### Step 2: Ajouter l'Alert d'erreur dans body

Dans `.photosPicker(...)` et `.onChange(...)` existants, ajouter après :

```swift
.alert("Erreur de publication", isPresented: .constant(slidePublishError != nil)) {
    Button("Réessayer") {
        slidePublishContinuation?.resume(returning: .retry)
    }
    Button("Ignorer") {
        slidePublishContinuation?.resume(returning: .skip)
    }
    Button("Annuler tout", role: .destructive) {
        slidePublishContinuation?.resume(returning: .cancel)
    }
} message: {
    Text(slidePublishError ?? "")
}
```

### Step 3: Build + commit

```bash
./apps/ios/meeshy.sh build
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift
git commit -m "feat(composer): multi-slide sequential publish with retry/skip/cancel error handling"
```

---

## Task 3: Canvas dismiss overlay + panel constraints

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift`

### Step 1: Modifier canvasArea pour ajouter overlay transparent

Remplacer la computed var `canvasArea` :

```swift
private var canvasArea: some View {
    ZStack {
        StoryCanvasView(
            text: $text,
            textStyle: $textStyle,
            textColor: $textColor,
            textSize: $textSize,
            textBgEnabled: $textBgEnabled,
            textAlignment: $textAlignment,
            textPosition: $textPosition,
            stickerObjects: $stickerObjects,
            selectedFilter: $selectedFilter,
            drawingData: $drawingData,
            isDrawingActive: $isDrawingActive,
            backgroundColor: $backgroundColor,
            selectedImage: $selectedImage
        )

        // Overlay transparent : ferme le panel actif si on tape le canvas
        if activePanel != .none {
            Color.clear
                .contentShape(Rectangle())
                .onTapGesture {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        activePanel = .none
                        isDrawingActive = false
                    }
                }
        }
    }
    .clipShape(RoundedRectangle(cornerRadius: 16))
    .padding(.horizontal, 8)
}
```

### Step 2: Clamper activeToolPanel

Wrapper `activeToolPanel` dans un container avec max height :

Dans `body`, remplacer `activeToolPanel` par :

```swift
activeToolPanel
    .frame(maxWidth: UIScreen.main.bounds.width)
    .frame(maxHeight: 200)
    .clipped()
```

**Note:** `StickerPickerView` est actuellement `.frame(height: 320)` dans le case `.stickers:`. Ce frame doit être supprimé de `activeToolPanel` car le container limite à 200pt. Retirer `.frame(height: 320)` du `case .stickers:`.

### Step 3: Corriger case .stickers dans activeToolPanel

```swift
// AVANT:
case .stickers:
    StickerPickerView { emoji in ... }
    .frame(height: 320)
    .transition(...)

// APRÈS:
case .stickers:
    StickerPickerView { emoji in ... }
    .transition(...)
// Le container activeToolPanel est déjà clampé à 200pt max.
```

### Step 4: Build + commit

```bash
./apps/ios/meeshy.sh build
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift
git commit -m "fix(composer): canvas tap-outside dismisses active panel, panel height clamped to 200pt"
```

---

## Task 4: Preview mode (▶ Play)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift`
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift`

### Step 1: StoryModels.swift — extension toPreviewStoryItem

Après le `// MARK: - Story Group` (ligne ~391), ajouter :

```swift
// MARK: - StorySlide Preview Conversion

extension StorySlide {
    /// Convertit un StorySlide (local, non encore publié) en StoryItem pour la preview.
    /// Les images locales (non uploadées) ne sont pas incluses dans media.
    public func toPreviewStoryItem() -> StoryItem {
        StoryItem(
            id: id,
            content: content,
            media: mediaURL.map { url in
                [FeedMedia(id: id, type: .image, url: url,
                           thumbnailColor: "4ECDC4", width: nil, height: nil)]
            } ?? [],
            storyEffects: effects,
            createdAt: Date(),
            expiresAt: Calendar.current.date(byAdding: .hour, value: 21, to: Date()),
            isViewed: false
        )
    }
}
```

### Step 2: StoryViewerView.swift — ajouter isPreviewMode

Après `var onReplyToStory: ((ReplyContext) -> Void)? = nil` (ligne ~22), ajouter :

```swift
var isPreviewMode: Bool = false
```

### Step 3: StoryViewerView.swift — bouton ✕ en preview mode

Trouver le body ou la zone des contrôles overlay. Chercher le ZStack principal. Ajouter en overlay :

```swift
// Bouton ✕ uniquement en preview mode
if isPreviewMode {
    VStack {
        HStack {
            Button {
                isPresented = false
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(Color.black.opacity(0.5)))
            }
            .padding(.leading, 16)
            .padding(.top, 16)
            Spacer()
        }
        Spacer()
    }
}
```

**Note :** Ce bouton doit être positionné dans le ZStack principal de StoryViewerView. Chercher `// MARK: - Body` et le ZStack correspondant dans ce fichier. S'il y a plusieurs fichiers d'extension (StoryViewerView+Controls.swift, etc.), chercher le fichier approprié.

### Step 4: StoryViewerView — auto-dismiss en fin de preview

Trouver la logique du timer qui avance les stories (chercher `timerCancellable` ou `advanceToNextStory()`). Quand `isPreviewMode` est true et qu'on essaie d'avancer après le dernier groupe/story, fermer au lieu d'avancer.

Chercher la fonction qui gère "fin de story" / "nextStory" / "fin du dernier groupe". Ajouter en début :

```swift
// Si preview mode et dernière story du dernier groupe → auto-dismiss
if isPreviewMode && currentGroupIndex >= groups.count - 1
   && currentStoryIndex >= currentStories.count - 1 {
    isPresented = false
    return
}
```

### Step 5: StoryViewModel.swift — ajouter publishStorySingle

Après `publishStory()` (ligne ~102 à ~177), ajouter une version qui throw :

```swift
// MARK: - Publish Single Story (throws)

func publishStorySingle(effects: StoryEffects, content: String?, image: UIImage?) async throws {
    var uploadResult: TusUploadResult? = nil

    if let image {
        let serverOrigin = MeeshyConfig.shared.serverOrigin
        guard let baseURL = URL(string: serverOrigin),
              let token = APIClient.shared.authToken else {
            throw URLError(.userAuthenticationRequired)
        }

        let compressed = await MediaCompressor.shared.compressImage(image)
        let fileName = "image_\(UUID().uuidString).\(compressed.fileExtension)"
        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
        try compressed.data.write(to: tempURL)
        defer { try? FileManager.default.removeItem(at: tempURL) }

        let uploader = TusUploadManager(baseURL: baseURL)
        uploadResult = try await uploader.uploadFile(
            fileURL: tempURL, mimeType: compressed.mimeType,
            token: token, uploadContext: "story"
        )
    }

    let post = try await postService.createStory(
        content: content,
        storyEffects: effects,
        visibility: "PUBLIC",
        mediaIds: uploadResult.map { [$0.id] }
    )

    // Update local state
    let media: [FeedMedia]
    if let uploaded = uploadResult {
        media = [FeedMedia(id: uploaded.id, type: .image, url: uploaded.fileUrl,
                           thumbnailColor: "4ECDC4", width: uploaded.width, height: uploaded.height)]
    } else {
        media = (post.media ?? []).map { m in
            FeedMedia(id: m.id, type: m.mediaType, url: m.fileUrl, thumbnailColor: "4ECDC4",
                      width: m.width, height: m.height, duration: m.duration.map { $0 / 1000 })
        }
    }
    let newItem = StoryItem(id: post.id, content: post.content, media: media,
                             storyEffects: effects, createdAt: post.createdAt, isViewed: true)

    if let idx = storyGroups.firstIndex(where: { $0.id == post.author.id }) {
        var updated = storyGroups[idx].stories
        updated.append(newItem)
        storyGroups[idx] = StoryGroup(
            id: storyGroups[idx].id,
            username: storyGroups[idx].username,
            avatarColor: storyGroups[idx].avatarColor,
            avatarURL: storyGroups[idx].avatarURL,
            stories: updated
        )
    } else {
        storyGroups.insert(StoryGroup(
            id: post.author.id,
            username: post.author.name,
            avatarColor: DynamicColorGenerator.colorForName(post.author.name),
            avatarURL: post.author.avatar ?? post.author.avatarUrl,
            stories: [newItem]
        ), at: 0)
    }
}
```

### Step 6: StoryTrayView.swift — adapter les callbacks + preview fullscreenCover

Lire `StoryTrayView.swift` au complet avant de modifier (au moins jusqu'à la ligne 100).

Ajouter dans `StoryTrayView` :

```swift
// Nouvelles @State pour la preview
@State private var previewSlides: [StorySlide] = []
@State private var previewImages: [String: UIImage] = [:]
@State private var showStoryPreview = false
```

Modifier le `fullscreenCover(isPresented: $viewModel.showStoryComposer)` :

```swift
.fullscreenCover(isPresented: $viewModel.showStoryComposer) {
    StoryComposerView(
        onPublishSlide: { slide, image in
            try await viewModel.publishStorySingle(
                effects: slide.effects,
                content: slide.content,
                image: image
            )
        },
        onPreview: { slides, images in
            previewSlides = slides
            previewImages = images
            showStoryPreview = true
        },
        onDismiss: {
            viewModel.showStoryComposer = false
        }
    )
}
.fullscreenCover(isPresented: $showStoryPreview) {
    let items = previewSlides.map { $0.toPreviewStoryItem() }
    let group = StoryGroup(
        id: "preview",
        username: "Aperçu",
        avatarColor: "FF2E63",
        stories: items
    )
    StoryViewerView(
        viewModel: viewModel,
        groups: [group],
        currentGroupIndex: 0,
        isPresented: $showStoryPreview,
        isPreviewMode: true
    )
}
```

### Step 7: Build + commit

```bash
./apps/ios/meeshy.sh build
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift
git add apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift
git add apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift
git add apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift
git commit -m "feat(composer): preview mode with StoryViewerView, publishStorySingle throws"
```

---

## Task 5: Draft persistence

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift`

### Step 1: Ajouter StoryComposerDraft struct et helpers

Avant la struct `StoryComposerView`, ajouter :

```swift
// MARK: - Story Composer Draft

struct StoryComposerDraft: Codable {
    let slides: [StorySlide]
    let visibilityPreference: String

    static let userDefaultsKey = "storyComposerDraft"
}
```

### Step 2: Ajouter les méthodes draft dans StoryComposerView

Dans `// MARK: - Actions` :

```swift
private func saveDraft() {
    let (slides, _) = allSlidesSnapshot()
    let draft = StoryComposerDraft(slides: slides, visibilityPreference: visibility)
    if let data = try? JSONEncoder().encode(draft) {
        UserDefaults.standard.set(data, forKey: StoryComposerDraft.userDefaultsKey)
    }
    HapticFeedback.light()
}

private func loadDraft() -> StoryComposerDraft? {
    guard let data = UserDefaults.standard.data(forKey: StoryComposerDraft.userDefaultsKey),
          let draft = try? JSONDecoder().decode(StoryComposerDraft.self, from: data) else {
        return nil
    }
    return draft
}

private func clearDraft() {
    UserDefaults.standard.removeObject(forKey: StoryComposerDraft.userDefaultsKey)
}

private func applyDraft(_ draft: StoryComposerDraft) {
    slideManager.slides = draft.slides.isEmpty ? [StorySlide()] : draft.slides
    slideManager.currentSlideIndex = 0
    visibility = draft.visibilityPreference
    // Restore editor state from first slide
    if let first = slideManager.slides.first {
        text = first.content ?? ""
        if let bg = first.effects.background {
            backgroundColor = Color(hex: bg)
        }
    }
}
```

### Step 3: Ajouter @State pour Alert de restauration

Après les autres @State vars :

```swift
@State private var showRestoreDraftAlert = false
@State private var pendingDraft: StoryComposerDraft? = nil
```

### Step 4: Connecter onAppear et Alert dans body

Dans `body`, après `.statusBarHidden()`, ajouter :

```swift
.onAppear {
    if let draft = loadDraft() {
        pendingDraft = draft
        showRestoreDraftAlert = true
    }
}
.alert("Reprendre votre story ?", isPresented: $showRestoreDraftAlert) {
    Button("Reprendre") {
        if let draft = pendingDraft {
            applyDraft(draft)
        }
        pendingDraft = nil
    }
    Button("Ignorer", role: .destructive) {
        clearDraft()
        pendingDraft = nil
    }
} message: {
    Text("Vous avez un brouillon non publié.")
}
```

### Step 5: Build + commit final

```bash
./apps/ios/meeshy.sh build
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift
git commit -m "feat(composer): draft persistence via UserDefaults with restore alert on open"
```

---

## Verification finale

Après toutes les tâches, tester manuellement dans le simulateur :

1. **Slide strip** : Créer 3 slides via [+ Slide], vérifier la navigation par tap dans le strip
2. **Panel dismiss** : Ouvrir le panneau Text, taper le canvas → le panneau se ferme
3. **Panel switch** : Ouvrir Text puis taper Stickers → basculement direct sans passer par .none
4. **Panel height** : Vérifier que StickerPickerView ne déborde pas hors des 200pt
5. **Preview** : Tapper ▶, vérifier StoryViewerView avec 3 slides, auto-dismiss à la fin
6. **Publish** : Tapper Publish, vérifier le texte "Publier 1/3...", "Publier 2/3...", etc.
7. **Draft** : [···] → Sauvegarder, relancer le composer → Alert de restauration → Reprendre
8. **Dismiss avec contenu** : Ajouter du texte, tapper ✕ → Alert "Quitter sans publier ?"

```bash
./apps/ios/meeshy.sh run
```

---

## Notes pour les subagents

- **Ne PAS modifier** `StorySlideManager.swift` ni `StorySlideCarousel` (la nouvelle `slideStrip` dans `StoryComposerView` les remplace dans la top bar, mais `StorySlideCarousel` peut rester dans le fichier pour usage futur).
- **Ne PAS créer de nouveaux fichiers** — toutes les modifications sont dans les fichiers existants.
- **Build après chaque tâche** avec `./apps/ios/meeshy.sh build` depuis `/Users/smpceo/Documents/v2_meeshy`.
- Si `StoryViewerView` est éclaté en plusieurs fichiers extension (`StoryViewerView+Controls.swift`, etc.), chercher l'overlay principal avec `Glob "**/*StoryViewer*.swift"` pour trouver le bon fichier à modifier.
- La continuation `withCheckedContinuation` est dans `Foundation`. Pas d'import supplémentaire requis.
- `@MainActor` est déjà sur `StoryViewModel`. `publishStorySingle` doit être marqué `@MainActor` aussi.
