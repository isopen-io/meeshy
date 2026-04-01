import SwiftUI
import PhotosUI
import PencilKit
import UniformTypeIdentifiers
import AVFoundation
import MeeshySDK

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

public enum SlidePublishAction: Sendable {
    case retry, skip, cancel
}

// MARK: - Story Composer View

public struct StoryComposerView: View {

    // MARK: - Single source of truth

    @State private var viewModel = StoryComposerViewModel()

    // MARK: - Canvas-local state (PKCanvasView must be @State)

    @State private var drawingCanvas = PKCanvasView()
    @State private var drawingTool: DrawingTool = .pen
    @State private var selectedFilter: StoryFilter?
    @State private var selectedImage: UIImage?
    @State private var stickerObjects: [StorySticker] = []

    // MARK: - Background audio (legacy panel state)

    @State private var selectedAudioId: String?
    @State private var selectedAudioTitle: String?
    @State private var audioVolume: Float = 0.7
    @State private var audioTrimStart: TimeInterval = 0
    @State private var audioTrimEnd: TimeInterval = 0

    // MARK: - Photo / media pickers

    @State private var bgPhotoItem: PhotosPickerItem?
    @State private var fgMediaItem: PhotosPickerItem?

    // MARK: - Media editor (triggered by edit button on canvas elements)

    @State private var editingBgImage: UIImage?
    @State private var editingElementImage: EditingMediaImage?
    @State private var editingElementVideo: EditingMediaVideo?

    // MARK: - Audio pickers

    @State private var showAudioDocumentPicker = false
    @State private var showVoiceRecorderSheet = false
    @State private var audioEditorItem: AudioEditorItemWrapper?
    @State private var mediaAudioEditorItem: AudioEditorItemWrapper?
    @State private var confirmedMediaAudioURL: URL?

    // MARK: - Publication

    @State private var publishTask: Task<Void, Never>?

    // MARK: - Canvas viewport (pinch-to-zoom + drag-to-pan when zoomed)

    @GestureState private var viewportPinchDelta: CGFloat = 1.0
    @GestureState private var viewportDragDelta: CGSize = .zero

    /// Canvas gestures disabled only during drawing (PKCanvasView needs exclusive touch control).
    /// For all other modes, child element gestures naturally take priority via SwiftUI's
    /// gesture hierarchy (.gesture on child beats .gesture on parent).
    private var isCanvasGestureEnabled: Bool {
        !viewModel.isDrawingActive
    }

    /// Pan always available when zoomed — uses high minimumDistance to avoid accidental triggers
    private var isPanEnabled: Bool {
        viewModel.isCanvasZoomed
    }

    private var viewportPinchGesture: some Gesture {
        MagnifyGesture()
            .updating($viewportPinchDelta) { value, state, _ in
                state = value.magnification
            }
            .onEnded { value in
                let newScale = min(4.0, max(0.5, viewModel.canvasScale * value.magnification))
                withAnimation(.spring(response: 0.2)) {
                    viewModel.canvasScale = newScale
                    if newScale <= 1.0 { viewModel.canvasOffset = .zero }
                }
            }
    }

    private var viewportDragGesture: some Gesture {
        DragGesture(minimumDistance: 20)
            .updating($viewportDragDelta) { value, state, _ in
                state = value.translation
            }
            .onEnded { value in
                viewModel.canvasOffset = CGSize(
                    width: viewModel.canvasOffset.width + value.translation.width,
                    height: viewModel.canvasOffset.height + value.translation.height
                )
            }
    }

    /// Top bar hides during free canvas manipulation (zoomed, no tool/selection)
    /// to reveal canvas controls underneath. Reappears when activating a tool or selecting media.
    private var showTopBar: Bool {
        !viewModel.isCanvasZoomed || viewModel.activeTool != nil || viewModel.selectedElementId != nil
    }

    // MARK: - UI state

    @State private var showDiscardAlert = false
    @State private var showRestoreDraftAlert = false
    @State private var isLoadingMedia = false
    @State private var visibility: String = "PUBLIC"

    // MARK: - Transition effects (local until synced to effects)

    @State private var openingEffect: StoryTransitionEffect?
    @State private var closingEffect: StoryTransitionEffect?

    @Environment(\.theme) private var theme

    // MARK: - Callbacks (public API preserved)

    public var onPublishSlide: (StorySlide, UIImage?, [String: UIImage], [String: URL]) async throws -> Void
    public var onPublishAllInBackground: (
        _ slides: [StorySlide],
        _ slideImages: [String: UIImage],
        _ loadedImages: [String: UIImage],
        _ loadedVideoURLs: [String: URL]
    ) -> Void
    public var onPreview: ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL]) -> Void
    public var onDismiss: () -> Void

    public init(
        onPublishSlide: @escaping (StorySlide, UIImage?, [String: UIImage], [String: URL]) async throws -> Void = { _, _, _, _ in },
        onPublishAllInBackground: @escaping ([StorySlide], [String: UIImage], [String: UIImage], [String: URL]) -> Void,
        onPreview: @escaping ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL]) -> Void,
        onDismiss: @escaping () -> Void
    ) {
        self.onPublishSlide = onPublishSlide
        self.onPublishAllInBackground = onPublishAllInBackground
        self.onPreview = onPreview
        self.onDismiss = onDismiss
    }

    // MARK: - Body

    public var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            // Canvas with viewport pan/zoom (2 fingers)
            StoryCanvasView(
                viewModel: viewModel,
                drawingCanvas: $drawingCanvas,
                drawingTool: $drawingTool,
                selectedFilter: $selectedFilter,
                selectedImage: $selectedImage,
                stickerObjects: $stickerObjects,
                onEditText: { id in
                    viewModel.selectedElementId = id
                    viewModel.activeTool = .text
                },
                onEditMedia: { id in
                    viewModel.selectedElementId = id
                    openMediaEditor(elementId: id)
                }
            )
            .scaleEffect(viewModel.canvasScale * viewportPinchDelta)
            .offset(
                x: viewModel.canvasOffset.width + viewportDragDelta.width,
                y: viewModel.canvasOffset.height + viewportDragDelta.height
            )
            // .gesture (not .highPriority/.simultaneous) — child element gestures
            // naturally take priority. Canvas gestures only fire on empty areas.
            .gesture(isCanvasGestureEnabled ? viewportPinchGesture : nil)
            .gesture(isCanvasGestureEnabled && isPanEnabled ? viewportDragGesture : nil)
            .overlay {
                if isLoadingMedia {
                    Color.black.opacity(0.3)
                        .overlay(ProgressView().tint(.white).scaleEffect(1.2))
                        .allowsHitTesting(false)
                }
            }
            .overlay(alignment: .topTrailing) {
                if viewModel.isCanvasZoomed {
                    Button {
                        withAnimation(.spring(response: 0.3)) {
                            viewModel.resetCanvasZoom()
                        }
                    } label: {
                        Image(systemName: "arrow.uturn.backward")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.white)
                            .frame(width: 30, height: 30)
                            .background(Circle().fill(.black.opacity(0.5)))
                    }
                    // When top bar is hidden, move button up to safe area top
                    .padding(.top, showTopBar ? 70 : 16)
                    .padding(.trailing, 12)
                    .transition(.scale.combined(with: .opacity))
                    .animation(.spring(response: 0.3), value: showTopBar)
                }
            }
            .ignoresSafeArea()

            // Top bar — auto-hides during canvas zoom to reveal canvas controls
            VStack(spacing: 0) {
                if showTopBar {
                    topBar
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
                Spacer()
            }
            .animation(.spring(response: 0.3, dampingFraction: 0.85), value: showTopBar)

            // Bottom: toolbar + active panel
            VStack(spacing: 0) {
                Spacer()
                bottomOverlay
            }
        }
        .statusBarHidden()
        .onDisappear {
            StoryMediaCoordinator.shared.deactivate()
            publishTask?.cancel()
            publishTask = nil
        }
        .onChange(of: bgPhotoItem) { _, item in loadBackgroundPhoto(from: item) }
        .onChange(of: fgMediaItem) { _, item in handleForegroundMediaSelection(from: item) }
        .fileImporter(isPresented: $showAudioDocumentPicker, allowedContentTypes: [.audio], allowsMultipleSelection: false) { result in
            if case .success(let urls) = result, let url = urls.first {
                mediaAudioEditorItem = AudioEditorItemWrapper(url: url)
            }
        }
        .fullScreenCover(item: $audioEditorItem) { item in
            MeeshyAudioEditorView(
                url: item.url,
                onConfirm: { url, _, _, _ in
                    addRecordingToBackground(url: url)
                    audioEditorItem = nil
                },
                onDismiss: { audioEditorItem = nil }
            )
        }
        .sheet(item: $mediaAudioEditorItem) { item in
            MeeshyAudioEditorView(
                url: item.url,
                onConfirm: { url, _, _, _ in
                    confirmedMediaAudioURL = url
                    mediaAudioEditorItem = nil
                    addVocalToForeground()
                },
                onDismiss: { mediaAudioEditorItem = nil }
            )
        }
        .sheet(isPresented: $showVoiceRecorderSheet) {
            NavigationStack {
                StoryVoiceRecorder { recordedURL in
                    mediaAudioEditorItem = AudioEditorItemWrapper(url: recordedURL)
                    showVoiceRecorderSheet = false
                }
                .navigationTitle("Enregistrer un vocal")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Annuler") { showVoiceRecorderSheet = false }
                    }
                }
            }
            .presentationDetents([.medium])
        }
        .fullScreenCover(item: Binding(
            get: { editingBgImage.map { PendingImageWrapper(image: $0) } },
            set: { if $0 == nil { editingBgImage = nil } }
        )) { wrapper in
            MeeshyImageEditorView(
                image: wrapper.image,
                initialCropRatio: .ratio9x16,
                onAccept: { edited in
                    selectedImage = edited
                    viewModel.hasBackgroundImage = true
                    viewModel.setImage(edited, for: viewModel.currentSlide.id)
                    editingBgImage = nil
                },
                onCancel: { editingBgImage = nil }
            )
        }
        .fullScreenCover(item: $editingElementImage) { item in
            MeeshyImageEditorView(
                image: item.image,
                initialCropRatio: .ratio9x16,
                onAccept: { edited in
                    viewModel.loadedImages[item.elementId] = edited
                    editingElementImage = nil
                },
                onCancel: { editingElementImage = nil }
            )
        }
        .fullScreenCover(item: $editingElementVideo) { item in
            MeeshyVideoEditorView(
                url: item.url,
                onAccept: {
                    let thumbnail = Self.generateVideoThumbnail(url: item.url)
                    if let thumbnail { viewModel.loadedImages[item.elementId] = thumbnail }
                    editingElementVideo = nil
                },
                onCancel: { editingElementVideo = nil }
            )
        }
        .alert("Reprendre votre story ?", isPresented: $showRestoreDraftAlert) {
            Button("Reprendre") { restoreDraft() }
            Button("Effacer le brouillon", role: .destructive) { clearAllDrafts() }
        } message: {
            Text("Vous avez un brouillon non publie.")
        }
        .alert("Quitter sans publier ?", isPresented: $showDiscardAlert) {
            Button("Sauvegarder") { saveDraftAndDismiss() }
            Button("Quitter", role: .destructive) { cancelAndDismiss() }
            Button("Annuler", role: .cancel) { }
        }
        .onAppear { checkForDraft() }
    }

    // MARK: - Top Bar

    private var topBar: some View {
        HStack(spacing: 0) {
            dismissButton
                .padding(.leading, 16)

            slideStrip
                .frame(maxWidth: .infinity)

            HStack(spacing: 8) {
                previewButton
                publishButton
                overflowMenu
            }
            .padding(.trailing, 16)
        }
        .frame(height: 60)
        .background(
            Color.black.opacity(0.45)
                .background(.ultraThinMaterial.opacity(0.6))
        )
    }

    private var dismissButton: some View {
        Button { handleDismiss() } label: {
            Image(systemName: "xmark")
                .font(.system(size: 15, weight: .bold))
                .foregroundColor(.white)
                .frame(width: 34, height: 34)
                .background(
                    Circle()
                        .fill(.black.opacity(0.55))
                        .overlay(Circle().stroke(Color.white.opacity(0.15), lineWidth: 0.5))
                )
                .frame(width: 44, height: 44)
                .contentShape(Circle())
        }
    }

    private var previewButton: some View {
        Button {
            NotificationCenter.default.post(name: .storyComposerMuteCanvas, object: nil)
            let snapshot = snapshotAllSlides()
            onPreview(snapshot.slides, snapshot.bgImages, viewModel.loadedImages, viewModel.loadedVideoURLs, viewModel.loadedAudioURLs)
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
                .frame(width: 44, height: 44)
                .contentShape(Circle())
        }
    }

    private var publishButton: some View {
        Button { publishAllSlides() } label: {
            HStack(spacing: 4) {
                Text("Publier").font(.system(size: 13, weight: .bold)).lineLimit(1)
                Image(systemName: "arrow.up.circle.fill").font(.system(size: 13))
            }
            .fixedSize()
            .foregroundColor(.white)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(Capsule().fill(MeeshyColors.brandGradient))
        }
    }

    private var overflowMenu: some View {
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
                    Label("Prive", systemImage: visibility == "PRIVATE" ? "checkmark" : "lock")
                }
            } label: {
                Label("Visibilite", systemImage: "eye")
            }
            Divider()
            Button(role: .destructive) { viewModel.reset() } label: {
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
                .frame(width: 44, height: 44)
                .contentShape(Circle())
        }
    }

    // MARK: - Slide Strip

    private var slideStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(Array(viewModel.slides.enumerated()), id: \.element.id) { index, slide in
                    slideThumb(slide: slide, index: index)
                }
            }
            .padding(.horizontal, 8)
        }
    }

    private func slideThumb(slide: StorySlide, index: Int) -> some View {
        let isSelected = viewModel.currentSlideIndex == index
        let thumbH: CGFloat = 42
        let thumbW: CGFloat = thumbH * 9 / 16
        let isCurrent = viewModel.currentSlideIndex == index
        let drawData = isCurrent ? viewModel.drawingData : slide.effects.drawingData

        return Button {
            syncCurrentSlideEffects()
            withAnimation(.spring(response: 0.25)) { viewModel.selectSlide(at: index) }
            restoreCanvas(from: viewModel.slides[index])
            HapticFeedback.light()
        } label: {
            SlideMiniPreview(
                effects: slide.effects,
                bgImage: viewModel.slideImages[slide.id],
                drawingData: drawData,
                loadedImages: viewModel.loadedImages,
                index: index
            )
            .frame(width: thumbW, height: thumbH)
            .clipShape(RoundedRectangle(cornerRadius: 3))
            .overlay(
                RoundedRectangle(cornerRadius: 3)
                    .strokeBorder(
                        isSelected ? MeeshyColors.brandPrimary : Color.white.opacity(0.2),
                        lineWidth: isSelected ? 1.5 : 0.5
                    )
            )
        }
        .contextMenu {
            if viewModel.slides.count > 1 {
                Button(role: .destructive) {
                    syncCurrentSlideEffects()
                    viewModel.removeSlide(at: index)
                    restoreCanvas(from: viewModel.currentSlide)
                } label: {
                    Label("Supprimer", systemImage: "trash")
                }
            }
            Button {
                syncCurrentSlideEffects()
                viewModel.duplicateSlide(at: index)
                restoreCanvas(from: viewModel.currentSlide)
            } label: {
                Label("Dupliquer", systemImage: "doc.on.doc")
            }
        }
    }

    // MARK: - Bottom Overlay

    private var bottomOverlay: some View {
        VStack(spacing: 0) {
            ContextualToolbar(viewModel: viewModel)
                .padding(.top, 6)
                .padding(.bottom, viewModel.activeTool != nil ? 4 : 0)

            if viewModel.activeTool != nil {
                Rectangle().fill(Color.white.opacity(0.06)).frame(height: 0.5)
                activeToolPanel
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .padding(.bottom, safeAreaBottomInset)
        .background(
            Group {
                if viewModel.activeTool != nil {
                    Color.black.opacity(0.55)
                        .background(.ultraThinMaterial.opacity(0.7))
                } else {
                    Color.clear
                }
            }
            .ignoresSafeArea(edges: .bottom)
        )
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: viewModel.activeTool)
    }

    // MARK: - Active Tool Panel

    @ViewBuilder
    private var activeToolPanel: some View {
        switch viewModel.activeTool {
        case .bgMedia:
            bgMediaPanel
        case .drawing:
            drawingPanel
        case .bgAudio:
            bgAudioPanel
        case .text:
            textPanel.padding(.bottom, 8)
        case .media:
            mediaPanel
        case .audio:
            fgAudioPanel
        case .filter:
            StoryFilterPicker(selectedFilter: $selectedFilter, previewImage: selectedImage)
                .padding(.vertical, 12)
        case .effects:
            transitionPicker
        case .timeline:
            TimelinePanel(viewModel: viewModel)
        case .none:
            EmptyView()
        }
    }

    // MARK: - Background Media Panel

    private var bgMediaPanel: some View {
        VStack(spacing: 12) {
            HStack {
                Text("Arriere-plan")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.white.opacity(0.6))
                Spacer()
                PhotosPicker(selection: $bgPhotoItem, matching: .images) {
                    HStack(spacing: 4) {
                        Image(systemName: selectedImage != nil ? "photo.fill" : "photo.on.rectangle")
                            .font(.system(size: 12, weight: .medium))
                        Text(selectedImage != nil ? "Changer photo" : "Photo")
                            .font(.system(size: 11, weight: .medium))
                    }
                    .foregroundColor(selectedImage != nil ? MeeshyColors.brandPrimary : .white.opacity(0.7))
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(Capsule().fill(selectedImage != nil ? MeeshyColors.brandPrimary.opacity(0.15) : Color.white.opacity(0.1)))
                }
                if selectedImage != nil {
                    Button {
                        editingBgImage = selectedImage
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "pencil")
                                .font(.system(size: 12, weight: .medium))
                            Text("\u{00C9}diter")
                                .font(.system(size: 11, weight: .medium))
                        }
                        .foregroundColor(MeeshyColors.brandPrimary)
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(Capsule().fill(MeeshyColors.brandPrimary.opacity(0.15)))
                    }
                    Button {
                        withAnimation(.spring(response: 0.25)) { selectedImage = nil; viewModel.hasBackgroundImage = false }
                        HapticFeedback.light()
                    } label: {
                        Image(systemName: "xmark.circle.fill").font(.system(size: 18)).foregroundColor(.white.opacity(0.5))
                    }
                }
            }
            .padding(.horizontal, 16)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(StoryBackgroundPalette.colors, id: \.self) { hex in
                        Button {
                            viewModel.backgroundColor = "#\(hex)"
                            selectedImage = nil; viewModel.hasBackgroundImage = false
                            HapticFeedback.light()
                        } label: {
                            Circle().fill(Color(hex: hex)).frame(width: 36, height: 36)
                                .overlay(
                                    Circle().stroke(Color.white, lineWidth: viewModel.backgroundColor == "#\(hex)" && selectedImage == nil ? 2.5 : 0).padding(1)
                                )
                                .frame(width: 44, height: 44).contentShape(Circle())
                        }
                    }
                }
                .padding(.horizontal, 16)
            }

            mediaElementList(placement: "background")
        }
        .padding(.vertical, 12)
    }

    // MARK: - Drawing Panel

    private var drawingPanel: some View {
        DrawingToolbarPanel(
            toolColor: $viewModel.drawingColor,
            toolWidth: $viewModel.drawingWidth,
            toolType: $drawingTool,
            onUndo: {
                drawingCanvas.undoManager?.undo()
                viewModel.drawingData = drawingCanvas.drawing.dataRepresentation()
                HapticFeedback.light()
            },
            onRedo: {
                drawingCanvas.undoManager?.redo()
                viewModel.drawingData = drawingCanvas.drawing.dataRepresentation()
                HapticFeedback.light()
            },
            onClear: {
                drawingCanvas.drawing = PKDrawing()
                viewModel.drawingData = nil
                HapticFeedback.medium()
            }
        )
        .padding(.bottom, 8)
    }

    // MARK: - Background Audio Panel

    private var bgAudioPanel: some View {
        VStack(spacing: 0) {
        StoryAudioPanel(
            selectedAudioId: $selectedAudioId,
            selectedAudioTitle: $selectedAudioTitle,
            audioVolume: $audioVolume,
            onRecordingReady: { url in
                audioEditorItem = AudioEditorItemWrapper(url: url)
            }
        )
        .frame(maxHeight: 280)

        audioElementList(placement: "background")
        } // VStack bgAudioPanel
    }

    // MARK: - Text Panel

    @ViewBuilder
    private var textPanel: some View {
        VStack(spacing: 0) {
            if let selectedId = viewModel.selectedElementId,
               let binding = textObjectBinding(for: selectedId) {
                StoryTextEditorView(
                    textObject: binding,
                    onDelete: { viewModel.deleteElement(id: selectedId) }
                )
            }

            // Add text button — always visible when under limit
            if viewModel.canAddText {
                Button {
                    viewModel.addText()
                    HapticFeedback.light()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "plus.circle.fill")
                            .font(.system(size: 14, weight: .medium))
                        Text(viewModel.selectedElementId != nil ? "Autre texte" : "Ajouter du texte")
                            .font(.system(size: 13, weight: .medium))
                    }
                    .foregroundColor(MeeshyColors.brandPrimary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                }
            }
        }
    }

    // MARK: - Media Panel (Image + Video merged)

    private var mediaPanel: some View {
        VStack(spacing: 8) {
            HStack(spacing: 10) {
                PhotosPicker(selection: $fgMediaItem, matching: .any(of: [.images, .videos])) {
                    HStack(spacing: 6) {
                        Image(systemName: "photo.on.rectangle.angled")
                            .font(.system(size: 14, weight: .medium))
                        Text("Media")
                            .font(.system(size: 13, weight: .medium))
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 11)
                    .background(RoundedRectangle(cornerRadius: 12).fill(MeeshyColors.brandGradient))
                }
            }
            .padding(.horizontal, 16)

            mediaElementList(placement: "foreground")
        }
        .padding(.vertical, 10)
    }

    // MARK: - Foreground Audio Panel

    private var fgAudioPanel: some View {
        VStack(spacing: 8) {
            HStack(spacing: 10) {
                Button { showAudioDocumentPicker = true } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "waveform").font(.system(size: 14, weight: .medium))
                        Text("Bibliotheque").font(.system(size: 13, weight: .medium))
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity).padding(.vertical, 12)
                    .background(RoundedRectangle(cornerRadius: 12).fill(Color.white.opacity(0.1)))
                }

                Button { showVoiceRecorderSheet = true } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "mic").font(.system(size: 14, weight: .medium))
                        Text("Enregistrer").font(.system(size: 13, weight: .medium))
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity).padding(.vertical, 12)
                    .background(RoundedRectangle(cornerRadius: 12).fill(Color.white.opacity(0.1)))
                }
            }
            .padding(.horizontal, 16)

            audioElementList(placement: "foreground")
        }
        .padding(.vertical, 10)
    }

    // MARK: - Element Lists

    @ViewBuilder
    private func mediaElementList(placement: String) -> some View {
        let items = viewModel.currentEffects.mediaObjects?.filter { $0.placement == placement } ?? []
        if !items.isEmpty {
            VStack(spacing: 4) {
                ForEach(items, id: \.id) { obj in
                    let isSelected = viewModel.selectedElementId == obj.id
                    HStack(spacing: 8) {
                        if let img = viewModel.loadedImages[obj.id] {
                            Image(uiImage: img)
                                .resizable().scaledToFill()
                                .frame(width: 32, height: 32)
                                .clipShape(RoundedRectangle(cornerRadius: 6))
                        } else {
                            Image(systemName: obj.mediaType == "video" ? "video.fill" : "photo")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundStyle(MeeshyColors.indigo400)
                                .frame(width: 32, height: 32)
                                .background(RoundedRectangle(cornerRadius: 6).fill(Color.white.opacity(0.06)))
                        }
                        Text(obj.mediaType == "video" ? "Video" : "Image")
                            .font(.system(size: 12, weight: isSelected ? .bold : .medium))
                            .foregroundStyle(isSelected ? MeeshyColors.brandPrimary : .white)
                        Spacer()
                        Button {
                            viewModel.selectedElementId = obj.id
                            viewModel.selectTool(.timeline)
                        } label: {
                            Image(systemName: "timeline.selection")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(MeeshyColors.indigo400)
                                .frame(width: 28, height: 28)
                                .background(Circle().fill(MeeshyColors.indigo400.opacity(0.15)))
                        }
                        Button {
                            viewModel.deleteElement(id: obj.id)
                            HapticFeedback.medium()
                        } label: {
                            Image(systemName: "trash")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(MeeshyColors.error)
                                .frame(width: 28, height: 28)
                        }
                    }
                    .padding(.horizontal, 14).padding(.vertical, 6)
                    .background(RoundedRectangle(cornerRadius: 8).fill(isSelected ? MeeshyColors.brandPrimary.opacity(0.08) : Color.white.opacity(0.04)))
                    .onTapGesture {
                        viewModel.selectedElementId = obj.id
                        viewModel.bringToFront(id: obj.id)
                    }
                }
            }
            .padding(.horizontal, 12)
        }
    }

    @ViewBuilder
    private func audioElementList(placement: String) -> some View {
        let items = viewModel.currentEffects.audioPlayerObjects?.filter { $0.placement == placement } ?? []
        if !items.isEmpty {
            VStack(spacing: 4) {
                ForEach(items, id: \.id) { obj in
                    let isSelected = viewModel.selectedElementId == obj.id
                    HStack(spacing: 8) {
                        Image(systemName: "waveform")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(MeeshyColors.indigo400)
                            .frame(width: 32, height: 32)
                            .background(RoundedRectangle(cornerRadius: 6).fill(Color.white.opacity(0.06)))
                        Text("Audio")
                            .font(.system(size: 12, weight: isSelected ? .bold : .medium))
                            .foregroundStyle(isSelected ? MeeshyColors.brandPrimary : .white)
                        Spacer()
                        Button {
                            viewModel.selectedElementId = obj.id
                            viewModel.selectTool(.timeline)
                        } label: {
                            Image(systemName: "timeline.selection")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(MeeshyColors.indigo400)
                                .frame(width: 28, height: 28)
                                .background(Circle().fill(MeeshyColors.indigo400.opacity(0.15)))
                        }
                        Button {
                            viewModel.deleteElement(id: obj.id)
                            HapticFeedback.medium()
                        } label: {
                            Image(systemName: "trash")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(MeeshyColors.error)
                                .frame(width: 28, height: 28)
                        }
                    }
                    .padding(.horizontal, 14).padding(.vertical, 6)
                    .background(RoundedRectangle(cornerRadius: 8).fill(isSelected ? MeeshyColors.brandPrimary.opacity(0.08) : Color.white.opacity(0.04)))
                    .onTapGesture {
                        viewModel.selectedElementId = obj.id
                        viewModel.bringToFront(id: obj.id)
                    }
                }
            }
            .padding(.horizontal, 12)
        }
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
                    .foregroundColor(isSelected ? MeeshyColors.brandPrimary : .white.opacity(0.6))
                Text(label)
                    .font(.system(size: 9, weight: .medium))
                    .foregroundColor(isSelected ? MeeshyColors.brandPrimary : .white.opacity(0.4))
            }
            .frame(width: 60, height: 54)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(isSelected ? MeeshyColors.brandPrimary.opacity(0.15) : Color.white.opacity(0.06))
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(isSelected ? MeeshyColors.brandPrimary.opacity(0.5) : Color.clear, lineWidth: 1)
                    )
            )
        }
    }

    // MARK: - Helpers

    private var safeAreaBottomInset: CGFloat {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first?.windows.first?.safeAreaInsets.bottom ?? 0
    }

    private func textObjectBinding(for id: String) -> Binding<StoryTextObject>? {
        guard viewModel.currentEffects.textObjects?.contains(where: { $0.id == id }) == true else { return nil }
        return Binding(
            get: {
                viewModel.currentEffects.textObjects?.first(where: { $0.id == id })
                    ?? StoryTextObject(content: "")
            },
            set: { newObj in
                var effects = viewModel.currentEffects
                if let i = effects.textObjects?.firstIndex(where: { $0.id == id }) {
                    effects.textObjects?[i] = newObj
                    viewModel.currentEffects = effects
                }
            }
        )
    }

    // MARK: - Sync / Restore

    private func syncCurrentSlideEffects() {
        viewModel.currentEffects = buildEffects()
    }

    private func restoreCanvas(from slide: StorySlide) {
        let e = slide.effects
        if let bgHex = e.background { viewModel.backgroundColor = "#\(bgHex)" }
        else { viewModel.backgroundColor = "#0F0C29" }
        selectedImage = viewModel.slideImages[slide.id]
        viewModel.hasBackgroundImage = selectedImage != nil
        stickerObjects = e.stickerObjects ?? []
        selectedFilter = e.filter.flatMap { StoryFilter(rawValue: $0) }
        openingEffect = e.opening
        closingEffect = e.closing
        selectedAudioId = e.backgroundAudioId
        selectedAudioTitle = selectedAudioId != nil ? "Audio" : nil
        audioVolume = e.backgroundAudioVolume ?? 0.7
        audioTrimStart = e.backgroundAudioStart ?? 0
        audioTrimEnd = e.backgroundAudioEnd ?? 0
        drawingCanvas = PKCanvasView()
        if let data = e.drawingData, let drawing = try? PKDrawing(data: data) {
            drawingCanvas.drawing = drawing
        }
        viewModel.drawingData = e.drawingData
        if let bt = e.backgroundTransform {
            viewModel.backgroundTransform = StoryComposerViewModel.BackgroundTransform(
                scale: bt.scale ?? 1.0, offsetX: bt.offsetX ?? 0,
                offsetY: bt.offsetY ?? 0, rotation: bt.rotation ?? 0
            )
        } else {
            viewModel.backgroundTransform = StoryComposerViewModel.BackgroundTransform()
        }
    }

    private func buildEffects() -> StoryEffects {
        let bgHex = selectedImage != nil ? nil : viewModel.backgroundColor.replacingOccurrences(of: "#", with: "")
        let bt = viewModel.backgroundTransform
        let bgTransform = StoryBackgroundTransform(
            scale: bt.scale != 1.0 ? bt.scale : nil,
            offsetX: bt.offsetX != 0 ? bt.offsetX : nil,
            offsetY: bt.offsetY != 0 ? bt.offsetY : nil,
            rotation: bt.rotation != 0 ? bt.rotation : nil
        )
        return StoryEffects(
            background: bgHex,
            filter: selectedFilter?.rawValue,
            stickers: stickerObjects.isEmpty ? nil : stickerObjects.map(\.emoji),
            stickerObjects: stickerObjects.isEmpty ? nil : stickerObjects,
            drawingData: viewModel.drawingData,
            backgroundAudioId: selectedAudioId,
            backgroundAudioVolume: selectedAudioId != nil ? audioVolume : nil,
            backgroundAudioStart: selectedAudioId != nil ? audioTrimStart : nil,
            backgroundAudioEnd: selectedAudioId != nil && audioTrimEnd > 0 ? audioTrimEnd : nil,
            opening: openingEffect,
            closing: closingEffect,
            textObjects: viewModel.currentEffects.textObjects,
            mediaObjects: viewModel.currentEffects.mediaObjects,
            audioPlayerObjects: viewModel.currentEffects.audioPlayerObjects,
            backgroundTransform: bgTransform.isIdentity ? nil : bgTransform,
            slideDuration: Float(viewModel.currentSlideDuration)
        )
    }

    // MARK: - Media Loading

    private func loadBackgroundPhoto(from item: PhotosPickerItem?) {
        guard let item else { return }
        isLoadingMedia = true
        Task {
            defer { isLoadingMedia = false }
            guard let data = try? await item.loadTransferable(type: Data.self),
                  let image = UIImage(data: data) else { return }
            selectedImage = image
            viewModel.hasBackgroundImage = true
            viewModel.setImage(image, for: viewModel.currentSlide.id)
        }
    }

    private func handleForegroundMediaSelection(from item: PhotosPickerItem?) {
        guard let item else { return }
        let isVideo = item.supportedContentTypes.contains { $0.conforms(to: .movie) || $0.conforms(to: .video) }
        addForegroundMedia(from: item, type: isVideo ? "video" : "image")
    }

    private func addForegroundMedia(from item: PhotosPickerItem?, type: String) {
        guard let item else { return }
        Task {
            let objectId = UUID().uuidString
            if type == "video" {
                guard let data = try? await item.loadTransferable(type: Data.self) else { return }
                let ext = item.supportedContentTypes
                    .first { $0.conforms(to: .audiovisualContent) }?
                    .preferredFilenameExtension ?? "mp4"
                let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(objectId + "." + ext)
                do {
                    try data.write(to: tempURL)
                    let thumbnail = Self.generateVideoThumbnail(url: tempURL)
                    let asset = AVURLAsset(url: tempURL)
                    var mediaDuration: Float?
                    if let cmDur = try? await asset.load(.duration) {
                        let secs = CMTimeGetSeconds(cmDur)
                        if secs > 0, secs.isFinite { mediaDuration = Float(secs) }
                    }
                    await MainActor.run {
                        viewModel.loadedVideoURLs[objectId] = tempURL
                        if let thumbnail { viewModel.loadedImages[objectId] = thumbnail }
                        if let obj = viewModel.addMediaObject(type: "video") {
                            viewModel.loadedVideoURLs[obj.id] = tempURL
                            if let thumbnail { viewModel.loadedImages[obj.id] = thumbnail }
                            if obj.id != objectId {
                                viewModel.loadedVideoURLs.removeValue(forKey: objectId)
                                viewModel.loadedImages.removeValue(forKey: objectId)
                            }
                            if let dur = mediaDuration {
                                viewModel.autoExtendDuration(forElementEnd: dur)
                            }
                        }
                    }
                } catch {
                    print("[StoryComposer] Video write error: \(error)")
                }
            } else {
                guard let data = try? await item.loadTransferable(type: Data.self),
                      let image = UIImage(data: data) else { return }
                await MainActor.run {
                    if let obj = viewModel.addMediaObject(type: "image") {
                        viewModel.loadedImages[obj.id] = image
                    }
                }
            }
            await MainActor.run {
                fgMediaItem = nil
            }
        }
    }

    private func addVocalToForeground() {
        guard let url = confirmedMediaAudioURL else { return }
        Task {
            let samples = (try? await WaveformGenerator.shared.generateSamples(from: url)) ?? []
            let asset = AVURLAsset(url: url)
            var mediaDuration: Float?
            if let cmDur = try? await asset.load(.duration) {
                let secs = CMTimeGetSeconds(cmDur)
                if secs > 0, secs.isFinite { mediaDuration = Float(secs) }
            }
            await MainActor.run {
                if let obj = viewModel.addAudioObject() {
                    viewModel.loadedAudioURLs[obj.id] = url
                    // Update waveform samples
                    var effects = viewModel.currentEffects
                    if let idx = effects.audioPlayerObjects?.firstIndex(where: { $0.id == obj.id }) {
                        effects.audioPlayerObjects?[idx].waveformSamples = samples
                        viewModel.currentEffects = effects
                    }
                    if let dur = mediaDuration {
                        viewModel.autoExtendDuration(forElementEnd: dur)
                    }
                }
                confirmedMediaAudioURL = nil
            }
        }
    }

    private func openMediaEditor(elementId: String) {
        let mediaObj = viewModel.currentEffects.mediaObjects?.first(where: { $0.id == elementId })
        guard let mediaObj else { return }

        if mediaObj.mediaType == "video", let url = viewModel.loadedVideoURLs[elementId] {
            editingElementVideo = EditingMediaVideo(elementId: elementId, url: url)
        } else if let image = viewModel.loadedImages[elementId] {
            editingElementImage = EditingMediaImage(elementId: elementId, image: image)
        }
    }

    private func addRecordingToBackground(url: URL) {
        Task {
            let samples = (try? await WaveformGenerator.shared.generateSamples(from: url)) ?? []
            await MainActor.run {
                if let obj = viewModel.addAudioObject(placement: "background") {
                    viewModel.loadedAudioURLs[obj.id] = url
                    var effects = viewModel.currentEffects
                    if let idx = effects.audioPlayerObjects?.firstIndex(where: { $0.id == obj.id }) {
                        effects.audioPlayerObjects?[idx].waveformSamples = samples
                        viewModel.currentEffects = effects
                    }
                }
            }
        }
    }

    // MARK: - Publication

    private func publishAllSlides() {
        syncCurrentSlideEffects()
        let snapshot = snapshotAllSlides()
        let allMediaURLs = viewModel.loadedVideoURLs.merging(viewModel.loadedAudioURLs) { v, _ in v }
        clearAllDrafts()
        HapticFeedback.success()
        onPublishAllInBackground(snapshot.slides, snapshot.bgImages, viewModel.loadedImages, allMediaURLs)
    }

    private func snapshotAllSlides() -> (slides: [StorySlide], bgImages: [String: UIImage]) {
        var slides = viewModel.slides
        let idx = viewModel.currentSlideIndex
        if idx < slides.count {
            slides[idx].effects = buildEffects()
        }
        return (slides, viewModel.slideImages)
    }

    // MARK: - Dismiss

    private func handleDismiss() {
        let hasContent = viewModel.slides.contains { slide in
            slide.content != nil
                || viewModel.slideImages[slide.id] != nil
                || slide.effects.background != nil
                || !(slide.effects.textObjects ?? []).isEmpty
                || !(slide.effects.mediaObjects ?? []).isEmpty
        } || !stickerObjects.isEmpty || viewModel.drawingData != nil

        if hasContent { showDiscardAlert = true }
        else { publishTask?.cancel(); publishTask = nil; clearAllDrafts(); onDismiss() }
    }

    private func saveDraftAndDismiss() {
        saveDraft()
        onDismiss()
    }

    private func cancelAndDismiss() {
        publishTask?.cancel()
        publishTask = nil
        clearAllDrafts()
        onDismiss()
    }

    // MARK: - Draft Persistence

    private func saveDraft() {
        syncCurrentSlideEffects()
        StoryDraftStore.shared.save(slides: viewModel.slides, visibility: visibility)
        StoryDraftStore.shared.saveMedia(
            images: viewModel.loadedImages,
            videoURLs: viewModel.loadedVideoURLs,
            audioURLs: viewModel.loadedAudioURLs
        )
        HapticFeedback.light()
    }

    private func checkForDraft() {
        if StoryDraftStore.shared.load() != nil {
            showRestoreDraftAlert = true
        } else if UserDefaults.standard.data(forKey: StoryComposerDraft.userDefaultsKey) != nil {
            showRestoreDraftAlert = true
        }
    }

    private func restoreDraft() {
        if let stored = StoryDraftStore.shared.load() {
            viewModel.slides = stored.slides.isEmpty ? [StorySlide()] : stored.slides
            viewModel.currentSlideIndex = 0
            visibility = stored.visibility
            let media = StoryDraftStore.shared.loadMedia()
            viewModel.loadedImages.merge(media.images) { _, new in new }
            viewModel.loadedVideoURLs.merge(media.videoURLs) { _, new in new }
            viewModel.loadedAudioURLs.merge(media.audioURLs) { _, new in new }
        } else if let data = UserDefaults.standard.data(forKey: StoryComposerDraft.userDefaultsKey),
                  let draft = try? JSONDecoder().decode(StoryComposerDraft.self, from: data) {
            viewModel.slides = draft.slides.isEmpty ? [StorySlide()] : draft.slides
            viewModel.currentSlideIndex = 0
            visibility = draft.visibilityPreference
        }
        if let first = viewModel.slides.first {
            restoreCanvas(from: first)
        }
    }

    private func clearAllDrafts() {
        StoryDraftStore.shared.clear()
        UserDefaults.standard.removeObject(forKey: StoryComposerDraft.userDefaultsKey)
    }

    // MARK: - Video Thumbnail

    static func generateVideoThumbnail(url: URL) -> UIImage? {
        let asset = AVURLAsset(url: url)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 400, height: 400)
        return try? UIImage(cgImage: generator.copyCGImage(at: .zero, actualTime: nil))
    }
}

// MARK: - Audio Editor Item Wrapper

private struct AudioEditorItemWrapper: Identifiable {
    let id = UUID()
    let url: URL
}

// MARK: - Media Editor Wrappers

private struct PendingImageWrapper: Identifiable {
    let id = UUID()
    let image: UIImage
}

struct EditingMediaImage: Identifiable {
    let id = UUID()
    let elementId: String
    let image: UIImage
}

struct EditingMediaVideo: Identifiable {
    let id = UUID()
    let elementId: String
    let url: URL
}
