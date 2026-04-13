import SwiftUI
import UIKit
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

    public static func randomBackgroundColor() -> String {
        let existingSet = Set(colors.map { $0.uppercased() })
        var hex: String
        repeat {
            let hue = Double.random(in: 0...1)
            let saturation = Double.random(in: 0.5...0.9)
            let brightness = Double.random(in: 0.2...0.7)
            let color = UIColor(hue: hue, saturation: saturation, brightness: brightness, alpha: 1.0)
            var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0
            color.getRed(&r, green: &g, blue: &b, alpha: nil)
            hex = String(format: "%02X%02X%02X", Int(r * 255), Int(g * 255), Int(b * 255))
        } while existingSet.contains(hex)
        return hex
    }
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
    @State private var storyLanguage: String = {
        if let kbd = UITextInputMode.activeInputModes.first?.primaryLanguage {
            return String(kbd.prefix(2))
        }
        return AuthManager.shared.currentUser?.systemLanguage ?? "fr"
    }()
    @State private var showFilterSheet = false
    @State private var showTransitionSheet = false
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
    @State private var mediaLoadProgress: Double = 0
    @State private var mediaLoadLabel: String = ""
    @State private var visibility: String = "PUBLIC"

    // MARK: - Transition effects (local until synced to effects)

    @State private var openingEffect: StoryTransitionEffect?
    @State private var closingEffect: StoryTransitionEffect?

    @Environment(\.theme) private var theme

    // MARK: - Callbacks (public API preserved)

    public var onPublishSlide: (StorySlide, UIImage?, [String: UIImage], [String: URL], String?) async throws -> Void
    public var onPublishAllInBackground: (
        _ slides: [StorySlide],
        _ slideImages: [String: UIImage],
        _ loadedImages: [String: UIImage],
        _ loadedVideoURLs: [String: URL],
        _ loadedAudioURLs: [String: URL],
        _ originalLanguage: String?
    ) -> Void
    public var onPreview: ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL]) -> Void
    public var onDismiss: () -> Void

    public init(
        onPublishSlide: @escaping (StorySlide, UIImage?, [String: UIImage], [String: URL], String?) async throws -> Void = { _, _, _, _, _ in },
        onPublishAllInBackground: @escaping ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL], String?) -> Void,
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
                    Color.black.opacity(0.4)
                        .overlay {
                            VStack(spacing: 12) {
                                ZStack {
                                    Circle()
                                        .stroke(Color.white.opacity(0.2), lineWidth: 4)
                                        .frame(width: 56, height: 56)
                                    Circle()
                                        .trim(from: 0, to: mediaLoadProgress)
                                        .stroke(MeeshyColors.brandGradient, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                                        .frame(width: 56, height: 56)
                                        .rotationEffect(.degrees(-90))
                                        .animation(.easeInOut(duration: 0.3), value: mediaLoadProgress)
                                    Text("\(Int(mediaLoadProgress * 100))%")
                                        .font(.system(size: 13, weight: .bold, design: .rounded))
                                        .foregroundColor(.white)
                                }
                                if !mediaLoadLabel.isEmpty {
                                    Text(mediaLoadLabel)
                                        .font(.system(size: 12, weight: .medium))
                                        .foregroundColor(.white.opacity(0.8))
                                }
                            }
                        }
                        .allowsHitTesting(false)
                        .transition(.opacity)
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
        .onAppear {
            viewModel.startMemoryObserver()
        }
        .onDisappear {
            StoryMediaCoordinator.shared.deactivate()
            publishTask?.cancel()
            publishTask = nil
            viewModel.stopMemoryObserver()
            // Do NOT cleanup temp files here — background upload may still need them.
            // Cleanup happens after upload completes in StoryViewModel.launchUploadTask.
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
                .navigationTitle(String(localized: "story.composer.recordVocal", defaultValue: "Enregistrer un vocal", bundle: .module))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button(String(localized: "story.composer.cancel", defaultValue: "Annuler", bundle: .module)) { showVoiceRecorderSheet = false }
                    }
                }
            }
            .presentationDetents([.medium])
        }
        .sheet(isPresented: $viewModel.isTimelineVisible) {
            TimelinePanel(viewModel: viewModel)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showFilterSheet) {
            NavigationStack {
                StoryFilterPicker(selectedFilter: $selectedFilter, previewImage: selectedImage)
                    .navigationTitle(String(localized: "story.composer.filter", defaultValue: "Filtre", bundle: .module))
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .topBarTrailing) {
                            Button(String(localized: "story.composer.done", defaultValue: "OK", bundle: .module)) { showFilterSheet = false }
                        }
                    }
            }
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showTransitionSheet) {
            NavigationStack {
                transitionPicker
                    .navigationTitle(String(localized: "story.composer.transitions", defaultValue: "Transitions", bundle: .module))
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .topBarTrailing) {
                            Button(String(localized: "story.composer.done", defaultValue: "OK", bundle: .module)) { showTransitionSheet = false }
                        }
                    }
            }
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
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
        .alert(String(localized: "story.composer.resumeStory", defaultValue: "Reprendre votre story ?", bundle: .module), isPresented: $showRestoreDraftAlert) {
            Button(String(localized: "story.composer.resume", defaultValue: "Reprendre", bundle: .module)) { restoreDraft() }
            Button(String(localized: "story.composer.clearDraft", defaultValue: "Effacer le brouillon", bundle: .module), role: .destructive) { clearAllDrafts() }
        } message: {
            Text(String(localized: "story.composer.unpublishedDraft", defaultValue: "Vous avez un brouillon non publie.", bundle: .module))
        }
        .alert(String(localized: "story.composer.quitWithoutPublishing", defaultValue: "Quitter sans publier ?", bundle: .module), isPresented: $showDiscardAlert) {
            Button(String(localized: "story.composer.save", defaultValue: "Sauvegarder", bundle: .module)) { saveDraftAndDismiss() }
            Button(String(localized: "story.composer.quit", defaultValue: "Quitter", bundle: .module), role: .destructive) { cancelAndDismiss() }
            Button(String(localized: "story.composer.cancelAction", defaultValue: "Annuler", bundle: .module), role: .cancel) { }
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
                Text(String(localized: "story.composer.publish", defaultValue: "Publier", bundle: .module)).font(.system(size: 13, weight: .bold)).lineLimit(1)
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
            // Slide tools
            Button { showFilterSheet = true } label: {
                Label(
                    String(localized: "story.composer.filter", defaultValue: "Filtre", bundle: .module),
                    systemImage: selectedFilter != nil ? "camera.filters" : "camera.filters"
                )
            }
            Button { showTransitionSheet = true } label: {
                Label(
                    String(localized: "story.composer.transitions", defaultValue: "Transitions", bundle: .module),
                    systemImage: "rectangle.2.swap"
                )
            }
            Button { viewModel.isTimelineVisible = true } label: {
                Label(
                    String(localized: "story.composer.timeline", defaultValue: "Timeline", bundle: .module),
                    systemImage: "clock"
                )
            }

            Divider()

            Button { saveDraft() } label: {
                Label(String(localized: "story.composer.saveDraft", defaultValue: "Sauvegarder le brouillon", bundle: .module), systemImage: "square.and.arrow.down")
            }
            Menu {
                Button { visibility = "PUBLIC" } label: {
                    Label(String(localized: "story.composer.public", defaultValue: "Public", bundle: .module), systemImage: visibility == "PUBLIC" ? "checkmark" : "globe")
                }
                Button { visibility = "FRIENDS" } label: {
                    Label(String(localized: "story.composer.friends", defaultValue: "Amis", bundle: .module), systemImage: visibility == "FRIENDS" ? "checkmark" : "person.2")
                }
                Button { visibility = "PRIVATE" } label: {
                    Label(String(localized: "story.composer.private", defaultValue: "Prive", bundle: .module), systemImage: visibility == "PRIVATE" ? "checkmark" : "lock")
                }
            } label: {
                Label(String(localized: "story.composer.visibility", defaultValue: "Visibilite", bundle: .module), systemImage: "eye")
            }
            Divider()
            Button(role: .destructive) { viewModel.reset() } label: {
                Label(String(localized: "story.composer.deleteAllSlides", defaultValue: "Supprimer tous les slides", bundle: .module), systemImage: "trash")
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
                    Label(String(localized: "story.composer.deleteSlide", defaultValue: "Supprimer", bundle: .module), systemImage: "trash")
                }
            }
            Button {
                syncCurrentSlideEffects()
                viewModel.duplicateSlide(at: index)
                restoreCanvas(from: viewModel.currentSlide)
            } label: {
                Label(String(localized: "story.composer.duplicateSlide", defaultValue: "Dupliquer", bundle: .module), systemImage: "doc.on.doc")
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
        // DISABLED: bgAudio — non fonctionnel
        // case .bgAudio:
        //     bgAudioPanel
        case .text:
            textPanel.padding(.bottom, 8)
        case .media:
            mediaPanel
        case .audio:
            fgAudioPanel
        // DISABLED: filter, effects, timeline — deplacees en menu contextuel par element
        // case .filter:
        //     StoryFilterPicker(selectedFilter: $selectedFilter, previewImage: selectedImage)
        //         .padding(.vertical, 12)
        // case .effects:
        //     transitionPicker
        // case .timeline:
        //     TimelinePanel(viewModel: viewModel)
        case .none:
            EmptyView()
        }
    }

    // MARK: - Background Media Panel

    private var bgMediaPanel: some View {
        VStack(spacing: 12) {
            HStack {
                Text(String(localized: "story.composer.backgroundLabel", defaultValue: "Arriere-plan", bundle: .module))
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.white.opacity(0.6))
                Spacer()
                PhotosPicker(selection: $bgPhotoItem, matching: .any(of: [.images, .videos])) {
                    HStack(spacing: 4) {
                        Image(systemName: selectedImage != nil ? "photo.fill" : "photo.on.rectangle")
                            .font(.system(size: 12, weight: .medium))
                        Text(selectedImage != nil
                            ? String(localized: "story.composer.changeMedia", defaultValue: "Changer", bundle: .module)
                            : String(localized: "story.composer.photoOrVideo", defaultValue: "Photo/Video", bundle: .module))
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
                            Text(String(localized: "story.composer.edit", defaultValue: "\u{00C9}diter", bundle: .module))
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
                        Text(viewModel.selectedElementId != nil ? String(localized: "story.composer.anotherText", defaultValue: "Autre texte", bundle: .module) : String(localized: "story.composer.addText", defaultValue: "Ajouter du texte", bundle: .module))
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
                        Text(String(localized: "story.composer.media", defaultValue: "Media", bundle: .module))
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
                        Text(String(localized: "story.composer.library", defaultValue: "Bibliotheque", bundle: .module)).font(.system(size: 13, weight: .medium))
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity).padding(.vertical, 12)
                    .background(RoundedRectangle(cornerRadius: 12).fill(Color.white.opacity(0.1)))
                }

                Button { showVoiceRecorderSheet = true } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "mic").font(.system(size: 14, weight: .medium))
                        Text(String(localized: "story.composer.recordAudio", defaultValue: "Enregistrer", bundle: .module)).font(.system(size: 13, weight: .medium))
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
        return Group {
            if !items.isEmpty {
                VStack(spacing: 4) {
                    ForEach(items, id: \.id) { obj in
                        mediaElementRow(obj: obj)
                    }
                }
                .padding(.horizontal, 12)
            }
        }
    }

    private func mediaElementRow(obj: StoryMediaObject) -> some View {
        let isSelected = viewModel.selectedElementId == obj.id
        return HStack(spacing: 8) {
            mediaElementThumbnail(obj: obj)
            Text(obj.mediaType == "video" ? String(localized: "story.composer.videoLabel", defaultValue: "Video", bundle: .module) : String(localized: "story.composer.imageLabel", defaultValue: "Image", bundle: .module))
                .font(.system(size: 12, weight: isSelected ? .bold : .medium))
                .foregroundStyle(isSelected ? MeeshyColors.brandPrimary : .white)
            Spacer()
            Button {
                viewModel.selectedElementId = obj.id
                viewModel.isTimelineVisible = true
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

    @ViewBuilder
    private func mediaElementThumbnail(obj: StoryMediaObject) -> some View {
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
    }

    private func audioElementList(placement: String) -> some View {
        let items = viewModel.currentEffects.audioPlayerObjects?.filter { $0.placement == placement } ?? []
        return Group {
            if !items.isEmpty {
                VStack(spacing: 4) {
                    ForEach(items, id: \.id) { obj in
                        audioElementRow(obj: obj)
                    }
                }
                .padding(.horizontal, 12)
            }
        }
    }

    private func audioElementRow(obj: StoryAudioPlayerObject) -> some View {
        let isSelected = viewModel.selectedElementId == obj.id
        return HStack(spacing: 8) {
            Image(systemName: "waveform")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(MeeshyColors.indigo400)
                .frame(width: 32, height: 32)
                .background(RoundedRectangle(cornerRadius: 6).fill(Color.white.opacity(0.06)))
            Text(String(localized: "story.composer.audioLabel", defaultValue: "Audio", bundle: .module))
                .font(.system(size: 12, weight: isSelected ? .bold : .medium))
                .foregroundStyle(isSelected ? MeeshyColors.brandPrimary : .white)
            Spacer()
            Button {
                viewModel.selectedElementId = obj.id
                viewModel.isTimelineVisible = true
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

    // MARK: - Transition Picker

    private var transitionPicker: some View {
        VStack(spacing: 12) {
            Text(String(localized: "story.composer.openingEffect", defaultValue: "Effet d'ouverture", bundle: .module))
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.white.opacity(0.6))
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    effectButton(effect: nil, label: String(localized: "story.composer.noEffect", defaultValue: "Aucun", bundle: .module), icon: "minus.circle", isOpening: true)
                    ForEach(StoryTransitionEffect.allCases, id: \.self) { effect in
                        effectButton(effect: effect, label: effect.label, icon: effect.iconName, isOpening: true)
                    }
                }
                .padding(.horizontal, 2)
            }
            Text(String(localized: "story.composer.closingEffect", defaultValue: "Effet de fermeture", bundle: .module))
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.white.opacity(0.6))
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    effectButton(effect: nil, label: String(localized: "story.composer.noEffect", defaultValue: "Aucun", bundle: .module), icon: "minus.circle", isOpening: false)
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
        else { viewModel.backgroundColor = "#\(StoryBackgroundPalette.randomBackgroundColor())" }
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
        let isVideo = item.supportedContentTypes.contains { $0.conforms(to: .movie) || $0.conforms(to: .video) }

        isLoadingMedia = true
        mediaLoadProgress = 0
        mediaLoadLabel = isVideo
            ? String(localized: "story.composer.loadingVideo", defaultValue: "Chargement de la video...", bundle: .module)
            : String(localized: "story.composer.loadingBackground", defaultValue: "Chargement de l'image...", bundle: .module)

        Task {
            defer {
                isLoadingMedia = false
                mediaLoadProgress = 0
                mediaLoadLabel = ""
            }

            if isVideo {
                // Background VIDEO — write to temp, extract thumbnail, add as background media object
                guard let data = try? await item.loadTransferable(type: Data.self) else { return }
                mediaLoadProgress = 0.3

                let objectId = UUID().uuidString
                let ext = item.supportedContentTypes
                    .first { $0.conforms(to: .audiovisualContent) }?
                    .preferredFilenameExtension ?? "mp4"
                let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent("bg_\(objectId).\(ext)")
                do {
                    try data.write(to: tempURL)
                } catch { return }
                mediaLoadProgress = 0.6

                let thumbnail = await StoryMediaLoader.shared.videoThumbnail(url: tempURL, maxDimension: 1080)
                mediaLoadProgress = 0.8

                // Use thumbnail as preview image
                if let thumbnail { selectedImage = thumbnail }
                viewModel.hasBackgroundImage = true
                viewModel.loadedVideoURLs[objectId] = tempURL
                if let thumbnail { viewModel.loadedImages[objectId] = thumbnail }

                // Add as background media object in effects
                if let obj = viewModel.addMediaObject(type: "video", placement: "background") {
                    viewModel.loadedVideoURLs[obj.id] = tempURL
                    if let thumbnail { viewModel.loadedImages[obj.id] = thumbnail }
                    if obj.id != objectId {
                        viewModel.loadedVideoURLs.removeValue(forKey: objectId)
                        viewModel.loadedImages.removeValue(forKey: objectId)
                    }
                    // Auto-extend slide duration to video length
                    let asset = AVURLAsset(url: tempURL)
                    if let cmDur = try? await asset.load(.duration) {
                        let secs = CMTimeGetSeconds(cmDur)
                        if secs > 0, secs.isFinite {
                            viewModel.autoExtendDuration(forElementEnd: Float(secs))
                        }
                    }
                }
                mediaLoadProgress = 1.0
            } else {
                // Background IMAGE — downsample via ImageIO
                mediaLoadProgress = 0.3
                guard let image = await StoryMediaLoader.shared.loadImage(from: item, maxDimension: 1080) else { return }
                mediaLoadProgress = 1.0
                selectedImage = image
                viewModel.hasBackgroundImage = true
                viewModel.setImage(image, for: viewModel.currentSlide.id)
            }
        }
    }

    private func handleForegroundMediaSelection(from item: PhotosPickerItem?) {
        guard let item else { return }
        let isVideo = item.supportedContentTypes.contains { $0.conforms(to: .movie) || $0.conforms(to: .video) }
        addForegroundMedia(from: item, type: isVideo ? "video" : "image")
    }

    private func addForegroundMedia(from item: PhotosPickerItem?, type: String) {
        guard let item else { return }
        isLoadingMedia = true
        mediaLoadProgress = 0
        mediaLoadLabel = type == "video"
            ? String(localized: "story.composer.loadingVideo", defaultValue: "Chargement de la video...", bundle: .module)
            : String(localized: "story.composer.loadingImage", defaultValue: "Chargement de l'image...", bundle: .module)
        Task {
            defer {
                isLoadingMedia = false
                mediaLoadProgress = 0
                mediaLoadLabel = ""
            }
            let objectId = UUID().uuidString
            if type == "video" {
                guard let data = try? await item.loadTransferable(type: Data.self) else { return }
                mediaLoadProgress = 0.3
                let ext = item.supportedContentTypes
                    .first { $0.conforms(to: .audiovisualContent) }?
                    .preferredFilenameExtension ?? "mp4"
                let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(objectId + "." + ext)
                do {
                    try data.write(to: tempURL)
                    mediaLoadProgress = 0.5
                    // Async thumbnail extraction via StoryMediaLoader (cached, off main thread)
                    let thumbnail = await StoryMediaLoader.shared.videoThumbnail(url: tempURL, maxDimension: 400)
                    mediaLoadProgress = 0.7
                    let asset = AVURLAsset(url: tempURL)
                    var mediaDuration: Float?
                    if let cmDur = try? await asset.load(.duration) {
                        let secs = CMTimeGetSeconds(cmDur)
                        if secs > 0, secs.isFinite { mediaDuration = Float(secs) }
                    }
                    mediaLoadProgress = 1.0
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
                // ImageIO downsample for foreground images (max 1080px)
                mediaLoadProgress = 0.3
                guard let data = try? await item.loadTransferable(type: Data.self),
                      let image = await StoryMediaLoader.shared.loadImage(data: data, maxDimension: 1080) else { return }
                mediaLoadProgress = 1.0
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
        clearAllDrafts()
        HapticFeedback.success()
        onPublishAllInBackground(snapshot.slides, snapshot.bgImages, viewModel.loadedImages, viewModel.loadedVideoURLs, viewModel.loadedAudioURLs, storyLanguage)
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
    // DEPRECATED: Replaced by StoryMediaLoader.shared.videoThumbnail(url:) — async, cached, off main thread.
    // Kept for backward compatibility with external callers.

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

// MARK: - Story Language Picker

struct StoryLanguagePickerView: View {
    @Binding var selectedLanguage: String
    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""

    private var languages: [(code: String, name: String)] {
        Locale.availableIdentifiers
            .compactMap { id -> (String, String)? in
                let locale = Locale(identifier: id)
                guard let langCode = locale.language.languageCode?.identifier,
                      langCode.count >= 2, langCode.count <= 3,
                      let name = Locale.current.localizedString(forLanguageCode: langCode) else { return nil }
                return (langCode, name.prefix(1).uppercased() + name.dropFirst())
            }
            .reduce(into: [(String, String)]()) { result, item in
                if !result.contains(where: { $0.0 == item.0 }) { result.append(item) }
            }
            .sorted { $0.1 < $1.1 }
    }

    private var filteredLanguages: [(code: String, name: String)] {
        guard !searchText.isEmpty else { return languages }
        let query = searchText.lowercased()
        return languages.filter { $0.name.lowercased().contains(query) || $0.code.lowercased().contains(query) }
    }

    var body: some View {
        NavigationStack {
            List(filteredLanguages, id: \.code) { item in
                Button {
                    selectedLanguage = item.code
                    HapticFeedback.light()
                    dismiss()
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.name)
                                .font(.system(size: 16, weight: selectedLanguage == item.code ? .semibold : .regular))
                                .foregroundColor(.primary)
                            Text(item.code)
                                .font(.system(size: 12))
                                .foregroundColor(.secondary)
                        }
                        Spacer()
                        if selectedLanguage == item.code {
                            Image(systemName: "checkmark")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundColor(MeeshyColors.indigo500)
                        }
                    }
                }
            }
            .searchable(text: $searchText, prompt: "Rechercher une langue")
            .navigationTitle("Langue du contenu")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Fermer") { dismiss() }
                        .foregroundColor(MeeshyColors.indigo500)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}
