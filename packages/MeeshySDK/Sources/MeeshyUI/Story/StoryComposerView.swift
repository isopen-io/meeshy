import SwiftUI
import UIKit
import os
import PhotosUI
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

    @StateObject var viewModel = StoryComposerViewModel()

    // MARK: - System environment

    @Environment(\.colorScheme) var colorScheme

    // MARK: - Canvas-local state

    @State var selectedFilter: StoryFilter?
    @State var selectedImage: UIImage?
    @State var stickerObjects: [StorySticker] = []

    // MARK: - Background audio (legacy panel state)

    @State var selectedAudioId: String?
    @State var selectedAudioTitle: String?
    @State var audioVolume: Float = 0.7
    @State var audioTrimStart: TimeInterval = 0
    @State var audioTrimEnd: TimeInterval = 0

    // MARK: - Photo / media pickers

    @State var fgMediaItem: PhotosPickerItem?

    // MARK: - Empty-state picker selection animation
    //
    // Briefly latched when the user taps a tile in `emptyStateLargePicker`,
    // before the selection propagates to `viewModel.selectTool(_:)`. Drives
    // the highlight + fade-others animation in `largeToolTile`.
    @State var pickerSelectedTool: StoryToolMode?

    // MARK: - Media editor (triggered by edit button on canvas elements)

    @State var editingBgImage: UIImage?
    @State var editingElementImage: EditingMediaImage?
    @State var editingElementVideo: EditingMediaVideo?

    // MARK: - Audio pickers

    @State var showAudioDocumentPicker = false
    @State var showVoiceRecorderSheet = false
    // Prisme Linguistique: the story's source language comes from the user's
    // in-app content preferences (systemLanguage → regionalLanguage → "fr"),
    // NEVER from the keyboard locale. See `StoryComposerViewModel
    // .resolveComposerSourceLanguage(user:)` for the canonical resolver.
    @State var storyLanguage: String = StoryComposerViewModel
        .resolveComposerSourceLanguage(user: AuthManager.shared.currentUser)
    @State var showFilterSheet = false
    @State var showTransitionSheet = false
    @State var audioEditorItem: AudioEditorItemWrapper?
    @State var mediaAudioEditorItem: AudioEditorItemWrapper?
    @State var confirmedMediaAudioURL: URL?

    // MARK: - Manipulation layer (verrouillage en cascade)

    /// Couche active courante du canvas, miroir SwiftUI de
    /// `StoryCanvasUIView.currentManipulationLayer`. Mise à jour via le
    /// callback `onManipulationLayerChanged` du `StoryComposerCanvasView`.
    @State var manipulationLayer: CanvasManipulationLayer = .canvas

    // MARK: - Publication

    @State var publishTask: Task<Void, Never>?

    // MARK: - Canvas viewport (pinch-to-zoom + drag-to-pan when zoomed)

    /// Échelle éphémère du viewport pendant un pinch 3-doigts. Driven
    /// par le callback `onCanvasZoomScaleChanged` du canvas UIKit ; remis à
    /// 1.0 à `.ended`/`.cancelled`. Anciennement `@GestureState` lié au
    /// `MagnificationGesture` SwiftUI 2-doigts qui entrait en conflit avec
    /// le pinch d'élément.
    @State var viewportPinchDelta: CGFloat = 1.0
    @GestureState var viewportDragDelta: CGSize = .zero

    /// Canvas gestures disabled only during drawing (PKCanvasView needs exclusive touch control).
    /// For all other modes, child element gestures naturally take priority via SwiftUI's
    /// gesture hierarchy (.gesture on child beats .gesture on parent).
    var isCanvasGestureEnabled: Bool {
        !viewModel.isDrawingActive
    }

    /// Pan always available when zoomed — uses high minimumDistance to avoid accidental triggers
    var isPanEnabled: Bool {
        viewModel.isCanvasZoomed
    }

    var viewportDragGesture: some Gesture {
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
    var showTopBar: Bool {
        (!viewModel.isCanvasZoomed && areFabsVisible) || viewModel.activeTool != nil || viewModel.selectedElementId != nil
    }

    // MARK: - Pickers
    var transitionPicker: some View {
        Text(String(localized: "story.composer.transitions", defaultValue: "Transitions", bundle: .module))
            .foregroundColor(.white)
    }

    // MARK: - UI state

    @State var areFabsVisible: Bool = true
    @State var bandStateMachine: BandStateMachine = BandStateMachine()

    /// Hauteur (redimensionnable) du panneau DESSIN du band partagé, pilotée par le
    /// drag du grabber (`ComposerBottomBand`). Tirer vers le haut agrandit le panneau
    /// (liste des traits) ; vers le bas le réduit. En mode dessin (Option A) le canvas
    /// reste PLEIN — ce drawer flotte par-dessus, il ne rétrécit plus le canvas.
    @State var composerBandHeight: CGFloat = 280

    /// Drawer d'outil replié « totalement » : seul le grabber reste visible et le
    /// canvas est 100 % visible. Vaut pour TOUS les outils (2026-06-02) — replier ne
    /// quitte pas l'outil actif (en dessin, le contrôleur flottant `StoryDrawingToolbar`
    /// persiste en plus). Re-déplier via le grabber.
    @State var bandDrawerCollapsed = false

    /// Hauteur du drawer dessin une fois replié (poignée seule).
    static let drawingDrawerGrabberHeight: CGFloat = 38

    @State var showDiscardAlert = false
    @State var showRestoreDraftAlert = false
    @State var isLoadingMedia = false
    @State var mediaLoadProgress: Double = 0
    @State var mediaLoadLabel: String = ""
    // Défaut « Contacts » (PostVisibility.friends) : une story est d'abord
    // partagée avec ses contacts, pas publiquement. L'audience publique reste
    // un choix explicite via le sélecteur globe. Aligné sur le défaut du VM app
    // (`StoryViewModel.publishStory(visibility: "FRIENDS")`).
    @State var visibility: String = "FRIENDS"
    @State var visibilityUserIds: [String] = []
    @State var audiencePickerMode: PostVisibility?
    @State var lostMediaCount: Int = 0  // > 0 triggers an alert after restoreDraft

    // MARK: - Transition effects (local until synced to effects)

    @State var openingEffect: StoryTransitionEffect?
    @State var closingEffect: StoryTransitionEffect?

    // MARK: - Keyboard observation + canvas shift

    @State var keyboardHeight: CGFloat = 0
    @State var canvasEditShift: CGFloat = 0
    /// Frame naturelle (non décalée) du canvas, mesurée hors `.offset`.
    @State var canvasNaturalFrame: CGRect = .zero

    @Environment(\.theme) var theme

    // MARK: - Callbacks (public API preserved)

    public var onPublishSlide: (StorySlide, UIImage?, [String: UIImage], [String: URL], String?) async throws -> Void
    public var onPublishAllInBackground: (
        _ slides: [StorySlide],
        _ slideImages: [String: UIImage],
        _ loadedImages: [String: UIImage],
        _ loadedVideoURLs: [String: URL],
        _ loadedAudioURLs: [String: URL],
        _ originalLanguage: String?,
        _ visibility: String,
        _ visibilityUserIds: [String]
    ) -> Void
    public var onPreview: ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL]) -> Void
    public var onDismiss: () -> Void

    public init(
        onPublishSlide: @escaping (StorySlide, UIImage?, [String: UIImage], [String: URL], String?) async throws -> Void = { _, _, _, _, _ in },
        onPublishAllInBackground: @escaping ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL], String?, String, [String]) -> Void,
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
        onPublishAllInBackground: @escaping ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL], String?, String, [String]) -> Void,
        onPreview: @escaping ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL]) -> Void = { _, _, _, _, _ in },
        onDismiss: @escaping () -> Void
    ) {
        self._viewModel = StateObject(wrappedValue: viewModel)
        self.onPublishSlide = onPublishSlide
        self.onPublishAllInBackground = onPublishAllInBackground
        self.onPreview = onPreview
        self.onDismiss = onDismiss
    }

    // MARK: - Body

    var mainContent: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            // Canvas core (CALayer) + drawing overlay + viewport modifiers,
            // extracted into `canvasComposerLayer` so the SwiftUI type-checker
            // doesn't time out on this body's full modifier chain.
            canvasComposerLayer

            // Top bar — auto-hides during canvas zoom to reveal canvas controls.
            // Hidden (non-interactive) while the floating text editor is open.
            VStack(spacing: 0) {
                if showTopBar {
                    topBar
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
                Spacer()
            }
            .animation(.spring(response: 0.3, dampingFraction: 0.85), value: showTopBar)
            .opacity(viewModel.textEditingMode == .inactive ? 1 : 0)
            .allowsHitTesting(viewModel.textEditingMode == .inactive)

            // Bottom: toolbar + active panel.
            // When the composer is empty (no content + no tool selected) we
            // swap the compact toolbar for `emptyStateLargePicker` — large
            // rectangular tiles in a horizontal carousel taking the bottom
            // half of the screen. The compact toolbar comes back as soon as
            // a tool is selected OR a slide has any content.
            // Hidden (non-interactive) while the floating text editor is open.
            bottomRegion
                .opacity(isFloatingEditorActive ? 0 : 1)
                .allowsHitTesting(!isFloatingEditorActive)

            // Floating text edit overlay — sits above every composer control.
            // Empty view when `textEditingMode == .inactive`.
            StoryTextEditToolbar(viewModel: viewModel)
                .padding(.bottom, keyboardHeight)

            // Le dessin utilise le band PARTAGÉ (`ComposerBottomBand` →
            // `drawingPanel` = liste éditable des traits), comme tous les autres
            // outils — plus de bande dédiée `DrawingBand` qui doublonnait
            // (2 sheets, l'une au grabber occulté/inactif — bug user 2026-06-01).

            // Floating drawing controls — mirror du toolbar texte. Vide quand
            // `drawingEditingMode == .inactive`. Les bulles (pinceau/couleur/
            // épaisseur/lissage) flottent sur le canvas, levées au-dessus du band
            // partagé (`bottomInset`).
            StoryDrawingToolbar(viewModel: viewModel, bottomInset: presentedSheetHeight)
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.85),
                   value: viewModel.textEditingMode)
        .animation(.spring(response: 0.3, dampingFraction: 0.85),
                   value: viewModel.drawingEditingMode)
        .adaptiveOnChange(of: viewModel.activeTool) { _, newTool in
            // Changer d'outil ré-affiche toujours le drawer déplié : sinon l'état
            // replié d'un outil précédent (poignée seule) persisterait sur le
            // nouvel outil et son panneau resterait caché (2026-06-02, le repli
            // s'applique désormais à tous les outils).
            bandDrawerCollapsed = false
            // Le mode dessin flottant suit l'outil actif : entrer expose les
            // contrôleurs flottants (bulles) ; quitter les masque. La liste des
            // traits vit dans le band PARTAGÉ (`ComposerBottomBand.drawingPanel`)
            // — comme tous les outils. On garantit donc que le band affiche le
            // panneau dessin quand on entre (peu importe le chemin d'entrée :
            // FAB, tuile, restauration), et qu'il se referme quand on sort
            // (sinon une sheet dessin vide resterait / réapparaîtrait à la
            // fermeture — bug user 2026-06-01).
            if newTool == .drawing {
                viewModel.enterDrawingEditingMode()
                if bandStateMachine.state.activeCategory != .drawing {
                    bandStateMachine.tapTile(.drawing)
                }
                areFabsVisible = true
            } else {
                viewModel.exitDrawingEditingMode()
                if bandStateMachine.state.activeCategory == .drawing {
                    bandStateMachine.reset()
                }
            }
        }
        .statusBarHidden()
        .ignoresSafeArea(.keyboard)
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
        .adaptiveOnChange(of: viewModel.currentSlideIndex) { _, _ in
            viewModel.loadCurrentSlideIntoTimeline()
            bandStateMachine.reset()
            areFabsVisible = true
            // A text edit overlay open on the previous slide references an
            // element that does not exist on the new one — close it.
            viewModel.exitTextEditingMode()
        }
        .onDisappear {
            StoryMediaCoordinator.shared.deactivate()
            publishTask?.cancel()
            publishTask = nil
            viewModel.stopMemoryObserver()
            // Contrat StoryTimelineEngine : "owner MUST call shutdown()" —
            // libère AVPlayer + observer périodique + AVAudioEngine du mixer.
            viewModel.shutdownTimelineIfNeeded()
            // Do NOT cleanup temp files here — background upload may still need them.
            // Cleanup happens after upload completes in StoryViewModel.launchUploadTask.
        }
        .adaptiveOnChange(of: fgMediaItem) { _, item in handleForegroundMediaSelection(from: item) }
        // Real-time canvas sync — Task 2.18 migration. Toolbars + sheets
        // mutate composer-local @State (`selectedFilter`, `stickerObjects`,
        // `selectedImage`, …); the CALayer canvas reads from
        // `viewModel.currentSlide.effects` exclusively, so re-serialize on
        // each toolbar mutation. Five separate `.onChange` modifiers tipped
        // the type-checker over the time-out threshold, so we collapse them
        // into a single extension modifier to maintain performance in O(1).
        .onReceive(NotificationCenter.default.publisher(
            for: UIResponder.keyboardWillShowNotification)) { note in
            let frame = (note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey]
                as? NSValue)?.cgRectValue ?? .zero
            keyboardHeight = frame.height
            recomputeCanvasShift()
        }
        .onReceive(NotificationCenter.default.publisher(
            for: UIResponder.keyboardWillHideNotification)) { _ in
            keyboardHeight = 0
            canvasEditShift = 0
        }
        .adaptiveOnChange(of: viewModel.textEditingMode) { _, _ in recomputeCanvasShift() }
        // Quand le canvas se carde/décarde, sa frame présentée change (post-scale) ;
        // on re-aligne l'éditeur texte inline APRÈS que la carte se soit posée
        // (ressort 0.32s) pour que `canvasEditShift` se base sur le rect final.
        .adaptiveOnChange(of: canvasIsCarded) { _, _ in
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.34) { recomputeCanvasShift() }
        }
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
    var sheetModifiers: some View {
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
                onCancel: { audioEditorItem = nil }
            )
        }
        .fullScreenCover(item: $mediaAudioEditorItem) { item in
            MeeshyAudioEditorView(
                url: item.url,
                preferredLanguage: item.language ?? "fr",
                onConfirm: { url, _, _, _ in
                    confirmedMediaAudioURL = url
                    mediaAudioEditorItem = nil
                    addVocalToForeground()
                },
                onCancel: { mediaAudioEditorItem = nil }
            )
        }
        .sheet(isPresented: $showVoiceRecorderSheet) {
            NavigationStack {
                StoryVoiceRecorder { recordedURL, language in
                    mediaAudioEditorItem = AudioEditorItemWrapper(url: recordedURL, language: language)
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
                .modifier(StoryTimelinePresentationStyle())
        }
        .adaptiveOnChange(of: viewModel.isTimelineVisible) { _, isVisible in
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
                context: .story,
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
                context: .story,
                onAccept: { edited in
                    viewModel.loadedImages[item.elementId] = edited
                    // Un recadrage change le ratio de l'image : sans réécrire
                    // `mediaAspectRatios`, la layer ré-affichait le NOUVEAU bitmap
                    // mais étiré au ratio d'ORIGINE → la modification (crop)
                    // n'apparaissait pas géométriquement dans le canvas (#1).
                    let editedSize = edited.size
                    if editedSize.width > 0, editedSize.height > 0 {
                        viewModel.setMediaAspectRatio(
                            id: item.elementId,
                            aspectRatio: Double(editedSize.width / editedSize.height),
                            slideId: viewModel.currentSlide.id
                        )
                    }
                    // Bump version pour signaler au `StoryComposerCanvasView`
                    // qu'un bitmap intra-clé a muté. SwiftUI ne peut pas
                    // détecter ce genre de mutation sur un `[String: UIImage]`
                    // (UIImage non Equatable). Sans ce bump, le main canvas
                    // ne re-stampait jamais l'image éditée et restait stale
                    // (bug 2026-05-27). Cf. `StoryComposerCanvasView.Coordinator`.
                    viewModel.loadedImagesVersion &+= 1
                    editingElementImage = nil
                },
                onCancel: { editingElementImage = nil }
            )
        }
        .fullScreenCover(item: $editingElementVideo) { item in
            MeeshyVideoEditorView(
                url: item.url,
                context: .story,
                onComplete: { result in
                    // 1. **Écrase le fichier cache** par la version éditée.
                    //    Le caller a stocké `item.url` (path original cached
                    //    dans le composer tmp) → on remplace son contenu par
                    //    `result.url` (output du `VideoExportPipeline`).
                    //    Bénéfices :
                    //    - L'URL reste **identique** : AVPlayer items, thumb
                    //      caches keyés par URL n'invalident pas → 0 reload.
                    //    - Pas d'orphelin temp : `result.url` est consommé.
                    //    Fallback : si le move échoue (cross-volume, perm),
                    //    on garde simplement `result.url` (le comportement
                    //    pré-fix).
                    let destinationURL = item.url
                    let cachedURL: URL
                    if result.url != destinationURL {
                        do {
                            try? FileManager.default.removeItem(at: destinationURL)
                            try FileManager.default.moveItem(at: result.url, to: destinationURL)
                            cachedURL = destinationURL
                        } catch {
                            // Move impossible → on conserve result.url tel
                            // quel. Le map pointera dessus, le contenu sera
                            // valide. L'ancien item.url reste sur disque
                            // jusqu'à l'éviction tmp système.
                            cachedURL = result.url
                        }
                    } else {
                        cachedURL = destinationURL
                    }
                    viewModel.loadedVideoURLs[item.elementId] = cachedURL

                    // 2. Refresh la vignette pour qu'elle reflète la frame
                    //    courante du clip édité (utilisée par le composer
                    //    tray, l'export et le placeholder).
                    let thumbnail = Self.generateVideoThumbnail(url: cachedURL)
                    if let thumbnail {
                        viewModel.loadedImages[item.elementId] = thumbnail
                        // Un recadrage vidéo change le ratio : on le réécrit
                        // depuis la frame éditée (sinon la vidéo s'affiche au
                        // ratio d'origine après crop). Même rationale que le
                        // bloc image editor (#1).
                        let thumbSize = thumbnail.size
                        if thumbSize.width > 0, thumbSize.height > 0 {
                            viewModel.setMediaAspectRatio(
                                id: item.elementId,
                                aspectRatio: Double(thumbSize.width / thumbSize.height),
                                slideId: viewModel.currentSlide.id
                            )
                        }
                        // Bump version : même rationale que le bloc image
                        // editor — la vignette vidéo est une mutation
                        // intra-clé non détectable par SwiftUI.
                        viewModel.loadedImagesVersion &+= 1
                    }

                    // 3. Si l'utilisateur a transcrit la piste audio, on
                    //    propage les sous-titres comme **metadata** de la
                    //    vidéo cached (cf. spec : « sauvegardé comme une
                    //    metadata de la vidéo lors de la validation pour
                    //    remplacer la vidéo originellement chargé »).
                    //    Le renderer story peut les overlay au rendu sans
                    //    avoir besoin de re-transcrire.
                    if !result.captions.isEmpty || result.transcriptionText != nil {
                        viewModel.loadedVideoCaptions[item.elementId] = StoryVideoCaptionMetadata(
                            captions: result.captions,
                            transcriptionText: result.transcriptionText,
                            languageCode: result.captionLanguageCode
                        )
                    } else {
                        // L'utilisateur a effacé / pas transcrit — purge la
                        // metadata pour ne pas réutiliser celle d'un
                        // précédent edit du même element.
                        viewModel.loadedVideoCaptions.removeValue(forKey: item.elementId)
                    }

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
        .alert(
            String(localized: "story.composer.quitWithoutPublishing", defaultValue: "Quitter sans publier ?", bundle: .module),
            isPresented: $showDiscardAlert
        ) {
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

    var bottomRegion: some View {
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
                    selectedFilter: $selectedFilter,
                    fgMediaItem: $fgMediaItem,
                    showAudioDocumentPicker: $showAudioDocumentPicker,
                    showVoiceRecorderSheet: $showVoiceRecorderSheet,
                    resizableBandHeight: $composerBandHeight,
                    bandMinHeight: Self.composerBandMinHeight,
                    bandMaxHeight: Self.composerBandMaxHeight,
                    bandDrawerCollapsed: $bandDrawerCollapsed,
                    onOpenMediaCrop: { id in openMediaEditor(elementId: id) }
                )
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.85),
                   value: shouldShowEmptyStateLargePicker)
    }

    // MARK: - Top Bar

    var topBar: some View {
        HStack(spacing: 0) {
            dismissButton
                .padding(.leading, 16)

            slideStrip
                .frame(maxWidth: .infinity)

            // Unified Liquid Glass action group (iOS 26 GlassEffectContainer →
            // adjacent glass morphs into one continuous surface; iOS 16–25 falls
            // back to material/solid via the adaptiveGlass wrappers). Publish keeps
            // the primary brand tint via prominent glass; overflow (⋯) sits last,
            // right of Publish.
            AdaptiveGlassContainer(spacing: 6) {
                HStack(spacing: 6) {
                    visibilityMenu
                    previewButton
                    publishButton
                    overflowMenu
                }
            }
            .padding(.trailing, 16)
        }
        .frame(height: 60)
        .background(.ultraThinMaterial)
        .clipShape(
            RoundedRectangle(cornerRadius: 0)
        )
    }

    var dismissButton: some View {
        Button { handleDismiss() } label: {
            Image(systemName: "xmark")
                .font(.system(size: 15, weight: .bold))
                .foregroundColor(.white)
                .frame(width: 36, height: 36)
                .adaptiveGlass(in: Circle())
                .contentShape(Circle())
        }
    }

    var previewButton: some View {
        Button {
            NotificationCenter.default.post(name: .storyComposerMuteCanvas, object: nil)
            Task { @MainActor in
                let snapshot = await snapshotAllSlides()
                onPreview(snapshot.slides, snapshot.bgImages, viewModel.loadedImages, viewModel.loadedVideoURLs, viewModel.loadedAudioURLs)
            }
        } label: {
            Image(systemName: "play.fill")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(.white)
                .frame(width: 36, height: 36)
                .adaptiveGlass(in: Circle())
                .contentShape(Circle())
        }
    }


    var publishButton: some View {
        let isPublishing = publishTask != nil
        return Button { publishAllSlides() } label: {
            HStack(spacing: 4) {
                if isPublishing {
                    ProgressView()
                        .progressViewStyle(.circular)
                        .tint(.white)
                        .scaleEffect(0.7)
                } else {
                    Text(String(localized: "story.composer.publish", defaultValue: "Publier", bundle: .module)).font(.system(size: 13, weight: .bold)).lineLimit(1)
                    Image(systemName: "arrow.up.circle.fill").font(.system(size: 13))
                }
            }
            .fixedSize()
            .foregroundColor(.white)
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .adaptiveGlassProminent(in: Capsule(), tint: MeeshyColors.brandPrimary)
        }
        .disabled(isPublishing)
    }

    var visibilityMenu: some View {
        Menu {
            ForEach(PostVisibility.composerSelectableCases) { mode in
                Button {
                    visibility = mode.rawValue
                    if mode.requiresUserSelection { audiencePickerMode = mode }
                } label: {
                    Label(mode.label, systemImage: visibility == mode.rawValue ? "checkmark" : mode.icon)
                }
            }
        } label: {
            let current = PostVisibility(rawValue: visibility) ?? .public
            let showCount = current.requiresUserSelection && !visibilityUserIds.isEmpty
            HStack(spacing: 4) {
                Image(systemName: current.icon)
                    .font(.system(size: 12, weight: .semibold))
                Text(showCount ? "\(current.label) (\(visibilityUserIds.count))" : current.label)
                    .font(.system(size: 12, weight: .semibold))
                    .lineLimit(1)
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .adaptiveGlass(in: Capsule(), tint: .white.opacity(0.18))
        }
        .sheet(item: $audiencePickerMode) { mode in
            AudienceUserPickerView(mode: mode, initialSelection: visibilityUserIds) { ids in
                visibilityUserIds = ids
            }
        }
    }

    var overflowMenu: some View {
        Menu {
            // Slide tools — le filtre GLOBAL a été retiré : les filtres
            // s'appliquent désormais par média via l'éditeur unitaire (crayon
            // sur chaque image/vidéo), chacun avec son propre aperçu live.
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
                .frame(width: 36, height: 36)
                .adaptiveGlass(in: Circle())
                .contentShape(Circle())
        }
    }

    // MARK: - Slide Strip

    var slideStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(Array(viewModel.slides.enumerated()), id: \.element.id) { index, slide in
                    slideThumb(slide: slide, index: index)
                }
            }
            .padding(.horizontal, 8)
        }
    }

    func slideThumb(slide: StorySlide, index: Int) -> some View {
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
        // Réordonner les slides par glisser-déposer (long-press natif), MÊME mécanisme
        // que la liste des médias (`.draggable` + `.dropDestination`) — convention
        // `.onMove` (offset post-cible). Câble enfin `moveSlide` (it.37).
        .draggable(slide.id) {
            SlideMiniPreview(effects: slide.effects, bgImage: viewModel.slideImages[slide.id],
                             drawingData: drawData, loadedImages: viewModel.loadedImages, index: index)
                .frame(width: thumbW, height: thumbH)
                .clipShape(RoundedRectangle(cornerRadius: 3))
        }
        .dropDestination(for: String.self) { items, _ in
            guard let sourceId = items.first,
                  let sourceIdx = viewModel.slides.firstIndex(where: { $0.id == sourceId }),
                  let targetIdx = viewModel.slides.firstIndex(where: { $0.id == slide.id }),
                  sourceIdx != targetIdx else { return false }
            // Offset `.onMove` : après la cible si on descend, avant si on monte.
            let destination = sourceIdx < targetIdx ? targetIdx + 1 : targetIdx
            syncCurrentSlideEffects()
            viewModel.moveSlide(from: sourceIdx, to: destination)
            restoreCanvas(from: viewModel.currentSlide)
            HapticFeedback.light()
            return true
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
    /// L'éditeur de TEXTE flottant occupe tout le bas de l'écran → le band compact
    /// standard est alors masqué et non-interactif. Le DESSIN, lui, utilise le band
    /// PARTAGÉ (`ComposerBottomBand` → `drawingPanel` = liste des traits) comme tous
    /// les autres outils + des bulles flottantes au-dessus : on NE masque donc PAS
    /// le band pendant le dessin (correctif user 2026-06-01 « dessin devrait afficher
    /// le ComposerBottomBand aussi » ; plus de bande dédiée `DrawingBand`).
    var isFloatingEditorActive: Bool {
        viewModel.textEditingMode != .inactive
    }


    var isComposerEmpty: Bool {
        let slidesEmpty = viewModel.slides.allSatisfy { slide in
            slide.content == nil
                && viewModel.slideImages[slide.id] == nil
                && slide.effects.textObjects.isEmpty
                && (slide.effects.mediaObjects ?? []).isEmpty
                && (slide.effects.stickerObjects ?? []).isEmpty
                && slide.effects.drawingData == nil
                && (slide.effects.drawingStrokes ?? []).isEmpty
        }
        return slidesEmpty
            && stickerObjects.isEmpty
            && viewModel.drawingData == nil
            && viewModel.drawingStrokes.isEmpty
    }

    var shouldShowEmptyStateLargePicker: Bool {
        // Le picker grand format n'est montré QUE quand :
        //  - aucun outil n'est sélectionné côté viewModel,
        //  - le bandeau d'outils est complètement masqué (.hidden — le
        //    `bandStateMachine` peut être pré-ouvert via empty-state → tile,
        //    auquel cas le panel doit prendre toute la place),
        //  - et le slide n'a aucun contenu réel.
        // Sans le check `state == .hidden`, le picker pouvait persister visuellement
        // derrière le bandeau pendant les transitions (le band est animé via spring
        // et le if/else était insuffisant pendant le mid-transition).
        viewModel.activeTool == nil
            && isComposerEmpty
            && bandStateMachine.state == .hidden
    }

    /// Pastel accent color per tile. Picks a distinct hue so the carousel
    /// feels lively without breaking from the brand palette. Each accent is
    /// applied at low opacity behind the icon glyph (soft tinted card).
    func tileAccent(for tool: StoryToolMode) -> Color {
        switch tool {
        case .media:    return MeeshyColors.error          // peachy red
        case .audio:    return MeeshyColors.indigo400      // soft lavender
        case .text:     return MeeshyColors.indigo400      // soft lavender
        case .drawing:  return MeeshyColors.success        // mint green
        case .texture:  return MeeshyColors.warning        // butter yellow
        case .filters:  return MeeshyColors.info           // sky blue
        case .timeline: return MeeshyColors.indigo300      // pale indigo
        }
    }

    @ViewBuilder
    var emptyStateLargePicker: some View {
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
                    .foregroundColor((colorScheme == .dark ? Color.white : MeeshyColors.indigo950).opacity(0.7))
            }
            .padding(.top, 8)
            .opacity(pickerSelectedTool == nil ? 1 : 0)
            .scaleEffect(pickerSelectedTool == nil ? 1 : 0.95)

            // 6 tiles in a 2-column grid fit comfortably.
            // The grid sizes to its content so the picker stays at
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
                                         defaultValue: "Photos, vidéos",
                                         bundle: .module)
                    )
                    largeToolTile(
                        .audio,
                        icon: "music.note",
                        title: String(localized: "story.composer.empty.tile.son",
                                      defaultValue: "Son",
                                      bundle: .module),
                        subtitle: String(localized: "story.composer.empty.tile.son.sub",
                                         defaultValue: "Musique, voix",
                                         bundle: .module),
                        specialCategory: .son
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
                    title: String(localized: "story.tool.texture",
                                  defaultValue: "Fond",
                                  bundle: .module),
                    subtitle: String(localized: "story.background.swatch",
                                     defaultValue: "Couleur de fond",
                                     bundle: .module)
                )
                largeToolTile(
                    .timeline,
                    icon: "clock",
                    title: String(localized: "story.composer.empty.tile.timeline",
                                  defaultValue: "Timeline",
                                  bundle: .module),
                    subtitle: String(localized: "story.composer.empty.tile.timeline.sub",
                                     defaultValue: "Montage et durée",
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
            // Aligné sur la même charte que `ComposerBottomBand` : un tint
            // opaque adaptatif (blanc en light / indigo950 en dark) pour rester
            // lisible quelle que soit la couleur du canvas (pastel/photo) en
            // arrière-plan. Avant: `.ultraThinMaterial` qui se faisait teinter
            // par la slide et écrasait le contraste des sous-titres.
            .fill(colorScheme == .dark
                ? MeeshyColors.indigo950.opacity(0.92)
                : Color.white.opacity(0.92))
            .overlay(
                UnevenRoundedRectangle(
                    topLeadingRadius: 24,
                    bottomLeadingRadius: 0,
                    bottomTrailingRadius: 0,
                    topTrailingRadius: 24,
                    style: .continuous
                )
                .stroke(
                    (colorScheme == .dark ? Color.white : MeeshyColors.indigo950).opacity(0.08),
                    lineWidth: 0.5
                )
            )
            .shadow(color: .black.opacity(0.20), radius: 14, y: -6)
            .ignoresSafeArea(edges: .bottom)
        )
    }

    @ViewBuilder
    func largeToolTile(
        _ tool: StoryToolMode,
        icon: String,
        title: String,
        subtitle: String,
        specialCategory: BandCategory? = nil
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
                // when addText then re-sets it back — and the @Published
                // re-render race could leave activeTool nil at the end.
                // Adopt the simpler invariant : addText is the sole entry
                // point for the .text tool when the slide has no text yet.
                if tool == .text,
                   viewModel.currentEffects.textObjects.isEmpty {
                    // Create the text and jump straight into the floating
                    // editor so the user can type immediately.
                    if let newText = viewModel.addText() {
                        viewModel.enterTextEditingMode(textId: newText.id)
                    }
                } else {
                    viewModel.selectTool(tool)
                }
                // Auto-open the band to the selected tool's category + panel
                // so controls appear immediately when the empty-state picker
                // transitions out. Without this, the band stayed .hidden and
                // the user had to manually tap a FAB to reveal controls.
                bandStateMachine.tapFAB(specialCategory ?? tool.bandCategory)
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
                    // Couleur adaptée au mode système — sur fond pastel clair
                    // le blanc sur clair était illisible. On utilise indigo950
                    // en light mode (contraste sur pastel) et blanc en dark.
                    Text(title)
                        .font(.system(size: 14, weight: .semibold, design: .rounded))
                        .foregroundColor(colorScheme == .dark ? .white : MeeshyColors.indigo950)
                        .lineLimit(1)
                    Text(subtitle)
                        .font(.system(size: 11))
                        .foregroundColor((colorScheme == .dark ? Color.white : MeeshyColors.indigo950).opacity(0.75))
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
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel(title)
        .accessibilityHint(subtitle)
    }

    // MARK: - Canvas + Drawing Layer (Task 2.18)

    /// CALayer-based canvas + drawing overlay + viewport transform/gestures
    /// + loading + zoom-reset overlays. Extracted so the SwiftUI type-checker
    /// doesn't time out on the parent body.
    @ViewBuilder
    var canvasComposerLayer: some View {
        // **Parité 9:16 composer ↔ reader / preview / export (2026-06-01).**
        // Le canvas d'édition était auparavant plein écran (`.ignoresSafeArea()`
        // sans contrainte de ratio), donc plus haut que 9:16 sur la plupart des
        // iPhone (ex. 402×874 sur iPhone 16 Pro). Le reader, lui, contraint le
        // canvas à 9:16 (402×714). Comme `StoryRenderer` projette en design→écran
        // sur la largeur (`scaleFactor = width/1080`), texte/média round-trippaient
        // (même largeur) mais : (1) le **dessin** (projection bounds non-uniforme
        // `1920/bounds.height`, cf. `StrokeCaptureLayer`) se compressait du ratio
        // `714/874` au reader et se détachait du texte qu'il entourait ; (2) le
        // contenu placé dans la hauteur excédentaire du composer était rogné par
        // le reader 9:16. On contraint donc le canvas à `aspectFitSize` (source de
        // vérité partagée avec le reader), centré dans la zone disponible — les
        // bandes letterbox haut/bas accueillent la top bar et le toolbar flottant.
        GeometryReader { proxy in
            // Le canvas garde des bounds intrinsèques 9:16 FIXES (`aspectFitSize` du
            // viewport PLEIN) — on n'anime JAMAIS la frame de la
            // `UIViewRepresentable` (sinon `layoutSubviews → rebuildLayers()` à
            // chaque frame = tempête perf). Le placement « cardé au-dessus de la
            // sheet » est rendu UNIQUEMENT par le container SwiftUI qui applique
            // `scaleEffect`/`offset`/`clipShape` calculés par `StoryCanvasFraming`.
            // La sheet (band/dessin/éditeur texte) est épinglée en bas ; le canvas
            // se rétracte au-dessus d'elle (`bottomInset = presentedSheetHeight`)
            // au lieu de la chevaucher (ancienne Option A).
            let headerInset = max(proxy.safeAreaInsets.top, 59) + 12
            // Marge basse minimale même sheet repliée → la carte reste détachée du bas du
            // viewport (et de la poignée), sinon elle touchait quasi le bord en collapse.
            let bottomInset = max(presentedSheetHeight, 16) + max(proxy.safeAreaInsets.bottom, 0)
            let framing = StoryCanvasFraming.resolve(.init(
                viewport: proxy.size,
                headerInset: headerInset,
                bottomInset: bottomInset,
                // Marge latérale : la carte canvas reste toujours détachée des bords du
                // viewport (spec user 2026-06-02 « une marge suffisante pour être distingué
                // du viewport »), pour tous les outils (dessin inclus).
                sideInset: 14,
                state: canvasIsCarded ? .carded : .free,
                cardedCornerRadius: 22))
            let fit = CanvasGeometry.aspectFitSize(in: proxy.size)
            // Rayon compensé par `framing.scale` : la carte est rendue à sa taille
            // intrinsèque `fit` PUIS réduite par `.scaleEffect(framing.scale)`, donc
            // un rayon UIKit de `cornerRadius / scale` atterrit à ~22pt à l'écran.
            // La rondeur doit vivre sur le layer UIKit : le `.clipShape` SwiftUI
            // ci-dessous ne masque pas l'arbre CALayer embarqué.
            canvasCore(cornerRadius: framing.scale > 0 ? framing.cornerRadius / framing.scale : 0)
                .frame(width: fit.width, height: fit.height)
                .scaleEffect(viewModel.canvasScale * viewportPinchDelta)
                .offset(
                    x: viewModel.canvasOffset.width + viewportDragDelta.width,
                    y: viewModel.canvasOffset.height + viewportDragDelta.height
                )
                // Le pinch viewport (zoom canvas) est maintenant un pinch 3 doigts
                // géré par `ThreeFingerPinchGestureRecognizer` côté UIKit, routé
                // via `onCanvasZoomScaleChanged`. Sans ça, l'ancien
                // `MagnificationGesture` SwiftUI 2-doigts firait en parallèle du
                // pinch d'élément UIKit → tout le canvas scalait.
                .gesture(isCanvasGestureEnabled && isPanEnabled ? viewportDragGesture : nil)
                .overlay { mediaLoadingOverlay }
                .overlay(alignment: .topTrailing) { canvasZoomResetButton }
                .overlay(alignment: .top) {
                    CanvasLayerIndicator(layer: manipulationLayer)
                        .padding(.top, 6)
                        .allowsHitTesting(false)
                }
                // Mesure la frame globale du canvas 9:16 PRÉSENTÉE (post-scale) —
                // `canvasNaturalFrame` pilote l'évitement clavier `canvasEditShift`
                // qui projette `textObj.y * canvasNaturalFrame.height`. Attaché
                // AVANT le container transform pour rapporter le rect réellement
                // affiché (le canvas cardé), donc le calcul reste exact.
                .background(
                    GeometryReader { p in
                        Color.clear
                            .onAppear { canvasNaturalFrame = p.frame(in: .global) }
                            .adaptiveOnChange(of: p.frame(in: .global)) { _, f in
                                canvasNaturalFrame = f
                            }
                    }
                )
                // ── Container transform (A4) : placement « carte au-dessus de la
                // sheet ». Seules ces 3 modifications réagissent au carding ; les
                // bounds intrinsèques (`fit`) restent FIXES (jamais animées).
                .scaleEffect(framing.scale)
                .offset(framing.offset)
                .clipShape(RoundedRectangle(cornerRadius: framing.cornerRadius, style: .continuous))
                .frame(width: proxy.size.width, height: proxy.size.height, alignment: .center)
                .offset(y: -canvasEditShift)
                .animation(.spring(response: 0.32, dampingFraction: 0.85), value: framing)
                .animation(.spring(response: 0.32, dampingFraction: 0.85), value: canvasEditShift)
        }
        .ignoresSafeArea()
    }

    /// Le mode DESSIN est actif (contrôleurs flottants OU machine d'état sur dessin).
    /// En dessin (Option A, spec user 2026-06-01) le canvas reste PLEIN et seul un
    /// top reserve + l'arrondi s'appliquent (le drawer flotte par-dessus le bas du
    /// canvas — il ne le rétrécit plus). C'est ce qui rend le dessin WYSIWYG avec la
    /// preview/le reader (le drawing remplit tout le viewport).
    var canvasIsInset: Bool {
        viewModel.drawingEditingMode.isActive
            || bandStateMachine.state.activeCategory == .drawing
    }

    /// Hauteur visible du drawer dessin (band partagé) — sert UNIQUEMENT à lever les
    /// contrôleurs flottants (`StoryDrawingToolbar`) juste au-dessus du drawer. Replié
    /// « totalement » = poignée seule ; déplié = panneau (liste des traits) + chrome.
    /// Ne rétrécit PLUS le canvas (Option A).
    var drawingDrawerHeight: CGFloat {
        guard canvasIsInset else { return 0 }
        return bandDrawerCollapsed ? Self.drawingDrawerGrabberHeight : composerBandHeight + 40
    }

    static let composerBandMinHeight: CGFloat = 160
    static let composerBandMaxHeight: CGFloat = 540

    /// Vrai dès qu'un panneau (band partagé, mode dessin, ou éditeur texte) est
    /// présenté : le canvas se carde alors en rectangle arrondi AU-DESSUS de la
    /// sheet (plus de chevauchement Option A). Truth-table dans `StoryCanvasFraming`.
    var canvasIsCarded: Bool {
        let bandPresent = bandStateMachine.state != .hidden
        let drawingActive = viewModel.drawingEditingMode.isActive
        let textActive = viewModel.textEditingMode != .inactive
        return StoryCanvasFraming.isCarded(
            bandPresent: bandPresent,
            drawingActive: drawingActive,
            textActive: textActive
        )
    }

    /// Hauteur (en points) de la sheet actuellement présentée, telle que le canvas
    /// doit la réserver en bas pour ne PAS la chevaucher. Source INTÉRIMAIRE
    /// (lot B4 remplacera la source par un modèle par-outil) : band/dessin →
    /// `composerBandHeight` cappé ; éditeur texte → `keyboardHeight + 132` (barre
    /// bulles). Hors carding → `0` (canvas plein écran).
    var presentedSheetHeight: CGFloat {
        guard canvasIsCarded else { return 0 }
        let cap = cappedSheetMaxHeight(screenHeight: composerScreenHeight)
        if viewModel.textEditingMode != .inactive {
            return min(cap, keyboardHeight + 132)
        }
        // Drawer replié (tout outil) → seul le grabber est présenté : le canvas ne
        // réserve que sa hauteur, au lieu de la pleine hauteur du band. Sans ça la
        // réservation (composerBandHeight) ne matchait pas la sheet visible (poignée
        // seule) → canvas mal cadré + écart sous le canvas (bug user 2026-06-02).
        if bandDrawerCollapsed {
            return Self.drawingDrawerGrabberHeight
        }
        return min(cap, composerBandHeight)
    }

    /// Plafond de hauteur de sheet : ~42 % de l'écran, borné à 540 pt — garde le
    /// canvas cardé toujours visible (jamais écrasé sous la sheet).
    func cappedSheetMaxHeight(screenHeight: CGFloat) -> CGFloat {
        min(540, screenHeight * 0.42)
    }

    /// Hauteur de la fenêtre active (et non `UIScreen.main.bounds`) — identique au
    /// calcul de `recomputeCanvasShift`, pour respecter split-screen / Stage Manager.
    var composerScreenHeight: CGFloat {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first?.windows.first(where: { $0.isKeyWindow })?.bounds.height
            ?? UIScreen.main.bounds.height
    }

    @ViewBuilder
    func canvasCore(cornerRadius: CGFloat) -> some View {
        StoryComposerCanvasView(
            slide: $viewModel.currentSlide,
            onItemTapped: { id, kind in
                // Tap simple = sélection. Le canvas a déjà ramené l'élément
                // touché au premier plan. Le double-tap est réservé à
                // l'édition dédiée (overlay texte / éditeur d'image).
                HapticFeedback.light()
                viewModel.selectedElementId = id
                switch kind {
                case .text:
                    // Tap on a text → open the floating text edit overlay.
                    viewModel.enterTextEditingMode(textId: id)
                case .media:
                    // Tap simple sur un média : sélection seule. Le canvas
                    // l'a remonté au premier plan et `selectedElementId` est
                    // posé ci-dessus. L'éditeur d'image plein écran s'ouvre
                    // au double-tap.
                    break
                case .sticker:
                    break
                }
            },
            onItemDoubleTapped: { id, kind in
                HapticFeedback.medium()
                viewModel.selectedElementId = id
                switch kind {
                case .text:
                    // Double-tap on a text behaves like a single tap —
                    // opens the floating text edit overlay (idempotent).
                    viewModel.enterTextEditingMode(textId: id)
                case .media:
                    // Open dedicated full-screen media editor (image crop / video editor)
                    openMediaEditor(elementId: id)
                case .sticker:
                    break
                }
            },
            onItemDuplicated: { oldId, newId, kind in
                // Context-menu "Dupliquer" path mutates the slide directly inside
                // StoryCanvasUIView, but the ephemeral preview caches (loadedImages /
                // loadedVideoURLs) live on the viewModel. Mirror them under the new
                // UUID so the duplicated row shows its thumbnail immediately and
                // CALayer media rendering picks it up on the next rebuild.
                if kind == .media {
                    if let img = viewModel.loadedImages[oldId] {
                        viewModel.loadedImages[newId] = img
                    }
                    if let url = viewModel.loadedVideoURLs[oldId] {
                        viewModel.loadedVideoURLs[newId] = url
                    }
                    // Captions duplicate together with the video — sinon le
                    // clone perdrait ses sous-titres et l'utilisateur devrait
                    // re-transcrire alors qu'il duplique exprès.
                    if let captions = viewModel.loadedVideoCaptions[oldId] {
                        viewModel.loadedVideoCaptions[newId] = captions
                    }
                }
            },
            editingTextId: viewModel.textEditingMode.activeTextId,
            onInlineTextChanged: { id, str in
                guard let i = viewModel.currentEffects.textObjects.firstIndex(where: { $0.id == id })
                else { return }
                var effects = viewModel.currentEffects
                effects.textObjects[i].text = str
                viewModel.currentEffects = effects
            },
            onInlineTextEditEnded: { _ in
                viewModel.exitTextEditingMode()
            },
            onManipulationLayerChanged: { layer in
                manipulationLayer = layer
            },
            onCanvasZoomScaleChanged: { scale, state in
                // Pinch 3-doigts piloté par UIKit (cf. `ThreeFingerPinchGestureRecognizer`).
                // On remplace l'ancien `MagnificationGesture` SwiftUI 2-doigts
                // qui firait en parallèle du pinch d'élément et faisait scaler
                // tout le canvas en même temps que l'élément.
                switch state {
                case .began, .changed:
                    viewportPinchDelta = scale
                case .ended:
                    let newScale = min(4.0, max(0.5, viewModel.canvasScale * scale))
                    withAnimation(.spring(response: 0.2)) {
                        viewModel.canvasScale = newScale
                        if newScale <= 1.0 { viewModel.canvasOffset = .zero }
                    }
                    viewportPinchDelta = 1.0
                case .cancelled, .failed:
                    viewportPinchDelta = 1.0
                default:
                    break
                }
            },
            onBackgroundTapped: {
                withAnimation(.spring(response: 0.3)) {
                    areFabsVisible.toggle()
                }
            },
            onBackgroundTransformChanged: { transform in
                viewModel.backgroundTransform = StoryComposerViewModel.BackgroundTransform(
                    scale: transform.scale ?? 1.0,
                    offsetX: transform.offsetX ?? 0,
                    offsetY: transform.offsetY ?? 0,
                    rotation: transform.rotation ?? 0,
                    videoFitMode: transform.videoFitMode
                )
                viewModel.saveBackgroundTransform()
            },
            // Quand le drawing overlay est actif, le canvas doit supprimer
            // son drawingLayer persisté — sinon double rendu (ancien drawing
            // au mauvais endroit dans le design space + nouveau drawing live
            // du PKCanvasView en bounds space). Bug "écrit en double", 2026-05-27.
            isDrawingOverlayActive: viewModel.isDrawingActive,
            // Pont vers `StoryCanvasUIView.readerContext.imageCache` —
            // `StoryMediaLayer.configureImage` consulte d'abord ce cache
            // (clé = media.id) avant le file:// path, donc le main canvas
            // reflète immédiatement les éditions image (bug 2026-05-27).
            // La version sert de cookie au Coordinator pour ne déclencher
            // un rebuild qu'aux mutations utiles.
            loadedImages: viewModel.loadedImages,
            loadedImagesVersion: viewModel.loadedImagesVersion,
            canvasCornerRadius: cornerRadius
        )
        .allowsHitTesting(!viewModel.isDrawingActive)
        .overlay {
            if viewModel.isDrawingActive {
                // Refonte dessin (2026-05-30) : capture single-stroke (PencilKit) +
                // rendu live des traits éditables (avec halo sélection). Le canvas
                // sous-jacent suppress son propre drawingLayer pendant ce temps
                // (`suppressDrawingOverlay`), donc pas de double rendu.
                ZStack {
                    MeeshyStrokeCanvas(
                        strokes: viewModel.drawingStrokes,
                        selectedId: viewModel.drawingEditingMode.selectedStrokeId
                    )
                    .equatable()
                    // Aperçu WYSIWYG du trait en cours (C4) : rendu PAR-DESSUS les
                    // traits commités, par notre moteur largeur-variable, donc identique
                    // au trait finalement commité au lift-up.
                    if let preview = viewModel.activeStrokePreview {
                        MeeshyStrokeCanvas(strokes: [preview], selectedId: nil)
                    }
                    StrokeCaptureLayer(
                        activeTool: viewModel.activeBrushTool,
                        activeColorHex: DrawingEditToolOptions.hex(of: viewModel.drawingColor),
                        activeWidth: Double(viewModel.drawingWidth),
                        activeSmoothing: viewModel.activeBrushSmoothing,
                        onStrokeInProgress: { viewModel.activeStrokePreview = $0 },
                        onStrokeCommitted: { stroke in
                            // `commitStroke` ajoute le trait ET vide la pile de redo
                            // (un nouveau trait rend le « rétablir » caduc).
                            viewModel.commitStroke(stroke)
                            viewModel.activeStrokePreview = nil
                        },
                        onEraseGesture: { points in
                            eraseStrokes(near: points)
                            viewModel.activeStrokePreview = nil
                        }
                    )
                }
            }
        }
        .overlay { audioForegroundOverlay }
        .overlay { videoMuteOverlay }
    }

    /// Chip glass posé sur le canvas pour chaque audio foreground (i.e.
    /// `isBackground != true`). La position vient du modèle (`x`/`y`
    /// normalisés) ; le drag local est éphémère et ne pousse que sur release
    /// pour éviter le scintillement des vues observant le VM. L'icône absente
    /// venait du fait que `StoryAudioPlayerView` n'était wired nulle part —
    /// ce chip est plus léger et dédié à la composition.
    @ViewBuilder
    var audioForegroundOverlay: some View {
        if !viewModel.isDrawingActive {
            GeometryReader { geo in
                ForEach(foregroundAudioBindings, id: \.wrappedValue.id) { binding in
                    AudioForegroundChip(
                        audioObject: binding,
                        canvasSize: geo.size,
                        mode: .composer,
                        isSelected: viewModel.selectedElementId == binding.wrappedValue.id,
                        isUserMuted: binding.wrappedValue.volume <= 0,
                        onDragEnd: { HapticFeedback.light() },
                        onTap: {
                            HapticFeedback.light()
                            viewModel.selectedElementId = binding.wrappedValue.id
                        },
                        onToggleMute: {
                            HapticFeedback.light()
                            var obj = binding.wrappedValue
                            obj.volume = obj.volume > 0 ? 0 : 1
                            binding.wrappedValue = obj
                        }
                    )
                }
            }
        }
    }

    /// Bouton mute (icône au touché) posé sur chaque vidéo foreground du canvas
    /// d'édition. Tap → coupe / réactive le son de la vidéo (persisté via le
    /// `volume` du modèle : 0 = muet). L'aperçu live, le reader et l'export
    /// respectent tous ce `volume`. Posé dans le MÊME espace de coordonnées que
    /// les chips audio (overlay sur le canvas) pour un placement cohérent.
    @ViewBuilder
    var videoMuteOverlay: some View {
        if !viewModel.isDrawingActive {
            GeometryReader { geo in
                ForEach(foregroundVideoBindings, id: \.wrappedValue.id) { binding in
                    videoMuteButton(for: binding, canvasSize: geo.size)
                }
            }
        }
    }

    func videoMuteButton(for binding: Binding<StoryMediaObject>,
                                 canvasSize: CGSize) -> some View {
        let media = binding.wrappedValue
        let muted = media.volume <= 0
        // Coin haut-droit de la vidéo : centre normalisé + demi-taille projetée
        // (même convention que `StoryMediaLayer.configure`). La rotation n'est
        // pas appliquée à l'icône (affordance, tolérance suffisante).
        let scaleFactor = canvasSize.width / CanvasGeometry.designWidth
        let base = StoryMediaLayer.baseMediaDesignSize(aspectRatio: media.aspectRatio)
        let halfW = base.width * CGFloat(media.scale) * scaleFactor / 2
        let halfH = base.height * CGFloat(media.scale) * scaleFactor / 2
        let cx = CGFloat(media.x) * canvasSize.width
        let cy = CGFloat(media.y) * canvasSize.height
        let inset: CGFloat = 18
        let px = min(canvasSize.width - inset, max(inset, cx + halfW - inset))
        let py = min(canvasSize.height - inset, max(inset, cy - halfH + inset))

        return Button {
            HapticFeedback.light()
            var obj = binding.wrappedValue
            obj.volume = obj.volume > 0 ? 0 : 1
            binding.wrappedValue = obj
        } label: {
            Image(systemName: muted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.white)
                .frame(width: 30, height: 30)
                .background(.ultraThinMaterial, in: Circle())
                .overlay(Circle().stroke(Color.white.opacity(0.3), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .position(x: px, y: py)
        .accessibilityLabel(muted ? "Activer le son de la vidéo" : "Couper le son de la vidéo")
    }

    /// Bindings vers chaque vidéo foreground (`isBackground == false`, kind
    /// `.video`) de la slide courante — pour le bouton mute. Écrit en retour
    /// dans `viewModel.currentEffects`, ce qui resync la slide et l'aperçu.
    var foregroundVideoBindings: [Binding<StoryMediaObject>] {
        let medias = viewModel.currentEffects.mediaObjects ?? []
        return medias.enumerated().compactMap { idx, obj -> Binding<StoryMediaObject>? in
            guard obj.isBackground == false, obj.kind == .video else { return nil }
            return Binding<StoryMediaObject>(
                get: {
                    let list = viewModel.currentEffects.mediaObjects ?? []
                    return list.indices.contains(idx) ? list[idx] : obj
                },
                set: { newValue in
                    var effects = viewModel.currentEffects
                    guard var list = effects.mediaObjects,
                          list.indices.contains(idx) else { return }
                    list[idx] = newValue
                    effects.mediaObjects = list
                    viewModel.currentEffects = effects
                }
            )
        }
    }

    /// Bindings vers chaque `StoryAudioPlayerObject` foreground de la slide
    /// courante. Le binding écrit en retour dans `viewModel.currentEffects`
    /// — ce qui resync la slide via `currentSlide.didSet` et propage au canvas.
    var foregroundAudioBindings: [Binding<StoryAudioPlayerObject>] {
        let audios = viewModel.currentEffects.audioPlayerObjects ?? []
        return audios.enumerated().compactMap { idx, obj -> Binding<StoryAudioPlayerObject>? in
            guard obj.isBackground != true else { return nil }
            return Binding<StoryAudioPlayerObject>(
                get: {
                    let list = viewModel.currentEffects.audioPlayerObjects ?? []
                    return list.indices.contains(idx) ? list[idx] : obj
                },
                set: { newValue in
                    var effects = viewModel.currentEffects
                    guard var list = effects.audioPlayerObjects,
                          list.indices.contains(idx) else { return }
                    list[idx] = newValue
                    effects.audioPlayerObjects = list
                    viewModel.currentEffects = effects
                }
            )
        }
    }

    @ViewBuilder
    var mediaLoadingOverlay: some View {
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
    var canvasZoomResetButton: some View {
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
    var timelineSection: some View {
        // V2 timeline editor is the product — no feature-flag gating since the
        // app has not yet shipped to a userbase that requires backwards-compat.
        TimelineContainerSwitcher(viewModel: viewModel.timelineViewModel)
    }



    // MARK: - Helpers

    /// Décale le canvas vers le haut juste assez pour que le texte édité reste
    /// au-dessus de (clavier + barre d'outils). Basé sur la position normalisée
    /// `y` du modèle — pas de pont de coordonnées UIKit↔SwiftUI.
    func recomputeCanvasShift() {
        guard keyboardHeight > 0,
              let id = viewModel.textEditingMode.activeTextId,
              let textObj = viewModel.currentEffects.textObjects.first(where: { $0.id == id }),
              canvasNaturalFrame.height > 0 else {
            canvasEditShift = 0
            return
        }
        let toolbarHeight: CGFloat = 132   // barre bulles + marge (ajuster au visuel)
        let margin: CGFloat = 24
        // Use the active window's height (NOT UIScreen.main.bounds.height),
        // so split-screen / Stage Manager / iPad multitasking report the
        // window the composer actually lives in instead of the full display.
        let screenHeight = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first?.windows.first(where: { $0.isKeyWindow })?.bounds.height
            ?? UIScreen.main.bounds.height
        let textCenterY = canvasNaturalFrame.minY
            + CGFloat(textObj.y) * canvasNaturalFrame.height
        let visibleBottom = screenHeight - keyboardHeight - toolbarHeight - margin
        canvasEditShift = max(0, textCenterY - visibleBottom)
    }

    var safeAreaBottomInset: CGFloat {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first?.windows.first?.safeAreaInsets.bottom ?? 0
    }

    func textObjectBinding(for id: String) -> Binding<StoryTextObject>? {
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

    func syncCurrentSlideEffects() {
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
    func resetLocalState() {
        // Canvas-local state (read by buildEffects via canvasSyncFingerprint)
        selectedFilter = nil
        selectedImage = nil
        stickerObjects = []

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

    func restoreCanvas(from slide: StorySlide) {
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
        // Refonte dessin (2026-05-30) : le dessin est porté par `currentEffects`
        // (`drawingStrokes` moderne + `drawingData` legacy decode-only). Le composer
        // ne maintient plus de `PKCanvasView` local — la capture passe par
        // `StrokeCaptureLayer` et le rendu par `MeeshyStrokeCanvas` / `StoryRenderer`.
        viewModel.drawingData = e.drawingData
        if let bt = e.backgroundTransform {
            viewModel.backgroundTransform = StoryComposerViewModel.BackgroundTransform(
                scale: bt.scale ?? 1.0, offsetX: bt.offsetX ?? 0,
                offsetY: bt.offsetY ?? 0, rotation: bt.rotation ?? 0,
                videoFitMode: bt.videoFitMode
            )
        } else {
            viewModel.backgroundTransform = StoryComposerViewModel.BackgroundTransform()
        }
    }

    /// Gomme par hit-test : supprime tout trait dont un point de rendu (espace
    /// design) tombe dans le rayon du geste de gomme. Pas d'effacement pixel-par-pixel
    /// (le modèle est vectoriel) — on supprime le trait entier croisé, UX acceptable
    /// (cf. Risque #2 du plan).
    func eraseStrokes(near erasePoints: [CGPoint]) {
        guard !erasePoints.isEmpty else { return }
        let eraseRadius: CGFloat = 28  // design px
        let survivors = viewModel.drawingStrokes.filter { stroke in
            let reach = CGFloat(stroke.width) / 2 + eraseRadius
            let points = StrokePathBuilder.renderPoints(for: stroke)
            for sp in points {
                for ep in erasePoints where hypot(sp.x - ep.x, sp.y - ep.y) <= reach {
                    return false
                }
            }
            return true
        }
        if survivors.count != viewModel.drawingStrokes.count {
            viewModel.drawingStrokes = survivors
            HapticFeedback.light()
        }
    }

    func buildEffects() -> StoryEffects {
        let bgHex = selectedImage != nil ? nil : viewModel.backgroundColor.replacingOccurrences(of: "#", with: "")
        let bt = viewModel.backgroundTransform
        let bgTransform = StoryBackgroundTransform(
            scale: bt.scale != 1.0 ? bt.scale : nil,
            offsetX: bt.offsetX != 0 ? bt.offsetX : nil,
            offsetY: bt.offsetY != 0 ? bt.offsetY : nil,
            rotation: bt.rotation != 0 ? bt.rotation : nil,
            videoFitMode: bt.videoFitMode
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
            // Read the filter from `currentEffects` (the authoritative source the
            // active filter grid writes via `viewModel.applyFilter`), NOT the
            // View-local `@State selectedFilter` which only the vestigial legacy
            // picker updates. Reading the stale @State made `buildEffects()`
            // overwrite the slide's effects with `filter: nil`, so the Play
            // preview (and publish) lost the effect even though the composer
            // canvas showed it. Bug « effet pas préservé dans le preview » 2026-06-03.
            filter: current.filter,
            filterIntensity: current.filterIntensity,
            stickers: stickerObjects.isEmpty ? nil : stickerObjects.map(\.emoji),
            stickerObjects: stickerObjects.isEmpty ? nil : stickerObjects,
            drawingData: viewModel.drawingData,
            // Refonte dessin (2026-05-30) : `drawingStrokes` est la source de vérité
            // moderne. `buildEffects` reconstruit l'effet from scratch, donc on doit
            // ré-émettre les traits sinon ils sont effacés à chaque sync de slide.
            drawingStrokes: viewModel.drawingStrokes.isEmpty ? nil : viewModel.drawingStrokes,
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
            // `slideDuration: nil` — la durée n'est plus stockée dans
            // `effects`. Le viewer la recalcule from-scratch via
            // `StorySlide.computedTotalDuration()` (cf. centralisation
            // 2026-05-28). Évite que les vieilles valeurs persistées
            // (12 s, etc.) écrasent le défaut 6 s pour les statics.
            slideDuration: nil
        )
    }

    // MARK: - Media Loading

    func handleForegroundMediaSelection(from item: PhotosPickerItem?) {
        guard let item else { return }
        let isVideo = item.supportedContentTypes.contains { $0.conforms(to: .movie) || $0.conforms(to: .video) }
        addForegroundMedia(from: item, kind: isVideo ? .video : .image)
    }

    func addForegroundMedia(from item: PhotosPickerItem?, kind: StoryMediaKind) {
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
                    // Mesure de l'aspectRatio natural de la vidéo via le
                    // track vidéo (naturalSize × preferredTransform). Sans
                    // ça, la layer rend la vidéo en carré 540×540 (cf. fix
                    // B1 review Opus 2026-05-20).
                    var videoAspectRatio: Double?
                    if let track = try? await asset.loadTracks(withMediaType: .video).first,
                       let natural = try? await track.load(.naturalSize),
                       let transform = try? await track.load(.preferredTransform) {
                        let effective = natural.applying(transform)
                        let w = abs(effective.width)
                        let h = abs(effective.height)
                        if w > 0, h > 0 { videoAspectRatio = Double(w / h) }
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
                            if let ratio = videoAspectRatio {
                                viewModel.setMediaAspectRatio(id: obj.id, aspectRatio: ratio, slideId: targetSlideId)
                            }
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
                    Logger.media.error("[StoryComposer] Video write error: \(error.localizedDescription)")
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
                        // AspectRatio natural depuis l'UIImage.size — sans
                        // ça la layer rend l'image en carré 540×540 (fix B1).
                        let imgSize = image.size
                        if imgSize.width > 0, imgSize.height > 0 {
                            let ratio = Double(imgSize.width / imgSize.height)
                            viewModel.setMediaAspectRatio(id: obj.id, aspectRatio: ratio, slideId: targetSlideId)
                        }
                    }
                }
            }
            await MainActor.run {
                fgMediaItem = nil
            }
        }
    }

    func addVocalToForeground() {
        guard let url = confirmedMediaAudioURL else { return }
        Task {
            let samples: [Float]
            do {
                samples = try await WaveformCache.shared.samples(from: url)
            } catch {
                samples = []  // waveform cosmétique : barres plates si l'analyse échoue
            }
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

    func openMediaEditor(elementId: String) {
        let mediaObj = viewModel.currentEffects.mediaObjects?.first(where: { $0.id == elementId })
        guard let mediaObj else { return }

        if mediaObj.kind == .video, let url = viewModel.loadedVideoURLs[elementId] {
            editingElementVideo = EditingMediaVideo(elementId: elementId, url: url)
        } else if let image = viewModel.loadedImages[elementId] {
            editingElementImage = EditingMediaImage(elementId: elementId, image: image)
        }
    }

    func addRecordingToBackground(url: URL) {
        Task {
            let samples: [Float]
            do {
                samples = try await WaveformCache.shared.samples(from: url)
            } catch {
                samples = []  // waveform cosmétique : barres plates si l'analyse échoue
            }
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

    func publishAllSlides() {
        // Pré-calcul des thumbHashes (image + vidéo) avant le hand-off vers
        // l'uploader background. La génération vidéo est async via
        // `AVAssetImageGenerator.image(at:)` (iOS 16+) ; on cap chaque média
        // à 5s puis on continue avec thumbHash = nil pour ne pas bloquer.
        publishTask?.cancel()
        publishTask = Task { @MainActor in
            // `defer` garantit le reset de @publishTask même si la Task est
            // annulée mid-flight (handleDismiss / quit pendant le compute des
            // thumbHashes). Sans ça, `publishTask != nil` reste true et le
            // bouton publier reste disabled si l'utilisateur réessaye.
            defer { publishTask = nil }
            syncCurrentSlideEffects()
            let snapshot = await snapshotAllSlides()
            guard !Task.isCancelled else { return }
            clearAllDrafts()
            HapticFeedback.success()
            let mode = PostVisibility(rawValue: visibility) ?? .public
            let ids = mode.requiresUserSelection ? visibilityUserIds : []
            onPublishAllInBackground(snapshot.slides, snapshot.bgImages, viewModel.loadedImages, viewModel.loadedVideoURLs, viewModel.loadedAudioURLs, storyLanguage, visibility, ids)
        }
    }

    func snapshotAllSlides() async -> (slides: [StorySlide], bgImages: [String: UIImage]) {
        var slides = viewModel.slides
        let idx = viewModel.currentSlideIndex
        if idx < slides.count {
            slides[idx].effects = buildEffects()
        }
        // NB : on n'écrit plus `effects.slideDuration` à chaque publish
        // depuis la centralisation 2026-05-28. La durée est entièrement
        // dérivée from-scratch côté lecteur par
        // `StorySlide.computedTotalDuration()` (bg media duration loop /
        // texte long / défaut 6s). Le champ `effects.slideDuration` reste
        // dans le schema pour compat backend mais le viewer ne le lit
        // plus — il est ignoré. Si un jour on veut une vraie surcharge
        // explicite par l'auteur, ce sera un champ dédié (ex:
        // `effects.authorPinnedDuration`) lu en priorité dans
        // `computedTotalDuration`.
        // ThumbHash composite par slide (bg + texte + média + stickers) — sync.
        for i in slides.indices {
            let bgImage = viewModel.slideImages[slides[i].id]
            slides[i].effects.thumbHash = StorySlideRenderer.computeThumbHash(
                slide: slides[i],
                bgImage: bgImage,
                loadedImages: viewModel.loadedImages
            )

            // ThumbHash per-media foreground.
            // - Images : sync via `UIImage.toThumbHash()` (~5-15 ms par image).
            // - Vidéos : on prend d'abord le thumbnail cached dans `loadedImages`
            //   si présent (issu de `mediaAddedFromPicker`), sinon génération
            //   async via `AVAssetImageGenerator` (iOS 16+).
            guard var medias = slides[i].effects.mediaObjects else { continue }
            var videoJobs: [(j: Int, url: URL)] = []

            for j in medias.indices where medias[j].thumbHash == nil {
                let mediaId = medias[j].id
                if let cached = viewModel.loadedImages[mediaId] {
                    medias[j].thumbHash = cached.toThumbHash()
                    continue
                }
                if medias[j].kind == .video,
                   let url = viewModel.loadedVideoURLs[mediaId] {
                    videoJobs.append((j, url))
                }
            }

            if !videoJobs.isEmpty {
                await withTaskGroup(of: (Int, String?).self) { group in
                    for job in videoJobs {
                        group.addTask {
                            let hash = await Self.computeVideoThumbHash(url: job.url)
                            return (job.j, hash)
                        }
                    }
                    for await (j, hash) in group {
                        medias[j].thumbHash = hash
                    }
                }
            }

            slides[i].effects.mediaObjects = medias
        }
        return (slides, viewModel.slideImages)
    }

    /// Génère un thumbHash à partir de la première frame d'une vidéo locale.
    /// Utilise l'API async iOS 16+ d'`AVAssetImageGenerator`. Timeout interne
    /// implicite (l'extraction d'une frame à t=0.1s d'une vidéo locale
    /// prend typiquement < 200 ms). Retourne `nil` si l'extraction échoue —
    /// le placeholder du reader tombera alors sur le fond noir / le bg slide.
    nonisolated static func computeVideoThumbHash(url: URL) async -> String? {
        let asset = AVURLAsset(url: url)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 100, height: 100)
        let time = CMTime(seconds: 0.1, preferredTimescale: 600)
        do {
            let (cgImage, _) = try await generator.image(at: time)
            return UIImage(cgImage: cgImage).toThumbHash()
        } catch {
            return nil
        }
    }

    // MARK: - Dismiss

    func handleDismiss() {
        let hasContent = viewModel.slides.contains { slide in
            slide.content != nil
                || viewModel.slideImages[slide.id] != nil
                || slide.effects.background != nil
                || !slide.effects.textObjects.isEmpty
                || !(slide.effects.mediaObjects ?? []).isEmpty
                || !(slide.effects.drawingStrokes ?? []).isEmpty
        } || !stickerObjects.isEmpty || viewModel.drawingData != nil || !viewModel.drawingStrokes.isEmpty

        if hasContent { showDiscardAlert = true }
        else { publishTask?.cancel(); publishTask = nil; clearAllDrafts(); onDismiss() }
    }

    func saveDraftAndDismiss() {
        saveDraft()
        onDismiss()
    }

    func cancelAndDismiss() {
        publishTask?.cancel()
        publishTask = nil
        clearAllDrafts()
        onDismiss()
    }

    // MARK: - Draft Persistence

    func saveDraft() {
        syncCurrentSlideEffects()
        StoryDraftStore.shared.save(slides: viewModel.slides, visibility: visibility)
        StoryDraftStore.shared.saveMedia(
            images: viewModel.loadedImages,
            videoURLs: viewModel.loadedVideoURLs,
            audioURLs: viewModel.loadedAudioURLs
        )
        HapticFeedback.light()
    }

    func checkForDraft() {
        if StoryDraftStore.shared.load() != nil {
            showRestoreDraftAlert = true
        } else if UserDefaults.standard.data(forKey: StoryComposerDraft.userDefaultsKey) != nil {
            showRestoreDraftAlert = true
        }
    }

    func restoreDraft() {
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

    func clearAllDrafts() {
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

struct AudioEditorItemWrapper: Identifiable {
    let id = UUID()
    let url: URL
    /// Language tagged at record time (recorder strip); seeds the editor's
    /// transcription language. `nil` for file imports → editor default.
    var language: String? = nil
}

// MARK: - Media Editor Wrappers

struct PendingImageWrapper: Identifiable {
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
    @Environment(\.dismiss) var dismiss
    @State var searchText = ""

    var languages: [(code: String, name: String)] {
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

    var filteredLanguages: [(code: String, name: String)] {
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
            .searchable(text: $searchText, prompt: String(localized: "story.language.search", defaultValue: "Rechercher une langue", bundle: .module))
            .navigationTitle(String(localized: "story.language.title", defaultValue: "Langue du contenu", bundle: .module))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(String(localized: "common.close", defaultValue: "Fermer", bundle: .module)) { dismiss() }
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

    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        // Le bandeau composer a un fond opaque adaptatif (blanc en light,
        // indigo950 en dark). Les pills hardcodés en `.white` étaient
        // invisibles sur fond clair (blanc sur blanc). On adapte foreground
        // et background fill au mode.
        let fgBase: Color = colorScheme == .dark ? .white : MeeshyColors.indigo950
        let foreground: Color = destructive ? MeeshyColors.error : fgBase.opacity(0.88)
        let bgFill: Color = destructive
            ? MeeshyColors.error.opacity(0.15)
            : fgBase.opacity(0.10)
        let strokeColor: Color = destructive
            ? MeeshyColors.error.opacity(0.35)
            : fgBase.opacity(0.18)

        return HStack(spacing: 5) {
            Image(systemName: icon).font(.system(size: 12, weight: .medium))
            Text(text).font(.system(size: 11, weight: .medium))
        }
        .foregroundColor(foreground)
        .padding(.horizontal, 10).padding(.vertical, 7)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(bgFill)
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(strokeColor, lineWidth: 0.5)
                )
        )
    }
}
