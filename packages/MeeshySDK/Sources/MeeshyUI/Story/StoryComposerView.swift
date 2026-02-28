import SwiftUI
import PhotosUI
import MeeshySDK

// MARK: - Story Composer Active Panel

public enum StoryComposerPanel: Equatable {
    case none
    case text
    case stickers
    case drawing
    case filter
    case audio
    case background
    case transition
}

// MARK: - Story Background Picker Palette

public enum StoryBackgroundPalette {
    public static let colors: [String] = [
        "0F0C29", "302B63", "24243E", "1A1A2E", "16213E",
        "FF2E63", "E94057", "F27121", "F8B500", "2ECC71",
        "08D9D6", "3498DB", "9B59B6", "45B7D1", "FF6B6B",
        "000000", "FFFFFF"
    ]

    public static let gradients: [(String, String)] = [
        ("FF2E63", "08D9D6"),
        ("9B59B6", "FF6B6B"),
        ("F8B500", "FF2E63"),
        ("0F0C29", "302B63"),
        ("1A1A2E", "E94057"),
        ("2ECC71", "3498DB"),
    ]
}

// MARK: - Story Composer Draft

struct StoryComposerDraft: Codable {
    let slides: [StorySlide]
    let visibilityPreference: String

    static let userDefaultsKey = "storyComposerDraft"
}

// MARK: - Slide Publish Action

public enum SlidePublishAction {
    case retry, skip, cancel
}

// MARK: - Story Composer View

public struct StoryComposerView: View {
    @StateObject private var slideManager = StorySlideManager()

    @State private var text = ""
    @State private var textStyle: StoryTextStyle = .bold
    @State private var textColor: Color = .white
    @State private var textSize: CGFloat = 28
    @State private var textBgEnabled = false
    @State private var textAlignment: TextAlignment = .center
    @State private var textPosition: StoryTextPosition = .center

    @State private var stickerObjects: [StorySticker] = []
    @State private var selectedFilter: StoryFilter? = nil
    @State private var drawingData: Data? = nil
    @State private var isDrawingActive = false
    @State private var backgroundColor: Color = Color(hex: "0F0C29")
    @State private var selectedImage: UIImage? = nil

    // Audio — sera remplacé par StoryAudioPanel (Phase 2c)
    @State private var selectedAudioId: String? = nil
    @State private var selectedAudioTitle: String? = nil
    @State private var audioVolume: Float = 0.7
    @State private var audioTrimStart: TimeInterval = 0

    @State private var openingEffect: StoryTransitionEffect? = nil
    @State private var closingEffect: StoryTransitionEffect? = nil

    @State private var activePanel: StoryComposerPanel = .none
    @State private var showPhotoPicker = false
    @State private var photoPickerItem: PhotosPickerItem? = nil
    @State private var showRestoreDraftAlert = false
    @State private var pendingDraft: StoryComposerDraft? = nil

    // Preview + contextual menu
    @State private var showPreview = false
    @State private var visibility: String = "PUBLIC"
    // Dismiss alert
    @State private var showDiscardAlert = false
    // Multi-slide publish (seront utilisées dans Task 2)
    @State private var isPublishingAll = false
    @State private var publishProgressText: String? = nil
    @State private var slidePublishError: String? = nil
    @State private var slidePublishContinuation: CheckedContinuation<SlidePublishAction, Never>? = nil
    @State private var showPublishError = false
    @State private var publishTask: Task<Void, Never>? = nil

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

    public var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 0) {
                topBar
                canvasArea
                if !isDrawingActive {
                    toolBar
                    activeToolPanel
                        .frame(maxHeight: 200)
                        .clipped()
                }
            }
        }
        .photosPicker(isPresented: $showPhotoPicker, selection: $photoPickerItem,
                      matching: .any(of: [.images, .videos]))
        .onChange(of: photoPickerItem) { newItem in
            loadPhoto(from: newItem)
        }
        .alert("Erreur de publication", isPresented: $showPublishError) {
            Button("Réessayer") {
                let cont = slidePublishContinuation
                slidePublishContinuation = nil
                cont?.resume(returning: .retry)
            }
            Button("Ignorer", role: .cancel) {
                let cont = slidePublishContinuation
                slidePublishContinuation = nil
                cont?.resume(returning: .skip)
            }
            Button("Annuler tout", role: .destructive) {
                let cont = slidePublishContinuation
                slidePublishContinuation = nil
                cont?.resume(returning: .cancel)
            }
        } message: {
            Text(slidePublishError ?? "")
        }
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
            Button("Effacer le brouillon", role: .destructive) {
                clearDraft()
                pendingDraft = nil
            }
        } message: {
            Text("Vous avez un brouillon non publié.")
        }
        .statusBarHidden()
    }

    // MARK: - Top Bar

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
            Button("Quitter", role: .destructive) { cancelPublishIfNeeded(); clearDraft(); onDismiss() }
            Button("Annuler", role: .cancel) { }
        }
    }

    // MARK: - Slide Strip

    private var slideStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(Array(slideManager.slides.enumerated()), id: \.element.id) { index, slide in
                    slideThumb(slide: slide, index: index)
                }
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
            let currentIdx = slideManager.currentSlideIndex
            if currentIdx < slideManager.slides.count {
                slideManager.slides[currentIdx].content = text.isEmpty ? nil : text
                slideManager.slides[currentIdx].effects = buildEffects()
            }
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

    // MARK: - Canvas Area

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

    // MARK: - Tool Bar

    private var toolBar: some View {
        HStack(spacing: 0) {
            toolButton(icon: "photo.on.rectangle", label: "Photo", panel: nil, action: { showPhotoPicker = true })
            toolButton(icon: "textformat", label: "Text", panel: .text)
            toolButton(icon: "face.smiling", label: "Stickers", panel: .stickers)
            toolButton(icon: "pencil.tip", label: "Draw", panel: .drawing)
            toolButton(icon: "camera.filters", label: "Filter", panel: .filter)
            toolButton(icon: "music.note", label: "Audio", panel: .audio)
            toolButton(icon: "paintpalette", label: "BG", panel: .background)
            toolButton(icon: "sparkles", label: "Effet", panel: .transition)
        }
        .padding(.vertical, 8)
        .background(Color.black.opacity(0.3))
    }

    private func toolButton(icon: String, label: String, panel: StoryComposerPanel?, action: (() -> Void)? = nil) -> some View {
        let isActive = panel != nil && activePanel == panel
        return Button {
            if let action {
                action()
            } else if let panel {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    if activePanel == panel {
                        activePanel = .none
                        if panel == .drawing { isDrawingActive = false }
                    } else {
                        activePanel = panel
                        if panel == .drawing { isDrawingActive = true }
                        else { isDrawingActive = false }
                    }
                }
            }
            HapticFeedback.light()
        } label: {
            VStack(spacing: 3) {
                Image(systemName: icon)
                    .font(.system(size: 18, weight: .medium))
                    .foregroundColor(isActive ? Color(hex: "FF2E63") : .white.opacity(0.6))
                Text(label)
                    .font(.system(size: 9, weight: .medium))
                    .foregroundColor(isActive ? Color(hex: "FF2E63") : .white.opacity(0.4))
            }
            .frame(maxWidth: .infinity)
        }
        .accessibilityLabel(label)
    }

    // MARK: - Active Tool Panel

    @ViewBuilder
    private var activeToolPanel: some View {
        switch activePanel {
        case .text:
            StoryTextEditorView(
                text: $text, textStyle: $textStyle, textColor: $textColor,
                textSize: $textSize, textBgEnabled: $textBgEnabled, textAlignment: $textAlignment
            )
            .padding(.bottom, 8)
            .transition(.move(edge: .bottom).combined(with: .opacity))

        case .stickers:
            StickerPickerView { emoji in
                let sticker = StorySticker(emoji: emoji, x: 0.5, y: 0.4)
                stickerObjects.append(sticker)
                HapticFeedback.medium()
            }
            .transition(.move(edge: .bottom).combined(with: .opacity))

        case .drawing:
            EmptyView()

        case .filter:
            StoryFilterPicker(selectedFilter: $selectedFilter)
                .padding(.vertical, 12)
                .transition(.move(edge: .bottom).combined(with: .opacity))

        case .audio:
            StoryAudioPanel(
                selectedAudioId: $selectedAudioId,
                selectedAudioTitle: $selectedAudioTitle,
                audioVolume: $audioVolume
            )
            .transition(.move(edge: .bottom).combined(with: .opacity))

        case .background:
            backgroundPicker
                .transition(.move(edge: .bottom).combined(with: .opacity))

        case .transition:
            transitionPicker
                .transition(.move(edge: .bottom).combined(with: .opacity))

        case .none:
            EmptyView()
        }
    }

    // MARK: - Background Picker

    private var backgroundPicker: some View {
        VStack(spacing: 12) {
            Text("Background")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(.white.opacity(0.7))

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(StoryBackgroundPalette.colors, id: \.self) { hex in
                        Button {
                            withAnimation(.spring(response: 0.2)) {
                                backgroundColor = Color(hex: hex)
                                selectedImage = nil
                            }
                            HapticFeedback.light()
                        } label: {
                            Circle()
                                .fill(Color(hex: hex))
                                .frame(width: 36, height: 36)
                                .overlay(
                                    Circle()
                                        .stroke(Color.white, lineWidth: backgroundColor == Color(hex: hex) && selectedImage == nil ? 2.5 : 0)
                                        .padding(1)
                                )
                        }
                    }
                }
                .padding(.horizontal, 16)
                .frame(minWidth: 0)
            }
            .frame(maxWidth: .infinity)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(StoryBackgroundPalette.gradients.indices, id: \.self) { idx in
                        let grad = StoryBackgroundPalette.gradients[idx]
                        Button {
                            withAnimation(.spring(response: 0.2)) {
                                backgroundColor = Color(hex: grad.0)
                                selectedImage = nil
                            }
                            HapticFeedback.light()
                        } label: {
                            RoundedRectangle(cornerRadius: 8)
                                .fill(
                                    LinearGradient(
                                        colors: [Color(hex: grad.0), Color(hex: grad.1)],
                                        startPoint: .topLeading, endPoint: .bottomTrailing
                                    )
                                )
                                .frame(width: 56, height: 36)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .frame(minWidth: 0)
            }
            .frame(maxWidth: .infinity)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(Color.black.opacity(0.3))
    }

    // MARK: - Transition Picker

    private var transitionPicker: some View {
        VStack(spacing: 12) {
            Text("Effet d'ouverture")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.white.opacity(0.6))

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    effectButton(effect: nil, label: "Aucun", icon: "minus.circle", isOpening: true)
                    ForEach(StoryTransitionEffect.allCases, id: \.self) { effect in
                        effectButton(effect: effect, label: effect.label, icon: effect.iconName, isOpening: true)
                    }
                }
                .padding(.horizontal, 2)
            }

            Text("Effet de fermeture")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.white.opacity(0.6))

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    effectButton(effect: nil, label: "Aucun", icon: "minus.circle", isOpening: false)
                    ForEach(StoryTransitionEffect.allCases, id: \.self) { effect in
                        effectButton(effect: effect, label: effect.label, icon: effect.iconName, isOpening: false)
                    }
                }
                .padding(.horizontal, 2)
            }
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 16)
    }

    private func effectButton(effect: StoryTransitionEffect?, label: String, icon: String, isOpening: Bool) -> some View {
        let isSelected = isOpening ? (openingEffect == effect) : (closingEffect == effect)
        return Button {
            withAnimation(.spring(response: 0.25)) {
                if isOpening { openingEffect = effect } else { closingEffect = effect }
            }
            HapticFeedback.light()
        } label: {
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 20))
                    .foregroundColor(isSelected ? Color(hex: "FF2E63") : .white.opacity(0.6))
                Text(label)
                    .font(.system(size: 9, weight: .medium))
                    .foregroundColor(isSelected ? Color(hex: "FF2E63") : .white.opacity(0.4))
            }
            .frame(width: 60, height: 54)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(isSelected ? Color(hex: "FF2E63").opacity(0.15) : Color.white.opacity(0.06))
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(isSelected ? Color(hex: "FF2E63").opacity(0.5) : Color.clear, lineWidth: 1)
                    )
            )
        }
        .accessibilityLabel(label)
    }

    // MARK: - Actions

    private func loadPhoto(from item: PhotosPickerItem?) {
        guard let item else { return }
        Task {
            if let data = try? await item.loadTransferable(type: Data.self),
               let image = UIImage(data: data) {
                selectedImage = image
                slideManager.setImage(image, for: slideManager.currentSlide.id)
            }
        }
    }

    private func allSlidesSnapshot() -> ([StorySlide], [String: UIImage]) {
        var slides = slideManager.slides
        let idx = slideManager.currentSlideIndex
        guard idx < slides.count else { return (slides, slideManager.slideImages) }
        slides[idx].content = text.isEmpty ? nil : text
        slides[idx].effects = buildEffects()
        return (slides, slideManager.slideImages)
    }

    private func handleDismiss() {
        let hasContent = slideManager.slides.contains {
            let slideId = $0.id
            return $0.content != nil
                || slideManager.slideImages[slideId] != nil
                || $0.effects.background != nil
        } || !stickerObjects.isEmpty
          || drawingData != nil
        if hasContent {
            showDiscardAlert = true
        } else {
            cancelPublishIfNeeded()
            clearDraft()
            onDismiss()
        }
    }

    private func cancelPublishIfNeeded() {
        if let cont = slidePublishContinuation {
            slidePublishContinuation = nil
            slidePublishError = nil
            showPublishError = false
            cont.resume(returning: .cancel)
        }
        publishTask?.cancel()
        publishTask = nil
        isPublishingAll = false
        publishProgressText = nil
    }

    private func publishAllSlides() {
        isPublishingAll = true
        publishTask = Task {
            let (slides, images) = allSlidesSnapshot()

            var index = 0
            while index < slides.count {
                guard !Task.isCancelled else { break }
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
                        let action = await withCheckedContinuation { (continuation: CheckedContinuation<SlidePublishAction, Never>) in
                            slidePublishContinuation = continuation
                            slidePublishError = "Erreur slide \(index + 1)/\(slides.count) : \(error.localizedDescription)"
                            showPublishError = true
                        }
                        slidePublishError = nil
                        showPublishError = false
                        switch action {
                        case .retry:
                            break
                        case .skip:
                            retrying = false
                            index += 1
                        case .cancel:
                            isPublishingAll = false
                            publishProgressText = nil
                            return
                        }
                    }
                }
            }

            guard !Task.isCancelled else {
                isPublishingAll = false
                publishProgressText = nil
                return
            }

            clearDraft()
            isPublishingAll = false
            publishProgressText = nil
            HapticFeedback.success()
            onDismiss()
        }
    }

    private func saveDraft() {
        // Note: mediaData (UIImage) est intentionnellement exclue du draft (évite les gros binaires
        // dans UserDefaults). Les slides avec images locales non encore uploadées perdront leur image
        // au restore — seule l'URL distante est préservée si elle existe dans mediaURL.
        let slides = slideManager.slides
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
        if let first = slideManager.slides.first {
            text = first.content ?? ""
            if let bg = first.effects.background {
                backgroundColor = Color(hex: bg)
            }
        }
        visibility = draft.visibilityPreference
    }

    private func buildEffects() -> StoryEffects {
        let bgHex = selectedImage != nil ? nil : colorToHex(backgroundColor)
        return StoryEffects(
            background: bgHex,
            textStyle: textStyle.rawValue,
            textColor: colorToHex(textColor),
            textPosition: nil,
            filter: selectedFilter?.rawValue,
            stickers: stickerObjects.isEmpty ? nil : stickerObjects.map(\.emoji),
            textAlign: alignmentString(textAlignment),
            textSize: textSize,
            textBg: textBgEnabled ? "000000" : nil,
            textOffsetY: nil,
            stickerObjects: stickerObjects.isEmpty ? nil : stickerObjects,
            textPositionPoint: textPosition,
            drawingData: drawingData,
            backgroundAudioId: selectedAudioId,
            backgroundAudioVolume: selectedAudioId != nil ? audioVolume : nil,
            backgroundAudioStart: selectedAudioId != nil ? audioTrimStart : nil,
            opening: openingEffect,
            closing: closingEffect
        )
    }

    private func alignmentString(_ alignment: TextAlignment) -> String {
        switch alignment {
        case .leading: return "left"
        case .center: return "center"
        case .trailing: return "right"
        }
    }

    private func colorToHex(_ color: Color) -> String {
        let uiColor = UIColor(color)
        var r: CGFloat = 0; var g: CGFloat = 0; var b: CGFloat = 0; var a: CGFloat = 0
        uiColor.getRed(&r, green: &g, blue: &b, alpha: &a)
        return String(format: "%02X%02X%02X", Int(r * 255), Int(g * 255), Int(b * 255))
    }
}
