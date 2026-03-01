import SwiftUI
import PhotosUI
import PencilKit
import UniformTypeIdentifiers
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

    // Drawing state (partagé avec DrawingToolbarPanel et StoryCanvasView)
    @State private var drawingCanvas = PKCanvasView()
    @State private var drawingColor: Color = .white
    @State private var drawingWidth: CGFloat = 5
    @State private var drawingTool: DrawingTool = .pen

    // Audio
    @State private var selectedAudioId: String? = nil
    @State private var selectedAudioTitle: String? = nil
    @State private var audioVolume: Float = 0.7
    @State private var audioTrimStart: TimeInterval = 0
    @State private var audioTrimEnd: TimeInterval = 0

    @State private var openingEffect: StoryTransitionEffect? = nil
    @State private var closingEffect: StoryTransitionEffect? = nil

    @State private var activePanel: StoryComposerPanel = .none
    @State private var showPhotoPicker = false
    @State private var photoPickerItem: PhotosPickerItem? = nil
    @State private var showRestoreDraftAlert = false
    @State private var pendingDraft: StoryComposerDraft? = nil
    @State private var pendingAudioEditorURL: URL? = nil
    @State private var showAudioEditor = false

    // MARK: - Media States
    @State private var pendingMediaItem: PhotosPickerItem? = nil
    @State private var showMediaPlacementSheet = false
    @State private var pendingMediaType: String = "image"
    @State private var showAudioSourceSheet = false
    @State private var showMediaAudioEditor = false
    @State private var pendingAudioURL: URL? = nil
    @State private var showVolumeMixer = false
    // Stockage local des médias chargés (en attente d'upload) — indexés par StoryMediaObject.id
    @State private var loadedImages: [String: UIImage] = [:]
    @State private var loadedVideoURLs: [String: URL] = [:]

    @State private var showPreview = false
    @State private var visibility: String = "PUBLIC"
    @State private var showDiscardAlert = false
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
            // Canvas plein écran
            Color.black.ignoresSafeArea()
            canvasArea

            // Guides zones story (subtil)
            storyZoneGuides

            // Overlay haut
            VStack(spacing: 0) {
                topBar
                Spacer()
            }

            // Overlay bas (toolbar + panel actif)
            VStack(spacing: 0) {
                Spacer()
                bottomOverlay
            }
        }
        .fullScreenCover(isPresented: $showAudioEditor) {
            if let url = pendingAudioEditorURL {
                MeeshyAudioEditorView(
                    url: url,
                    onConfirm: { confirmedURL, _, trimS, trimE in
                        selectedAudioId = confirmedURL.lastPathComponent
                        selectedAudioTitle = "Enregistrement"
                        audioTrimStart = trimS
                        audioTrimEnd = trimE
                        showAudioEditor = false
                        pendingAudioEditorURL = nil
                    },
                    onDismiss: {
                        showAudioEditor = false
                        pendingAudioEditorURL = nil
                    }
                )
            }
        }
        .statusBarHidden()
        .photosPicker(isPresented: $showPhotoPicker, selection: $photoPickerItem,
                      matching: .any(of: [.images, .videos]))
        .onChange(of: photoPickerItem) { newItem in
            loadPhoto(from: newItem)
        }
        .sheet(isPresented: $showAudioSourceSheet) {
            AudioSourceSheet { _ in
                pendingMediaType = "audio"
                showAudioSourceSheet = false
                showMediaAudioEditor = true
            }
        }
        .sheet(isPresented: $showMediaAudioEditor) {
            if let url = pendingAudioURL {
                MeeshyAudioEditorView(
                    url: url,
                    onConfirm: { confirmedURL, _, _, _ in
                        pendingAudioURL = confirmedURL
                        showMediaAudioEditor = false
                        showMediaPlacementSheet = true
                    },
                    onDismiss: {
                        showMediaAudioEditor = false
                        pendingAudioURL = nil
                    }
                )
            }
        }
        .sheet(isPresented: $showMediaPlacementSheet) {
            MediaPlacementSheet(mediaType: pendingMediaType) { placement in
                handleMediaPlacement(placement)
            }
        }
        .sheet(isPresented: $showVolumeMixer) {
            VolumeMixerSheet(effects: Binding(
                get: { currentSlideEffects },
                set: { newEffects in
                    if let e = newEffects { setCurrentSlideEffects(e) }
                }
            ))
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
    }

    // MARK: - Canvas Area (plein écran)

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
                selectedImage: $selectedImage,
                drawingCanvas: $drawingCanvas,
                drawingColor: $drawingColor,
                drawingWidth: $drawingWidth,
                drawingTool: $drawingTool,
                mediaObjects: Binding(
                    get: { currentSlideEffects?.mediaObjects ?? [] },
                    set: { objs in
                        var effects = currentSlideEffects ?? buildEffects()
                        effects.mediaObjects = objs
                        setCurrentSlideEffects(effects)
                    }
                ),
                audioPlayerObjects: Binding(
                    get: { currentSlideEffects?.audioPlayerObjects ?? [] },
                    set: { objs in
                        var effects = currentSlideEffects ?? buildEffects()
                        effects.audioPlayerObjects = objs
                        setCurrentSlideEffects(effects)
                    }
                ),
                loadedImages: $loadedImages,
                loadedVideoURLs: $loadedVideoURLs
            )

            // Ferme le panel actif en tapant le canvas (sauf en mode dessin)
            if activePanel != .none && !isDrawingActive {
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            activePanel = .none
                        }
                    }
            }
        }
        .ignoresSafeArea()
    }

    // MARK: - Story Zone Guides

    private var storyZoneGuides: some View {
        GeometryReader { geo in
            ZStack {
                // Zone top (zone de danger UI viewer)
                Rectangle()
                    .fill(Color.white.opacity(0.06))
                    .frame(height: geo.size.height * 0.12)
                    .frame(maxWidth: .infinity, alignment: .top)

                // Zone bottom (zone de danger UI viewer)
                Rectangle()
                    .fill(Color.white.opacity(0.06))
                    .frame(height: geo.size.height * 0.15)
                    .frame(maxWidth: .infinity, alignment: .bottom)
            }
        }
        .allowsHitTesting(false)
        .opacity(activePanel == .none ? 0 : 0) // masqué par défaut, visible en mode édition
    }

    // MARK: - Top Bar (moderne, overlay)

    private var topBar: some View {
        HStack(spacing: 0) {
            // [✕] Dismiss
            Button {
                handleDismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 34, height: 34)
                    .background(
                        Circle()
                            .fill(.black.opacity(0.55))
                            .overlay(Circle().stroke(Color.white.opacity(0.15), lineWidth: 0.5))
                    )
            }
            .padding(.leading, 16)

            // Strip de slides scrollable
            slideStrip
                .frame(maxWidth: .infinity)

            // Actions groupées
            HStack(spacing: 8) {
                // [⋯] Menu contextuel
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
                    Image(systemName: "ellipsis")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 32, height: 32)
                        .background(
                            Circle()
                                .fill(.black.opacity(0.55))
                                .overlay(Circle().stroke(Color.white.opacity(0.15), lineWidth: 0.5))
                        )
                }

                // [▶] Preview
                Button {
                    let (slides, images) = allSlidesSnapshot()
                    onPreview(slides, images)
                } label: {
                    Image(systemName: "play.fill")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 32, height: 32)
                        .background(
                            Circle()
                                .fill(.black.opacity(0.55))
                                .overlay(Circle().stroke(Color.white.opacity(0.15), lineWidth: 0.5))
                        )
                }

                // [Publier]
                Button {
                    publishAllSlides()
                } label: {
                    Group {
                        if let progress = publishProgressText {
                            HStack(spacing: 4) {
                                ProgressView()
                                    .progressViewStyle(.circular)
                                    .scaleEffect(0.65)
                                    .tint(.white)
                                Text(progress)
                                    .font(.system(size: 11, weight: .bold))
                            }
                        } else {
                            HStack(spacing: 4) {
                                Text("Publier")
                                    .font(.system(size: 13, weight: .bold))
                                    .lineLimit(1)
                                Image(systemName: "arrow.up.circle.fill")
                                    .font(.system(size: 13))
                            }
                            .fixedSize()
                        }
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
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
            }
            .padding(.trailing, 16)
        }
        .frame(height: 60)
        .background(
            Color.black.opacity(0.45)
                .background(.ultraThinMaterial.opacity(0.6))
        )
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
                        RoundedRectangle(cornerRadius: 5)
                            .fill(Color.white.opacity(0.06))
                            .frame(width: 34, height: 46)
                            .overlay(
                                RoundedRectangle(cornerRadius: 5)
                                    .stroke(Color.white.opacity(0.2),
                                            style: StrokeStyle(lineWidth: 1, dash: [3]))
                            )
                            .overlay(
                                Image(systemName: "plus")
                                    .font(.system(size: 12, weight: .semibold))
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
            .frame(width: 34, height: 46)
            .clipShape(RoundedRectangle(cornerRadius: 5))
            .overlay(
                RoundedRectangle(cornerRadius: 5)
                    .stroke(
                        isSelected ? Color(hex: "FF2E63") : Color.white.opacity(0.2),
                        lineWidth: isSelected ? 2 : 0.5
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

    // MARK: - Bottom Overlay (toolbar + panel)

    private var bottomOverlay: some View {
        VStack(spacing: 0) {
            // Séparateur subtil
            Rectangle()
                .fill(Color.white.opacity(0.08))
                .frame(height: 0.5)

            // Toolbar scrollable
            toolBarScrollable

            // Panel actif (animé)
            if activePanel != .none {
                activeToolPanel
                    .frame(maxHeight: 220)
                    .clipped()
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .background(
            Color.black.opacity(0.55)
                .background(.ultraThinMaterial.opacity(0.7))
                .ignoresSafeArea(edges: .bottom)
        )
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: activePanel)
    }

    // MARK: - Toolbar Scrollable

    private var toolBarScrollable: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                toolPill(icon: "photo.on.rectangle", label: "Photo", panel: nil, action: { showPhotoPicker = true })
                toolPill(icon: "textformat", label: "Texte", panel: .text)
                toolPill(icon: "pencil.tip", label: "Dessin", panel: .drawing)
                toolPill(icon: "face.smiling", label: "Sticker", panel: .stickers)
                toolPill(icon: "camera.filters", label: "Filtre", panel: .filter)
                toolPill(icon: "music.note", label: "Audio", panel: .audio, hasBadge: selectedAudioId != nil)
                toolPill(icon: "paintpalette", label: "Fond", panel: .background)
                toolPill(icon: "sparkles", label: "Effets", panel: .transition)

                PhotosPicker(selection: $pendingMediaItem, matching: .any(of: [.images, .videos])) {
                    HStack(spacing: 5) {
                        Image(systemName: "photo.badge.plus")
                            .font(.system(size: 14, weight: .medium))
                        Text("Média")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(.white.opacity(0.65))
                    .padding(.horizontal, 13)
                    .padding(.vertical, 7)
                    .background(Capsule().fill(Color.white.opacity(0.1)))
                }
                .accessibilityLabel("Ajouter image ou vidéo")
                .onChange(of: pendingMediaItem) { item in
                    guard let item else { return }
                    let isVideo = item.supportedContentTypes.contains { $0.conforms(to: .audiovisualContent) }
                    pendingMediaType = isVideo ? "video" : "image"
                    showMediaPlacementSheet = true
                }

                Button {
                    showAudioSourceSheet = true
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: "waveform.badge.plus")
                            .font(.system(size: 14, weight: .medium))
                        Text("Son")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(.white.opacity(0.65))
                    .padding(.horizontal, 13)
                    .padding(.vertical, 7)
                    .background(Capsule().fill(Color.white.opacity(0.1)))
                }
                .accessibilityLabel("Ajouter audio")

                if hasAudioContent {
                    Button {
                        showVolumeMixer = true
                    } label: {
                        HStack(spacing: 5) {
                            Image(systemName: "speaker.wave.2.fill")
                                .font(.system(size: 14, weight: .medium))
                            Text("Volume")
                                .font(.system(size: 12, weight: .medium))
                        }
                        .foregroundColor(.white.opacity(0.65))
                        .padding(.horizontal, 13)
                        .padding(.vertical, 7)
                        .background(Capsule().fill(Color.white.opacity(0.1)))
                    }
                    .accessibilityLabel("Mixage volume")
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
        }
    }

    private func toolPill(icon: String, label: String, panel: StoryComposerPanel?, action: (() -> Void)? = nil, hasBadge: Bool = false) -> some View {
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
            HStack(spacing: 5) {
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .medium))
                Text(label)
                    .font(.system(size: 12, weight: isActive ? .semibold : .medium))
            }
            .foregroundColor(isActive ? .white : .white.opacity(0.65))
            .padding(.horizontal, 13)
            .padding(.vertical, 7)
            .background(
                Capsule()
                    .fill(isActive
                          ? AnyShapeStyle(LinearGradient(
                              colors: [Color(hex: "FF2E63"), Color(hex: "E94057")],
                              startPoint: .leading, endPoint: .trailing
                          ))
                          : AnyShapeStyle(Color.white.opacity(0.1))
                    )
            )
            .overlay(alignment: .topTrailing) {
                if hasBadge && !isActive {
                    Circle()
                        .fill(Color(hex: "FF2E63"))
                        .frame(width: 7, height: 7)
                        .offset(x: 2, y: -2)
                }
            }
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

        case .stickers:
            StickerPickerView { emoji in
                let sticker = StorySticker(emoji: emoji, x: 0.5, y: 0.4)
                stickerObjects.append(sticker)
                HapticFeedback.medium()
            }

        case .drawing:
            DrawingToolbarPanel(
                toolColor: $drawingColor,
                toolWidth: $drawingWidth,
                toolType: $drawingTool,
                onUndo: {
                    drawingCanvas.undoManager?.undo()
                    drawingData = drawingCanvas.drawing.dataRepresentation()
                    HapticFeedback.light()
                },
                onClear: {
                    drawingCanvas.drawing = PKDrawing()
                    drawingData = nil
                    HapticFeedback.medium()
                }
            )
            .padding(.bottom, 8)

        case .filter:
            StoryFilterPicker(selectedFilter: $selectedFilter)
                .padding(.vertical, 12)

        case .audio:
            StoryAudioPanel(
                selectedAudioId: $selectedAudioId,
                selectedAudioTitle: $selectedAudioTitle,
                audioVolume: $audioVolume,
                onRecordingReady: { url in
                    pendingAudioEditorURL = url
                    showAudioEditor = true
                }
            )

        case .background:
            backgroundPicker

        case .transition:
            transitionPicker

        case .none:
            EmptyView()
        }
    }

    // MARK: - Background Picker

    private var backgroundPicker: some View {
        VStack(spacing: 12) {
            Text("Arrière-plan")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.white.opacity(0.6))

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

    // MARK: - Computed Properties

    private var currentSlideEffects: StoryEffects? {
        get {
            guard slideManager.currentSlideIndex < slideManager.slides.count else { return nil }
            return slideManager.slides[slideManager.currentSlideIndex].effects
        }
    }

    private func setCurrentSlideEffects(_ effects: StoryEffects) {
        guard slideManager.currentSlideIndex < slideManager.slides.count else { return }
        slideManager.slides[slideManager.currentSlideIndex].effects = effects
    }

    private var hasAudioContent: Bool {
        let effects = currentSlideEffects
        let hasVideo = effects?.mediaObjects?.contains { $0.mediaType == "video" } ?? false
        let hasAudio = !(effects?.audioPlayerObjects ?? []).isEmpty
        return hasVideo || hasAudio
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
                publishProgressText = "\(index + 1)/\(slides.count)..."

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

    private func handleMediaPlacement(_ placement: MediaPlacement) {
        guard pendingMediaType != "audio" else {
            handleAudioPlacement(placement)
            return
        }
        guard let item = pendingMediaItem else { return }
        let mediaType = pendingMediaType
        Task {
            let objectId = UUID().uuidString
            let obj = StoryMediaObject(
                id: objectId,
                postMediaId: "",
                mediaType: mediaType,
                placement: placement.rawValue,
                x: 0.5, y: 0.5,
                scale: 1.0, rotation: 0.0,
                volume: 1.0
            )
            if mediaType == "video" {
                if let data = try? await item.loadTransferable(type: Data.self) {
                    let tempURL = FileManager.default.temporaryDirectory
                        .appendingPathComponent(objectId + ".mp4")
                    try? data.write(to: tempURL)
                    await MainActor.run {
                        loadedVideoURLs[objectId] = tempURL
                        var effects = currentSlideEffects ?? buildEffects()
                        effects.mediaObjects = (effects.mediaObjects ?? []) + [obj]
                        setCurrentSlideEffects(effects)
                    }
                }
            } else {
                if let data = try? await item.loadTransferable(type: Data.self),
                   let image = UIImage(data: data) {
                    await MainActor.run {
                        loadedImages[objectId] = image
                        var effects = currentSlideEffects ?? buildEffects()
                        effects.mediaObjects = (effects.mediaObjects ?? []) + [obj]
                        setCurrentSlideEffects(effects)
                    }
                }
            }
            await MainActor.run {
                pendingMediaItem = nil
            }
        }
    }

    private func handleAudioPlacement(_ placement: MediaPlacement) {
        guard let url = pendingAudioURL else { return }
        Task {
            let samples: [Float]
            if let generated = try? await WaveformGenerator.shared.generateSamples(from: url) {
                samples = generated
            } else {
                samples = []
            }
            let obj = StoryAudioPlayerObject(
                id: UUID().uuidString,
                postMediaId: "",
                placement: placement.rawValue,
                x: 0.5, y: 0.3,
                volume: 1.0,
                waveformSamples: samples
            )
            await MainActor.run {
                var effects = currentSlideEffects ?? buildEffects()
                effects.audioPlayerObjects = (effects.audioPlayerObjects ?? []) + [obj]
                setCurrentSlideEffects(effects)
                pendingAudioURL = nil
            }
        }
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
            backgroundAudioEnd: selectedAudioId != nil && audioTrimEnd > 0 ? audioTrimEnd : nil,
            opening: openingEffect,
            closing: closingEffect,
            mediaObjects: currentSlideEffects?.mediaObjects,
            audioPlayerObjects: currentSlideEffects?.audioPlayerObjects
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

// MARK: - Volume Mixer Sheet

private struct VolumeMixerSheet: View {
    @Binding var effects: StoryEffects?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Arrière-plan") {
                    if effects?.audioPlayerObjects?.contains(where: { $0.placement == "background" }) == true {
                        Slider(value: backgroundVolumeBinding, in: 0...1) {
                            Text("Volume")
                        }
                        .accessibilityLabel("Volume arrière-plan")
                    }
                }
                Section("Premier plan") {
                    if effects?.mediaObjects?.contains(where: { $0.mediaType == "video" && $0.placement == "foreground" }) == true {
                        Slider(value: foregroundVideoVolumeBinding, in: 0...1) {
                            Text("Volume vidéo")
                        }
                        .accessibilityLabel("Volume vidéo premier plan")
                    }
                    if effects?.audioPlayerObjects?.contains(where: { $0.placement == "foreground" }) == true {
                        Slider(value: foregroundAudioVolumeBinding, in: 0...1) {
                            Text("Volume audio")
                        }
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
                guard let i = effects?.audioPlayerObjects?.firstIndex(where: { $0.placement == "background" }) else { return }
                effects?.audioPlayerObjects?[i].volume = v
            }
        )
    }

    private var foregroundVideoVolumeBinding: Binding<Float> {
        Binding(
            get: { effects?.mediaObjects?.first(where: { $0.mediaType == "video" && $0.placement == "foreground" })?.volume ?? 1.0 },
            set: { v in
                guard let i = effects?.mediaObjects?.firstIndex(where: { $0.mediaType == "video" && $0.placement == "foreground" }) else { return }
                effects?.mediaObjects?[i].volume = v
            }
        )
    }

    private var foregroundAudioVolumeBinding: Binding<Float> {
        Binding(
            get: { effects?.audioPlayerObjects?.first(where: { $0.placement == "foreground" })?.volume ?? 1.0 },
            set: { v in
                guard let i = effects?.audioPlayerObjects?.firstIndex(where: { $0.placement == "foreground" }) else { return }
                effects?.audioPlayerObjects?[i].volume = v
            }
        )
    }
}
