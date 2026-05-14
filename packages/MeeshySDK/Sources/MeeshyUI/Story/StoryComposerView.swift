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
        // Soft pastel palette : low saturation + very high brightness keeps
        // each pick desaturated enough that the picker tiles + text overlays
        // stay clearly legible on top. Higher saturation (>0.25) tinted the
        // canvas too strongly and washed out the tile contents. Aligned with
        // the glass-aesthetic shift (commit `59b90364`).
        let existingSet = Set(colors.map { $0.uppercased() })
        var hex: String
        repeat {
            let hue = Double.random(in: 0...1)
            let saturation = Double.random(in: 0.14...0.24)
            let brightness = Double.random(in: 0.93...0.98)
            let color = UIColor(hue: hue, saturation: saturation, brightness: brightness, alpha: 1.0)
            var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0
            color.getRed(&r, green: &g, blue: &b, alpha: nil)
            hex = String(format: "%02X%02X%02X", Int(r * 255), Int(g * 255), Int(b * 255))
        } while existingSet.contains(hex)
        return hex
    }

    /// SwiftUI-friendly variant of `randomBackgroundColor()`.
    /// Returns the same random HSB pick as a `Color` so callers (story
    /// notification thumbnails, in-feed placeholders) can pass it straight
    /// into a SwiftUI gradient or `.fill(...)` without re-parsing the hex.
    public static func randomBackgroundColorAsColor() -> Color {
        Color(hex: randomBackgroundColor())
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

    @State private var fgMediaItem: PhotosPickerItem?

    // MARK: - Empty-state picker selection animation
    //
    // Briefly latched when the user taps a tile in `emptyStateLargePicker`,
    // before the selection propagates to `viewModel.selectTool(_:)`. Drives
    // the highlight + fade-others animation in `largeToolTile`.
    @State private var pickerSelectedTool: StoryToolMode?

    // MARK: - Media editor (triggered by edit button on canvas elements)

    @State private var editingBgImage: UIImage?
    @State private var editingElementImage: EditingMediaImage?
    @State private var editingElementVideo: EditingMediaVideo?

    // MARK: - Audio pickers

    @State private var showAudioDocumentPicker = false
    @State private var showVoiceRecorderSheet = false
    // Prisme Linguistique: the story's source language comes from the user's
    // in-app content preferences (systemLanguage → regionalLanguage → "fr"),
    // NEVER from the keyboard locale. See `StoryComposerViewModel
    // .resolveComposerSourceLanguage(user:)` for the canonical resolver.
    @State private var storyLanguage: String = StoryComposerViewModel
        .resolveComposerSourceLanguage(user: AuthManager.shared.currentUser)
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
        (!viewModel.isCanvasZoomed && areFabsVisible) || viewModel.activeTool != nil || viewModel.selectedElementId != nil
    }

    // MARK: - Pickers
    private var transitionPicker: some View {
        Text("Transitions")
            .foregroundColor(.white)
    }

    // MARK: - UI state

    @State private var areFabsVisible: Bool = true
    @State private var bandStateMachine: BandStateMachine = BandStateMachine()

    @State private var showDiscardAlert = false
    @State private var showRestoreDraftAlert = false
    @State private var isLoadingMedia = false
    @State private var mediaLoadProgress: Double = 0
    @State private var mediaLoadLabel: String = ""
    @State private var visibility: String = "PUBLIC"
    @State private var lostMediaCount: Int = 0  // > 0 triggers an alert after restoreDraft

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
        _ originalLanguage: String?,
        _ visibility: String
    ) -> Void
    public var onPreview: ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL]) -> Void
    public var onDismiss: () -> Void

    public init(
        onPublishSlide: @escaping (StorySlide, UIImage?, [String: UIImage], [String: URL], String?) async throws -> Void = { _, _, _, _, _ in },
        onPublishAllInBackground: @escaping ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL], String?, String) -> Void,
        onPreview: @escaping ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL]) -> Void,
        onDismiss: @escaping () -> Void
    ) {
        self.onPublishSlide = onPublishSlide
        self.onPublishAllInBackground = onPublishAllInBackground
        self.onPreview = onPreview
        self.onDismiss = onDismiss
    }

    /// Repost-aware initializer (C.1). Lets a caller hand the composer a
    /// pre-built `StoryComposerViewModel` — typically one constructed via
    /// `StoryComposerViewModel(reposting:authorHandle:)` so the canvas opens
    /// already populated with the source slide + locked attribution badge.
    ///
    /// `onPreview` is left as a no-op default here because the repost flow does
    /// not branch through the preview cycle (the slide is already known).
    public init(
        viewModel: StoryComposerViewModel,
        onPublishSlide: @escaping (StorySlide, UIImage?, [String: UIImage], [String: URL], String?) async throws -> Void = { _, _, _, _, _ in },
        onPublishAllInBackground: @escaping ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL], String?, String) -> Void,
        onPreview: @escaping ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL]) -> Void = { _, _, _, _, _ in },
        onDismiss: @escaping () -> Void
    ) {
        self._viewModel = State(wrappedValue: viewModel)
        self.onPublishSlide = onPublishSlide
        self.onPublishAllInBackground = onPublishAllInBackground
        self.onPreview = onPreview
        self.onDismiss = onDismiss
    }

    // MARK: - Body

    private var mainContent: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            // Canvas core (CALayer) + drawing overlay + viewport modifiers,
            // extracted into `canvasComposerLayer` so the SwiftUI type-checker
            // doesn't time out on this body's full modifier chain.
            canvasComposerLayer

            // Top bar — auto-hides during canvas zoom to reveal canvas controls
            VStack(spacing: 0) {
                if showTopBar {
                    topBar
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
                Spacer()
            }
            .animation(.spring(response: 0.3, dampingFraction: 0.85), value: showTopBar)

            // Bottom: toolbar + active panel.
            // When the composer is empty (no content + no tool selected) we
            // swap the compact toolbar for `emptyStateLargePicker` — large
            // rectangular tiles in a horizontal carousel taking the bottom
            // half of the screen. The compact toolbar comes back as soon as
            // a tool is selected OR a slide has any content.
            bottomRegion
        }
        .statusBarHidden()
        .onAppear {
            viewModel.startMemoryObserver()
            viewModel.loadCurrentSlideIntoTimeline()
            // Apply the random pastel background (initialised on VM) to the
            // current slide right away so the canvas previews the chosen
            // color instead of staying black until the user touches anything.
            // Without this, `slide.effects.background` is nil and the canvas
            // falls back to opaque black.
            if viewModel.currentSlide.effects.background == nil {
                syncCurrentSlideEffects()
            }
        }
        .onChange(of: viewModel.currentSlideIndex) { _, _ in
            viewModel.loadCurrentSlideIntoTimeline()
            bandStateMachine.reset()
            areFabsVisible = true
        }
        .onDisappear {
            StoryMediaCoordinator.shared.deactivate()
            publishTask?.cancel()
            publishTask = nil
            viewModel.stopMemoryObserver()
            // Do NOT cleanup temp files here — background upload may still need them.
            // Cleanup happens after upload completes in StoryViewModel.launchUploadTask.
        }
        .onChange(of: fgMediaItem) { _, item in handleForegroundMediaSelection(from: item) }
        // Real-time canvas sync — Task 2.18 migration. Toolbars + sheets
        // mutate composer-local @State (`selectedFilter`, `stickerObjects`,
        // `selectedImage`, …); the CALayer canvas reads from
        // `viewModel.currentSlide.effects` exclusively, so re-serialize on
        // each toolbar mutation. Five separate `.onChange` modifiers tipped
        // the type-checker over the time-out threshold, so we collapse them
        // into a single extension modifier to maintain performance in O(1).
        .granularCanvasSync(
            filter: selectedFilter?.rawValue,
            hasImage: selectedImage != nil,
            stickersCount: stickerObjects.count,
            drawingCount: viewModel.drawingData?.count ?? 0,
            bgColor: viewModel.backgroundColor,
            action: { syncCurrentSlideEffects() }
        )
    }

    // Sheets and full-screen covers are extracted here to keep `body` small
    // enough for the SwiftUI type-checker to handle within its time budget.
    private var sheetModifiers: some View {
        mainContent
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
        .sheet(isPresented: $viewModel.isTimelineVisible,
               onDismiss: { viewModel.commitTimelineToCurrentSlide() }) {
            TimelineContainerSwitcher(viewModel: viewModel.timelineViewModel)
                .presentationDetents([.fraction(0.45), .large])
                .presentationDragIndicator(.visible)
                .presentationBackground(.ultraThinMaterial)
                .presentationContentInteraction(.scrolls)
                .presentationCornerRadius(28)
        }
        .onChange(of: viewModel.isTimelineVisible) { _, isVisible in
            if isVisible { viewModel.loadCurrentSlideIntoTimeline() }
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
    }

    public var body: some View {
        sheetModifiers
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
        .alert(
            String(localized: "story.composer.mediaLostTitle", defaultValue: "Médias indisponibles", bundle: .module),
            isPresented: Binding(
                get: { lostMediaCount > 0 },
                set: { if !$0 { lostMediaCount = 0 } }
            )
        ) {
            Button(String(localized: "story.composer.ok", defaultValue: "OK", bundle: .module)) { lostMediaCount = 0 }
        } message: {
            Text(
                lostMediaCount == 1
                ? String(
                    localized: "story.composer.mediaLostSingle",
                    defaultValue: "Un média de votre brouillon n'est plus disponible (fichier supprimé). Le slide a été restauré sans ce média — retake si nécessaire.",
                    bundle: .module
                  )
                : String(
                    localized: "story.composer.mediaLostMultiple",
                    defaultValue: "\(lostMediaCount) médias de votre brouillon ne sont plus disponibles (fichiers supprimés). Les slides ont été restaurés sans ces médias.",
                    bundle: .module
                  )
            )
        }
        .onAppear { checkForDraft() }
    }

    private var bottomRegion: some View {
        VStack(spacing: 0) {
            Spacer()
            if shouldShowEmptyStateLargePicker {
                emptyStateLargePicker
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            } else {
                ComposerControlsLayer(
                    viewModel: viewModel,
                    bandStateMachine: $bandStateMachine,
                    areFabsVisible: $areFabsVisible,
                    drawingCanvas: $drawingCanvas,
                    drawingTool: $drawingTool,
                    selectedFilter: $selectedFilter,
                    fgMediaItem: $fgMediaItem,
                    showAudioDocumentPicker: $showAudioDocumentPicker,
                    showVoiceRecorderSheet: $showVoiceRecorderSheet,
                    onOpenMediaCrop: { id in openMediaEditor(elementId: id) },
                    onOpenFilterForElement: { id in
                        viewModel.selectedElementId = id
                        viewModel.activeTool = .filters
                    }
                )
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.85),
                   value: shouldShowEmptyStateLargePicker)
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
        .background(.ultraThinMaterial)
        .clipShape(
            RoundedRectangle(cornerRadius: 0)
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
            Button(role: .destructive) {
                // Bug fix: viewModel.reset() wipes ViewModel data (slides, effects,
                // images), but composer-local @State (stickerObjects, selectedFilter,
                // openingEffect, closingEffect, selectedImage, audio inputs, drawing
                // canvas, picker scratch) survives. The canvasSyncFingerprint chain
                // (.onChange → syncCurrentSlideEffects → buildEffects) re-injects
                // those stale local values into the fresh empty slide, making
                // "deleted" elements reappear. resetLocalState() clears them in
                // lock-step so the sync writes back a truly empty effects payload.
                viewModel.reset()
                resetLocalState()
            } label: {
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

    // MARK: - Empty-State Large Picker
    //
    // Shown in place of the compact toolbar when the composer canvas is empty
    // (no media, no text, no sticker, no drawing, no background) AND no tool
    // is currently active. Surface a roomy carousel of large rectangular
    // tiles so the user discovers the available creation modes immediately
    // — better space utilization than ~70% black canvas + tiny pills row.
    // The current compact toolbar comes back the moment a tool is selected
    // OR any content is added.

    /// True when the entire composer carries no authoring state yet — used
    /// to decide whether to surface the discovery-mode large picker.
    ///
    /// `slide.effects.background` is intentionally NOT in the check because
    /// it is always auto-populated with a random pastel on composer open
    /// (see `.onAppear` → `syncCurrentSlideEffects`). The background being
    /// set therefore tells us nothing about user intent — only explicit
    /// content additions (text / media / sticker / drawing) flip the slide
    /// out of empty state.
    private var isComposerEmpty: Bool {
        let slidesEmpty = viewModel.slides.allSatisfy { slide in
            slide.content == nil
                && viewModel.slideImages[slide.id] == nil
                && slide.effects.textObjects.isEmpty
                && (slide.effects.mediaObjects ?? []).isEmpty
                && (slide.effects.stickerObjects ?? []).isEmpty
                && slide.effects.drawingData == nil
        }
        return slidesEmpty
            && stickerObjects.isEmpty
            && viewModel.drawingData == nil
    }

    private var shouldShowEmptyStateLargePicker: Bool {
        viewModel.activeTool == nil && isComposerEmpty
    }

    /// Pastel accent color per tile. Picks a distinct hue so the carousel
    /// feels lively without breaking from the brand palette. Each accent is
    /// applied at low opacity behind the icon glyph (soft tinted card).
    private func tileAccent(for tool: StoryToolMode) -> Color {
        switch tool {
        case .media:    return MeeshyColors.coral          // peachy red
        case .text:     return MeeshyColors.indigo400      // soft lavender
        case .drawing:  return MeeshyColors.success        // mint green
        case .texture:  return MeeshyColors.warning        // butter yellow
        case .filters:  return MeeshyColors.info           // sky blue
        case .timeline: return MeeshyColors.indigo300      // pale indigo
        }
    }

    @ViewBuilder
    private var emptyStateLargePicker: some View {
        VStack(spacing: 8) {
            VStack(spacing: 2) {
                Text(String(localized: "story.composer.empty.title",
                            defaultValue: "Commencez votre story",
                            bundle: .module))
                    .font(.system(size: 17, weight: .bold, design: .rounded))
                    .foregroundStyle(MeeshyColors.brandGradient)
                Text(String(localized: "story.composer.empty.subtitle",
                            defaultValue: "Choisissez un outil pour démarrer",
                            bundle: .module))
                    .font(.system(size: 11))
                    .foregroundColor(.white.opacity(0.65))
            }
            .padding(.top, 8)
            .opacity(pickerSelectedTool == nil ? 1 : 0)
            .scaleEffect(pickerSelectedTool == nil ? 1 : 0.95)

            // 4 tiles in a 2-column grid fit comfortably without scrolling.
            // The grid sizes to its content (~190pt) so the picker stays at
            // the bottom and leaves ≥ 80 % of the screen for the top bar +
            // canvas pastel preview, per the empty-state UX brief.
            LazyVGrid(
                columns: [
                    GridItem(.flexible(), spacing: 10),
                    GridItem(.flexible(), spacing: 10)
                ],
                spacing: 10
            ) {
                    largeToolTile(
                        .media,
                        icon: "play.rectangle.fill",
                        title: String(localized: "story.composer.empty.tile.media",
                                      defaultValue: "Médias",
                                      bundle: .module),
                        subtitle: String(localized: "story.composer.empty.tile.media.sub",
                                         defaultValue: "Photos, vidéos, audio",
                                         bundle: .module)
                    )
                    largeToolTile(
                        .text,
                        icon: "textformat",
                        title: String(localized: "story.composer.empty.tile.text",
                                      defaultValue: "Texte",
                                      bundle: .module),
                        subtitle: String(localized: "story.composer.empty.tile.text.sub",
                                         defaultValue: "Style, couleur, verre",
                                         bundle: .module)
                    )
                    largeToolTile(
                        .drawing,
                        icon: "pencil.tip",
                        title: String(localized: "story.composer.empty.tile.drawing",
                                      defaultValue: "Dessin",
                                      bundle: .module),
                        subtitle: String(localized: "story.composer.empty.tile.drawing.sub",
                                         defaultValue: "Pencil et couleurs",
                                         bundle: .module)
                    )
                largeToolTile(
                    .texture,
                    icon: "paintpalette.fill",
                    title: String(localized: "story.composer.empty.tile.texture",
                                  defaultValue: "Fond",
                                  bundle: .module),
                    subtitle: String(localized: "story.composer.empty.tile.texture.sub",
                                     defaultValue: "Couleur, dégradé",
                                     bundle: .module)
                )
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 8)
        }
        .padding(.bottom, safeAreaBottomInset + 12)
        .frame(maxWidth: .infinity)
        .background(
            UnevenRoundedRectangle(
                topLeadingRadius: 24,
                bottomLeadingRadius: 0,
                bottomTrailingRadius: 0,
                topTrailingRadius: 24,
                style: .continuous
            )
            .fill(.ultraThinMaterial)
            .ignoresSafeArea(edges: .bottom)
        )
    }

    @ViewBuilder
    private func largeToolTile(
        _ tool: StoryToolMode,
        icon: String,
        title: String,
        subtitle: String
    ) -> some View {
        let accent = tileAccent(for: tool)
        let isSelected = pickerSelectedTool == tool
        let isOtherSelected = pickerSelectedTool != nil && pickerSelectedTool != tool

        Button {
            // Selection animation : briefly highlight the tapped tile + fade
            // the others before propagating to viewModel.selectTool. The
            // resulting activeTool change flips `shouldShowEmptyStateLargePicker`
            // to false and the outer spring animates the picker out, revealing
            // the compact toolbar + active panel beneath. ~220ms total before
            // the swap fires so the highlight is perceivable.
            HapticFeedback.medium()
            withAnimation(.spring(response: 0.22, dampingFraction: 0.6)) {
                pickerSelectedTool = tool
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.22) {
                // For the Text tile, jump straight into the inline editor :
                // viewModel.addText() itself spawns a fresh text + sets
                // selectedElementId + sets activeTool = .text, so calling
                // selectTool(.text) before it would toggle activeTool off
                // when addText then re-sets it back — and the @Observable
                // re-render race could leave activeTool nil at the end.
                // Adopt the simpler invariant : addText is the sole entry
                // point for the .text tool when the slide has no text yet.
                if tool == .text,
                   viewModel.currentEffects.textObjects.isEmpty {
                    _ = viewModel.addText()
                } else {
                    viewModel.selectTool(tool)
                }
                // Auto-open the band to the selected tool's category + panel
                // so controls appear immediately when the empty-state picker
                // transitions out. Without this, the band stayed .hidden and
                // the user had to manually tap a FAB to reveal controls.
                bandStateMachine.tapFAB(tool.bandCategory)
                bandStateMachine.tapTile(tool)
                pickerSelectedTool = nil
            }
        } label: {
            HStack(spacing: 10) {
                ZStack {
                    Circle()
                        .fill(accent.opacity(isSelected ? 0.55 : 0.30))
                        .frame(width: 44, height: 44)
                    Image(systemName: icon)
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(accent)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 14, weight: .semibold, design: .rounded))
                        .foregroundColor(.white)
                        .lineLimit(1)
                    Text(subtitle)
                        .font(.system(size: 11))
                        .foregroundColor(.white.opacity(0.65))
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity)
            .frame(height: 72)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    // Uniform pastel tint matching the tile's accent — replaces
                    // the previous .ultraThinMaterial gray fill so each tile
                    // reads as its own color instead of a generic glass card.
                    .fill(accent.opacity(0.20))
                    .overlay(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .stroke(accent.opacity(isSelected ? 0.75 : 0.40), lineWidth: isSelected ? 2 : 1)
                    )
            )
            .shadow(color: accent.opacity(isSelected ? 0.45 : 0), radius: 14, y: 4)
            .scaleEffect(isSelected ? 1.05 : 1.0)
            .opacity(isOtherSelected ? 0.30 : 1.0)
            // Outer padding gives the scale-up animation room to breathe
            // without being clipped by the grid cell — without it, the
            // selected tile's enlarged corners touch neighbouring tiles
            // and shadow gets cropped.
            .padding(6)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .accessibilityHint(subtitle)
    }

    // MARK: - Canvas + Drawing Layer (Task 2.18)

    /// CALayer-based canvas + drawing overlay + viewport transform/gestures
    /// + loading + zoom-reset overlays. Extracted so the SwiftUI type-checker
    /// doesn't time out on the parent body.
    @ViewBuilder
    private var canvasComposerLayer: some View {
        canvasCore
            .scaleEffect(viewModel.canvasScale * viewportPinchDelta)
            .offset(
                x: viewModel.canvasOffset.width + viewportDragDelta.width,
                y: viewModel.canvasOffset.height + viewportDragDelta.height
            )
            .gesture(isCanvasGestureEnabled ? viewportPinchGesture : nil)
            .gesture(isCanvasGestureEnabled && isPanEnabled ? viewportDragGesture : nil)
            .overlay { mediaLoadingOverlay }
            .overlay(alignment: .topTrailing) { canvasZoomResetButton }
            .ignoresSafeArea()
    }

    @ViewBuilder
    private var canvasCore: some View {
        StoryComposerCanvasView(
            slide: $viewModel.currentSlide,
            onItemDoubleTapped: { id, kind in
                HapticFeedback.medium()
                viewModel.selectedElementId = id
                switch kind {
                case .text:
                    // Open inline text editing
                    bandStateMachine.openFormatPanel(.text, id: id)
                case .media:
                    // Open dedicated full-screen media editor (image crop / video editor)
                    openMediaEditor(elementId: id)
                case .sticker:
                    break
                }
            }
        )
        .allowsHitTesting(!viewModel.isDrawingActive)
        .overlay {
            if viewModel.isDrawingActive {
                DrawingOverlayView(
                    drawingData: $viewModel.drawingData,
                    isActive: .constant(true),
                    canvasView: $drawingCanvas,
                    toolColor: $viewModel.drawingColor,
                    toolWidth: $viewModel.drawingWidth,
                    toolType: $drawingTool
                )
            }
        }
    }

    @ViewBuilder
    private var mediaLoadingOverlay: some View {
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



    @ViewBuilder
    private var canvasZoomResetButton: some View {
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
            .padding(.top, showTopBar ? 70 : 16)
            .padding(.trailing, 12)
            .transition(.scale.combined(with: .opacity))
            .animation(.spring(response: 0.3), value: showTopBar)
        }
    }

    // MARK: - Timeline Section

    @ViewBuilder
    private var timelineSection: some View {
        // V2 timeline editor is the product — no feature-flag gating since the
        // app has not yet shipped to a userbase that requires backwards-compat.
        TimelineContainerSwitcher(viewModel: viewModel.timelineViewModel)
    }



    // MARK: - Helpers

    private var safeAreaBottomInset: CGFloat {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first?.windows.first?.safeAreaInsets.bottom ?? 0
    }

    private func textObjectBinding(for id: String) -> Binding<StoryTextObject>? {
        guard viewModel.currentEffects.textObjects.contains(where: { $0.id == id }) else { return nil }
        return Binding(
            get: {
                viewModel.currentEffects.textObjects.first(where: { $0.id == id })
                    ?? StoryTextObject(text: "")
            },
            set: { newObj in
                var effects = viewModel.currentEffects
                if let i = effects.textObjects.firstIndex(where: { $0.id == id }) {
                    effects.textObjects[i] = newObj
                    viewModel.currentEffects = effects
                }
            }
        )
    }

    // MARK: - Sync / Restore

    private func syncCurrentSlideEffects() {
        viewModel.currentEffects = buildEffects()
    }

    /// Resets every composer-local `@State` that feeds `buildEffects()` or
    /// otherwise mirrors slide content. Must be called immediately after
    /// `viewModel.reset()` (or any other operation that drops all slides)
    /// to prevent the `granularCanvasSync` sync modifiers from re-injecting
    /// orphaned local state into the fresh empty slide.
    ///
    /// Scope: covers every `@State` read by `buildEffects()` plus the
    /// transient picker / editor scratch state. Intentionally does NOT
    /// touch user preferences (`storyLanguage`, `visibility`), the
    /// in-flight loading indicators, or sheet-presentation booleans.
    private func resetLocalState() {
        // Canvas-local state (read by buildEffects via canvasSyncFingerprint)
        selectedFilter = nil
        selectedImage = nil
        stickerObjects = []
        drawingCanvas = PKCanvasView()
        drawingTool = .pen

        // Transitions (read by buildEffects)
        openingEffect = nil
        closingEffect = nil

        // Background audio panel (read by buildEffects)
        selectedAudioId = nil
        selectedAudioTitle = nil
        audioVolume = 0.7
        audioTrimStart = 0
        audioTrimEnd = 0

        // Picker / editor scratch state — would otherwise resurrect
        // half-finished media flows on the freshly reset canvas.
        fgMediaItem = nil
        editingBgImage = nil
        editingElementImage = nil
        editingElementVideo = nil
        confirmedMediaAudioURL = nil
        lostMediaCount = 0
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
        // Voice fields are NOT a function of the composer's @State — they live
        // entirely on `viewModel.currentEffects` (set by the voice recorder /
        // TTS pipeline). Re-emitting them here ensures `buildEffects()` is the
        // FULL slide snapshot and not a partial overwrite. Same for
        // `backgroundAudioVariants` (TTS variants per language). Without this,
        // every slide-switch + sync wiped the voice payload.
        let current = viewModel.currentEffects
        return StoryEffects(
            background: bgHex,
            filter: selectedFilter?.rawValue,
            filterIntensity: selectedFilter != nil ? viewModel.filterIntensity : nil,
            stickers: stickerObjects.isEmpty ? nil : stickerObjects.map(\.emoji),
            stickerObjects: stickerObjects.isEmpty ? nil : stickerObjects,
            drawingData: viewModel.drawingData,
            backgroundAudioId: selectedAudioId,
            backgroundAudioVolume: selectedAudioId != nil ? audioVolume : nil,
            backgroundAudioStart: selectedAudioId != nil ? audioTrimStart : nil,
            backgroundAudioEnd: selectedAudioId != nil && audioTrimEnd > 0 ? audioTrimEnd : nil,
            voiceAttachmentId: current.voiceAttachmentId,
            voiceTranscriptions: current.voiceTranscriptions,
            opening: openingEffect,
            closing: closingEffect,
            textObjects: current.textObjects,
            mediaObjects: current.mediaObjects,
            audioPlayerObjects: current.audioPlayerObjects,
            backgroundAudioVariants: current.backgroundAudioVariants,
            backgroundTransform: bgTransform.isIdentity ? nil : bgTransform,
            slideDuration: Float(viewModel.currentSlideDuration)
        )
    }

    // MARK: - Media Loading

    private func handleForegroundMediaSelection(from item: PhotosPickerItem?) {
        guard let item else { return }
        let isVideo = item.supportedContentTypes.contains { $0.conforms(to: .movie) || $0.conforms(to: .video) }
        addForegroundMedia(from: item, kind: isVideo ? .video : .image)
    }

    private func addForegroundMedia(from item: PhotosPickerItem?, kind: StoryMediaKind) {
        guard let item else { return }
        // Capture the slide ID at the START of the picker flow. PhotosPicker's
        // `loadTransferable` is async (1-3s for a video) and the user can switch
        // slides mid-load — without this pin, the media gets appended to whichever
        // slide happens to be active when the awaits resolve, which is a silent
        // data-loss race (audit F2).
        let targetSlideId = viewModel.currentSlide.id
        isLoadingMedia = true
        mediaLoadProgress = 0
        mediaLoadLabel = kind == .video
            ? String(localized: "story.composer.loadingVideo", defaultValue: "Chargement de la video...", bundle: .module)
            : String(localized: "story.composer.loadingImage", defaultValue: "Chargement de l'image...", bundle: .module)
        Task {
            defer {
                isLoadingMedia = false
                mediaLoadProgress = 0
                mediaLoadLabel = ""
            }
            let objectId = UUID().uuidString
            if kind == .video {
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
                        if let obj = viewModel.addMediaObject(kind: .video, toSlideId: targetSlideId) {
                            viewModel.loadedVideoURLs[obj.id] = tempURL
                            if let thumbnail { viewModel.loadedImages[obj.id] = thumbnail }
                            // Set mediaURL so StoryMediaLayer.configureVideo can find
                            // the file. Same bridge as the image path — without this,
                            // media.mediaURL is nil and the video layer has no source.
                            viewModel.setMediaURL(id: obj.id, url: tempURL.absoluteString, slideId: targetSlideId)
                            if obj.id != objectId {
                                viewModel.loadedVideoURLs.removeValue(forKey: objectId)
                                viewModel.loadedImages.removeValue(forKey: objectId)
                            }
                            if let dur = mediaDuration {
                                // Pin the natural asset duration on the media object so
                                // the reader's visibility window matches the actual
                                // playback length. Without this, `obj.duration` stayed
                                // nil and got overwritten later by timeline-editor
                                // defaults that could be as short as 1s — surfacing as
                                // "video appears 1 second then disappears" while the
                                // audio kept playing.
                                viewModel.setMediaDuration(id: obj.id, duration: dur, slideId: targetSlideId)
                                viewModel.autoExtendDuration(forElementEnd: dur, slideId: targetSlideId)
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
                mediaLoadProgress = 0.7
                // Persist the image to a temp file so StoryMediaLayer.configureImage
                // can load it via its file:// URL. Without this, media.mediaURL stays
                // nil and the CALayer canvas renders a black rectangle.
                let tempImageURL = FileManager.default.temporaryDirectory
                    .appendingPathComponent(objectId + ".jpg")
                let jpegData = image.jpegData(compressionQuality: 0.92)
                try? jpegData?.write(to: tempImageURL)
                let imageFileURL = jpegData != nil ? tempImageURL : nil
                mediaLoadProgress = 1.0
                await MainActor.run {
                    if let obj = viewModel.addMediaObject(kind: .image, toSlideId: targetSlideId) {
                        viewModel.loadedImages[obj.id] = image
                        // Set mediaURL on the StoryMediaObject so the canvas renderer
                        // can load the image from disk. This is the critical bridge
                        // between the in-memory UIImage and the CALayer pipeline.
                        if let fileURL = imageFileURL {
                            viewModel.setMediaURL(id: obj.id, url: fileURL.absoluteString, slideId: targetSlideId)
                        }
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

        if mediaObj.kind == .video, let url = viewModel.loadedVideoURLs[elementId] {
            editingElementVideo = EditingMediaVideo(elementId: elementId, url: url)
        } else if let image = viewModel.loadedImages[elementId] {
            editingElementImage = EditingMediaImage(elementId: elementId, image: image)
        }
    }

    private func addRecordingToBackground(url: URL) {
        Task {
            let samples = (try? await WaveformGenerator.shared.generateSamples(from: url)) ?? []
            await MainActor.run {
                if let obj = viewModel.addAudioObject() {
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
        onPublishAllInBackground(snapshot.slides, snapshot.bgImages, viewModel.loadedImages, viewModel.loadedVideoURLs, viewModel.loadedAudioURLs, storyLanguage, visibility)
    }

    private func snapshotAllSlides() -> (slides: [StorySlide], bgImages: [String: UIImage]) {
        var slides = viewModel.slides
        let idx = viewModel.currentSlideIndex
        if idx < slides.count {
            slides[idx].effects = buildEffects()
        }
        // Propage la duree authoritative de chaque slide vers effects.slideDuration —
        // sinon les slides jamais activees (donc jamais passees par buildEffects)
        // gardent un slideDuration nil et le viewer retombe sur le minimum 5s.
        for i in slides.indices {
            slides[i].effects.slideDuration = Float(slides[i].duration)
        }
        // Compute composite thumbHash for each slide (bg + text + media + stickers)
        for i in slides.indices {
            let bgImage = viewModel.slideImages[slides[i].id]
            slides[i].effects.thumbHash = StorySlideRenderer.computeThumbHash(
                slide: slides[i],
                bgImage: bgImage,
                loadedImages: viewModel.loadedImages
            )
        }
        return (slides, viewModel.slideImages)
    }

    // MARK: - Dismiss

    private func handleDismiss() {
        let hasContent = viewModel.slides.contains { slide in
            slide.content != nil
                || viewModel.slideImages[slide.id] != nil
                || slide.effects.background != nil
                || !slide.effects.textObjects.isEmpty
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

            // Surface lost media (file purged by OS, deleted via Files app, etc.)
            // explicitly to the user via an alert. The DB rows are also purged
            // so the next restore doesn't repeat the warning.
            if !media.lostElementIds.isEmpty {
                StoryDraftStore.shared.purgeLostMedia(media.lostElementIds)
                lostMediaCount = media.lostElementIds.count
            }
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

// MARK: - Media Pill Label (extracted for Sendable conformance)

struct MediaPillLabel: View {
    let icon: String
    let text: String
    var destructive: Bool = false

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: icon).font(.system(size: 12, weight: .medium))
            Text(text).font(.system(size: 11, weight: .medium))
        }
        .foregroundColor(destructive ? MeeshyColors.error : .white.opacity(0.8))
        .padding(.horizontal, 10).padding(.vertical, 7)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(destructive ? MeeshyColors.error.opacity(0.15) : Color.white.opacity(0.08))
        )
    }
}
