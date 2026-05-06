import SwiftUI
import PencilKit
import AVKit
import MeeshySDK

// MARK: - Story Canvas View

struct StoryCanvasView: View {
    @Bindable var viewModel: StoryComposerViewModel

    // External state not yet migrated to ViewModel
    @Binding var drawingCanvas: PKCanvasView
    @Binding var drawingTool: DrawingTool
    @Binding var selectedFilter: StoryFilter?
    @Binding var selectedImage: UIImage?
    @Binding var stickerObjects: [StorySticker]

    // Callbacks
    var onEditText: ((String) -> Void)?
    var onEditMedia: ((String) -> Void)?

    // Background image manipulation — base values from ViewModel (persisted per-slide)
    @GestureState private var dragDelta: CGSize = .zero
    @GestureState private var pinchDelta: CGFloat = 1.0
    @GestureState private var rotationDelta: Angle = .zero
    @State private var filteredImage: UIImage?
    /// In-flight filter render task. Cancelled on filter change / image change /
    /// view disappear so a slow filter operation can't paint a stale result over
    /// a faster one (last-writer-wins race).
    @State private var filterTask: Task<Void, Never>?

    private var imageScale: CGFloat {
        get { viewModel.backgroundTransform.scale }
        nonmutating set { viewModel.backgroundTransform.scale = newValue }
    }
    private var imageOffset: CGSize {
        get { CGSize(width: viewModel.backgroundTransform.offsetX, height: viewModel.backgroundTransform.offsetY) }
        nonmutating set {
            viewModel.backgroundTransform.offsetX = newValue.width
            viewModel.backgroundTransform.offsetY = newValue.height
        }
    }
    private var imageRotation: Angle {
        get { Angle(degrees: viewModel.backgroundTransform.rotation) }
        nonmutating set { viewModel.backgroundTransform.rotation = newValue.degrees }
    }

    init(
        viewModel: StoryComposerViewModel,
        drawingCanvas: Binding<PKCanvasView>,
        drawingTool: Binding<DrawingTool>,
        selectedFilter: Binding<StoryFilter?>,
        selectedImage: Binding<UIImage?>,
        stickerObjects: Binding<[StorySticker]>,
        onEditText: ((String) -> Void)? = nil,
        onEditMedia: ((String) -> Void)? = nil
    ) {
        self.viewModel = viewModel
        self._drawingCanvas = drawingCanvas
        self._drawingTool = drawingTool
        self._selectedFilter = selectedFilter
        self._selectedImage = selectedImage
        self._stickerObjects = stickerObjects
        self.onEditText = onEditText
        self.onEditMedia = onEditMedia
    }

    // MARK: - Convenience accessors

    private var textObjects: [StoryTextObject] {
        viewModel.currentEffects.textObjects ?? []
    }

    private var mediaObjects: [StoryMediaObject] {
        viewModel.currentEffects.mediaObjects ?? []
    }

    private var audioPlayerObjects: [StoryAudioPlayerObject] {
        viewModel.currentEffects.audioPlayerObjects ?? []
    }

    private var isContentToolActive: Bool { viewModel.isContentToolActive }
    private var isDrawingActive: Bool { viewModel.isDrawingActive }

    private func isElementVisible(startTime: Float?, duration: Float?) -> Bool {
        guard viewModel.isTimelinePlaying else { return true }
        let t = viewModel.timelinePlaybackTime
        let start = startTime ?? 0
        guard t >= start else { return false }
        if let dur = duration {
            return t <= start + dur
        }
        return true
    }

    private func elementOpacity(startTime: Float?, duration: Float?, fadeIn: Float?, fadeOut: Float?) -> Double {
        guard viewModel.isTimelinePlaying else { return 1.0 }
        let t = viewModel.timelinePlaybackTime
        let start = startTime ?? 0
        let dur = duration ?? (viewModel.currentSlideDuration - start)
        let end = start + dur

        guard t >= start, t <= end else { return 0.0 }

        if let fi = fadeIn, fi > 0, t < start + fi {
            return Double((t - start) / fi)
        }
        if let fo = fadeOut, fo > 0, t > end - fo {
            return Double((end - t) / fo)
        }
        return 1.0
    }

    private var bgColor: Color {
        Color(hex: viewModel.backgroundColor)
    }

    // MARK: - Body

    var body: some View {
        GeometryReader { geo in
            let canvasSize = StoryCanvasReaderView.canvasSize(fitting: geo.size)
            ZStack {
                // Layer 0: Background color / gradient
                backgroundLayer

                // Layer 1: Background media (fullscreen image or video — pan/zoom)
                backgroundMediaLayer

                // Layer 2: Filter on background only (default)
                if !viewModel.filterAppliesToEntireSlide {
                    composerFilterOverlay
                        .allowsHitTesting(false)
                }

                // Layer 3: Drawing overlay (PKCanvasView)
                drawingLayer

                // Layer 4: Foreground media (positioned draggable tiles)
                foregroundMediaLayer(interactive: !isDrawingActive)

                // Layer 5+: Front elements (text, stickers, audio pills)
                frontElementsGroup(canvasSize: canvasSize)
                    .zIndex(1000)

                // Layer 5.5: Filter on entire slide (when toggled)
                if viewModel.filterAppliesToEntireSlide {
                    composerFilterOverlay
                        .allowsHitTesting(false)
                        .zIndex(1500)
                }

                // Layer N: Safe zone & alignment guides (edit only)
                editingGuidesOverlay(canvasSize: canvasSize)
                    .zIndex(2000)
            }
            .frame(width: canvasSize.width, height: canvasSize.height)
            .clipped()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .overlay(
                RoundedRectangle(cornerRadius: 4)
                    .strokeBorder(style: .storyDashed)
                    .foregroundStyle(MeeshyColors.indigo400.opacity(viewModel.isCanvasZoomed ? 0.6 : 0))
                    .allowsHitTesting(false)
                    .animation(.easeInOut(duration: 0.3), value: viewModel.isCanvasZoomed)
            )
            .contentShape(Rectangle())
            .onTapGesture {
                handleEmptyCanvasTap()
            }
            .onAppear { viewModel.canvasSize = canvasSize }
            .onChange(of: geo.size) { _, newSize in
                viewModel.canvasSize = StoryCanvasReaderView.canvasSize(fitting: newSize)
            }
        }
        .onAppear {
            updateFilteredImage()
        }
        .onChange(of: selectedImage) { _, _ in
            withAnimation(.spring(response: 0.3)) {
                viewModel.backgroundTransform = StoryComposerViewModel.BackgroundTransform()
            }
            updateFilteredImage()
        }
        .onChange(of: selectedFilter) { _, _ in
            updateFilteredImage()
        }
        .onChange(of: viewModel.isTimelinePlaying) { _, isPlaying in
            NotificationCenter.default.post(
                name: isPlaying ? .timelineDidStartPlaying : .timelineDidStopPlaying,
                object: nil
            )
        }
        .onDisappear {
            filterTask?.cancel()
            filterTask = nil
        }
    }

    private func updateFilteredImage() {
        let filter = selectedFilter
        let source = selectedImage
        // Cancel any in-flight filter render before kicking off a new one.
        // Without cancellation, rapid filter switches could complete out-of-order
        // and paint a stale result (e.g., user picks vintage → bw → vintage in
        // 200ms; the slower bw landing last would briefly overwrite vintage).
        filterTask?.cancel()
        filterTask = Task.detached(priority: .userInitiated) {
            let result = source.map { StoryFilterProcessor.apply(filter, to: $0) }
            if Task.isCancelled { return }
            await MainActor.run { filteredImage = result }
        }
    }

    // MARK: - Empty Canvas Tap

    private func handleEmptyCanvasTap() {
        guard !isDrawingActive else { return }
        viewModel.deselectAll()
    }

    // MARK: - Editing guides overlay (safe zone + alignment + warnings)

    @ViewBuilder
    private func editingGuidesOverlay(canvasSize: CGSize) -> some View {
        if !isDrawingActive, !viewModel.isTimelinePlaying {
            let drag = viewModel.activeDrag
            ZStack {
                SafeZoneOverlay(canvasSize: canvasSize, isDragging: drag != nil)
                if let drag {
                    AlignmentGuidesOverlay(canvasSize: canvasSize, dragPosition: drag.position)
                    let bbox = CGRect(
                        x: drag.position.x - drag.size.width / 2,
                        y: drag.position.y - drag.size.height / 2,
                        width: drag.size.width,
                        height: drag.size.height
                    )
                    OutOfBoundsWarningOverlay(
                        canvasSize: canvasSize,
                        isOutOfBounds: StorySafeZone.isOutOfBounds(bbox)
                    )
                }
            }
            .frame(width: canvasSize.width, height: canvasSize.height)
        }
    }

    // MARK: - Background Layer

    private var backgroundLayer: some View {
        ZStack {
            bgColor
                .ignoresSafeArea()

            if selectedImage == nil {
                LinearGradient(
                    colors: [
                        bgColor.opacity(0.8),
                        bgColor,
                        bgColor.opacity(0.9)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            }
        }
    }

    // MARK: - Filter Overlay

    @ViewBuilder
    private var composerFilterOverlay: some View {
        if let filter = selectedFilter {
            StoryFilterOverlayView(filter: filter, intensity: viewModel.filterIntensity)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    // MARK: - Background Media Layer (fullscreen, single media: image or video)

    @ViewBuilder
    private var backgroundMediaLayer: some View {
        if let bgMedia = viewModel.currentEffects.resolvedBackgroundMedia {
            // New system: background from mediaObjects
            if bgMedia.kind == .image, let image = filteredImage ?? viewModel.loadedImages[bgMedia.id] {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .scaleEffect(imageScale * pinchDelta)
                    .offset(
                        x: imageOffset.width + dragDelta.width,
                        y: imageOffset.height + dragDelta.height
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .clipped()
                    .allowsHitTesting(!isDrawingActive)
                    .gesture(isDrawingActive ? nil : backgroundVideoPanZoomGesture)
                    .canvasContextMenu(elementId: bgMedia.id, elementType: .image, viewModel: viewModel)
            } else if bgMedia.kind == .video {
                BackgroundVideoPlayerView(
                    url: viewModel.loadedVideoURLs[bgMedia.id],
                    thumbnail: viewModel.loadedImages[bgMedia.id],
                    scale: imageScale * pinchDelta,
                    offsetX: imageOffset.width + dragDelta.width,
                    offsetY: imageOffset.height + dragDelta.height
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .clipped()
                .allowsHitTesting(!isDrawingActive)
                .gesture(isDrawingActive ? nil : backgroundVideoPanZoomGesture)
                .canvasContextMenu(elementId: bgMedia.id, elementType: .video, viewModel: viewModel)
            }
        } else if let image = filteredImage ?? selectedImage {
            // Legacy fallback: selectedImage when no mediaObjects
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .scaleEffect(imageScale * pinchDelta)
                .rotationEffect(imageRotation + rotationDelta)
                .offset(
                    x: imageOffset.width + dragDelta.width,
                    y: imageOffset.height + dragDelta.height
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .clipped()
                .allowsHitTesting(!isDrawingActive)
                .gesture(isDrawingActive ? nil : backgroundImageGesture)
        }
    }

    private var backgroundImageGesture: some Gesture {
        SimultaneousGesture(
            SimultaneousGesture(
                DragGesture(minimumDistance: 0)
                    .updating($dragDelta) { value, state, _ in
                        state = value.translation
                    }
                    .onEnded { value in
                        imageOffset.width += value.translation.width
                        imageOffset.height += value.translation.height
                    },
                MagnificationGesture()
                    .updating($pinchDelta) { value, state, _ in
                        state = value
                    }
                    .onEnded { value in
                        imageScale = max(0.5, imageScale * value)
                    }
            ),
            RotationGesture()
                .updating($rotationDelta) { value, state, _ in
                    state = value
                }
                .onEnded { value in
                    imageRotation += value
                }
        )
    }

    /// Pan + zoom only (no rotation) for background video.
    private var backgroundVideoPanZoomGesture: some Gesture {
        SimultaneousGesture(
            DragGesture(minimumDistance: 0)
                .updating($dragDelta) { value, state, _ in
                    state = value.translation
                }
                .onEnded { value in
                    imageOffset.width += value.translation.width
                    imageOffset.height += value.translation.height
                },
            MagnificationGesture()
                .updating($pinchDelta) { value, state, _ in
                    state = value
                }
                .onEnded { value in
                    imageScale = max(0.5, imageScale * value)
                }
        )
    }

    // MARK: - Drawing Layer

    private var drawingLayer: some View {
        DrawingOverlayView(
            drawingData: $viewModel.drawingData,
            isActive: .constant(viewModel.isDrawingActive),
            canvasView: $drawingCanvas,
            toolColor: $viewModel.drawingColor,
            toolWidth: $viewModel.drawingWidth,
            toolType: $drawingTool
        )
    }

    // MARK: - Front Elements Group

    @ViewBuilder
    private func frontElementsGroup(canvasSize: CGSize) -> some View {
        let dimmed = false
        let interactive = !isDrawingActive

        ZStack {
            textObjectsLayer(interactive: interactive)
            stickerLayer(canvasSize: canvasSize, interactive: interactive)
            foregroundAudioLayer(interactive: interactive)
        }
        .opacity(dimmed ? 0.4 : 1.0)
        .allowsHitTesting(!dimmed)
        .animation(.easeInOut(duration: 0.2), value: dimmed)
    }

    // MARK: - Text Objects Layer

    @ViewBuilder
    private func textObjectsLayer(interactive: Bool) -> some View {
        ForEach(textObjects, id: \.id) { obj in
            if !obj.content.isEmpty, isElementVisible(startTime: obj.startTime, duration: obj.displayDuration) {
                // Locked text objects (e.g. the repost-attribution badge from
                // `StoryComposerViewModel.init(reposting:authorHandle:)`) skip
                // selection glow + context menu in addition to the gestures
                // already disabled inside DraggableTextObjectView itself —
                // otherwise long-pressing the badge would expose a Supprimer
                // action that could strip the attribution.
                let isLocked = obj.isLocked == true
                let baseView = DraggableTextObjectView(
                    textObject: textObjectBinding(for: obj.id),
                    isEditing: interactive && !isLocked,
                    onTapToFront: {
                        viewModel.selectedElementId = obj.id
                        viewModel.bringToFront(id: obj.id)
                        HapticFeedback.light()
                    },
                    onDoubleTap: {
                        viewModel.selectedElementId = obj.id
                        onEditText?(obj.id)
                    },
                    onDragStarted: { pos, size in
                        viewModel.beginDrag(elementId: obj.id, position: pos, size: size)
                    },
                    onDragChanged: { pos in
                        viewModel.updateDrag(position: pos)
                    },
                    onDragCommitted: {
                        viewModel.endDrag()
                    },
                    onDragEnd: {}
                )
                .opacity(elementOpacity(startTime: obj.startTime, duration: obj.displayDuration, fadeIn: obj.fadeIn, fadeOut: obj.fadeOut))

                if isLocked {
                    baseView.zIndex(Double(viewModel.zIndex(for: obj.id)))
                } else {
                    baseView
                        .selectionGlow(viewModel.selectedElementId == obj.id)
                        .canvasContextMenu(
                            elementId: obj.id,
                            elementType: .text,
                            viewModel: viewModel
                        )
                        .zIndex(Double(viewModel.zIndex(for: obj.id)))
                }
            }
        }
    }

    // MARK: - Sticker Layer

    private func stickerLayer(canvasSize: CGSize, interactive: Bool) -> some View {
        ForEach(stickerObjects, id: \.id) { sticker in
            DraggableSticker(
                sticker: sticker,
                canvasSize: canvasSize,
                onUpdate: { updated in
                    if let i = stickerObjects.firstIndex(where: { $0.id == sticker.id }) {
                        stickerObjects[i] = updated
                    }
                },
                onRemove: {
                    stickerObjects.removeAll { $0.id == sticker.id }
                },
                onDragStarted: { pos, size in
                    viewModel.beginDrag(elementId: sticker.id, position: pos, size: size)
                },
                onDragChanged: { pos in
                    viewModel.updateDrag(position: pos)
                },
                onDragCommitted: {
                    viewModel.endDrag()
                }
            )
            .allowsHitTesting(interactive)
            .zIndex(Double(viewModel.zIndex(for: sticker.id)))
        }
    }

    // MARK: - Foreground Media Layer (positioned, draggable tiles)

    @ViewBuilder
    private func foregroundMediaLayer(interactive: Bool) -> some View {
        let backgroundId = viewModel.currentEffects.resolvedBackgroundMedia?.id
        ForEach(mediaObjects.filter { $0.id != backgroundId }, id: \.id) { obj in
            if isElementVisible(startTime: obj.startTime, duration: obj.duration) {
                positionedMediaElement(obj: obj, interactive: interactive)
            }
        }
    }

    @ViewBuilder
    private func positionedMediaElement(obj: StoryMediaObject, interactive: Bool) -> some View {
        DraggableMediaView(
            mediaObject: mediaObjectBinding(for: obj.id),
            image: viewModel.loadedImages[obj.id],
            videoURL: viewModel.loadedVideoURLs[obj.id],
            isEditing: interactive,
            naturalAspectRatio: viewModel.mediaAspectRatios[obj.id],
            onAspectRatioResolved: { ratio in
                viewModel.setAspectRatio(ratio, for: obj.id)
            },
            onDragStarted: { pos, size in
                viewModel.beginDrag(elementId: obj.id, position: pos, size: size)
            },
            onDragChanged: { pos in
                viewModel.updateDrag(position: pos)
            },
            onDragCommitted: {
                viewModel.endDrag()
            },
            onDragEnd: {},
            onTapToFront: {
                viewModel.selectedElementId = obj.id
                viewModel.bringToFront(id: obj.id)
                HapticFeedback.light()
            }
        )
        .opacity(elementOpacity(startTime: obj.startTime, duration: obj.duration, fadeIn: obj.fadeIn, fadeOut: obj.fadeOut))
        .selectionGlow(viewModel.selectedElementId == obj.id)
        .overlay(alignment: .topTrailing) {
            if viewModel.selectedElementId == obj.id {
                Button {
                    onEditMedia?(obj.id)
                } label: {
                    Image(systemName: "pencil")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 28, height: 28)
                        .background(
                            Circle()
                                .fill(MeeshyColors.brandGradient)
                                .shadow(color: .black.opacity(0.3), radius: 3)
                        )
                }
                .offset(x: 6, y: -6)
                .transition(.scale.combined(with: .opacity))
            }
        }
        .canvasContextMenu(
            elementId: obj.id,
            elementType: obj.kind == .video ? .video : .image,
            viewModel: viewModel
        )
        .gesture(
            TapGesture(count: 2).onEnded {
                viewModel.selectedElementId = obj.id
                onEditMedia?(obj.id)
            }
        )
        .zIndex(Double(viewModel.zIndex(for: obj.id)))
    }

    // MARK: - Audio Layer (all audio players rendered on top)

    @ViewBuilder
    private func foregroundAudioLayer(interactive: Bool) -> some View {
        // Filtre : les audios background (isBackground=true OU synthetise legacy)
        // n'ont pas de UI visible sur le canvas — seulement de la lecture en fond.
        let foregroundAudios = viewModel.currentEffects.resolvedForegroundAudioPlayers
        ForEach(foregroundAudios, id: \.id) { obj in
            if isElementVisible(startTime: obj.startTime, duration: obj.duration) {
                StoryAudioPlayerView(
                    audioObject: audioObjectBinding(for: obj.id),
                    url: viewModel.loadedAudioURLs[obj.id],
                    isEditing: interactive,
                    onDragEnd: {}
                )
                .opacity(elementOpacity(startTime: obj.startTime, duration: obj.duration, fadeIn: obj.fadeIn, fadeOut: obj.fadeOut))
                .selectionGlow(viewModel.selectedElementId == obj.id)
                .canvasContextMenu(
                    elementId: obj.id,
                    elementType: .audio,
                    viewModel: viewModel
                )
                .gesture(interactive ? TapGesture().onEnded {
                    viewModel.selectedElementId = obj.id
                    viewModel.bringToFront(id: obj.id)
                } : nil)
                .zIndex(Double(viewModel.zIndex(for: obj.id)))
            }
        }
    }

    // MARK: - Bindings into ViewModel arrays

    private func textObjectBinding(for id: String) -> Binding<StoryTextObject> {
        Binding(
            get: {
                viewModel.currentEffects.textObjects?.first(where: { $0.id == id })
                    ?? StoryTextObject(content: "")
            },
            set: { newValue in
                var effects = viewModel.currentEffects
                guard var texts = effects.textObjects,
                      let idx = texts.firstIndex(where: { $0.id == id }) else { return }
                texts[idx] = newValue
                effects.textObjects = texts
                viewModel.currentEffects = effects
            }
        )
    }

    private func mediaObjectBinding(for id: String) -> Binding<StoryMediaObject> {
        Binding(
            get: {
                viewModel.currentEffects.mediaObjects?.first(where: { $0.id == id })
                    ?? StoryMediaObject()
            },
            set: { newValue in
                var effects = viewModel.currentEffects
                guard var medias = effects.mediaObjects,
                      let idx = medias.firstIndex(where: { $0.id == id }) else { return }
                medias[idx] = newValue
                effects.mediaObjects = medias
                viewModel.currentEffects = effects
            }
        )
    }

    private func audioObjectBinding(for id: String) -> Binding<StoryAudioPlayerObject> {
        Binding(
            get: {
                viewModel.currentEffects.audioPlayerObjects?.first(where: { $0.id == id })
                    ?? StoryAudioPlayerObject()
            },
            set: { newValue in
                var effects = viewModel.currentEffects
                guard var audios = effects.audioPlayerObjects,
                      let idx = audios.firstIndex(where: { $0.id == id }) else { return }
                audios[idx] = newValue
                effects.audioPlayerObjects = audios
                viewModel.currentEffects = effects
            }
        )
    }
}

// MARK: - Draggable Sticker

public struct DraggableSticker: View {
    public let sticker: StorySticker
    public let canvasSize: CGSize
    public var onUpdate: (StorySticker) -> Void
    public var onRemove: () -> Void
    public var onDragStarted: ((_ position: CGPoint, _ size: CGSize) -> Void)?
    public var onDragChanged: ((CGPoint) -> Void)?
    public var onDragCommitted: (() -> Void)?

    @State private var currentScale: CGFloat = 1
    @State private var currentRotation: Angle = .zero
    @State private var showDeleteButton = false
    @State private var dragInitialized: Bool = false

    public init(sticker: StorySticker, canvasSize: CGSize,
                onUpdate: @escaping (StorySticker) -> Void,
                onRemove: @escaping () -> Void,
                onDragStarted: ((CGPoint, CGSize) -> Void)? = nil,
                onDragChanged: ((CGPoint) -> Void)? = nil,
                onDragCommitted: (() -> Void)? = nil) {
        self.sticker = sticker; self.canvasSize = canvasSize
        self.onUpdate = onUpdate; self.onRemove = onRemove
        self.onDragStarted = onDragStarted
        self.onDragChanged = onDragChanged
        self.onDragCommitted = onDragCommitted
    }

    public var body: some View {
        ZStack(alignment: .topTrailing) {
            Text(sticker.emoji)
                .font(.system(size: 50 * sticker.scale * currentScale))
                .rotationEffect(Angle(degrees: sticker.rotation) + currentRotation)

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
            }
        }
        .position(
            x: sticker.x * canvasSize.width,
            y: sticker.y * canvasSize.height
        )
        .gesture(combinedGesture)
        .onTapGesture(count: 2) {
            withAnimation(.spring(response: 0.2)) { showDeleteButton.toggle() }
        }
    }

    /// Emoji bbox is roughly font-size × font-size (em-square). Normalize against the
    /// canvas dimensions so the parent can run safe-zone checks in 0–1 space.
    private var normalizedSize: CGSize {
        guard canvasSize.width > 0, canvasSize.height > 0 else { return .zero }
        let side = 50 * sticker.scale * currentScale
        return CGSize(width: side / canvasSize.width, height: side / canvasSize.height)
    }

    private var dragGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                let newX = max(0.05, min(0.95, value.location.x / canvasSize.width))
                let newY = max(0.05, min(0.95, value.location.y / canvasSize.height))
                var updated = sticker
                updated.x = newX; updated.y = newY
                onUpdate(updated)

                let pos = CGPoint(x: newX, y: newY)
                if !dragInitialized {
                    dragInitialized = true
                    onDragStarted?(pos, normalizedSize)
                }
                onDragChanged?(pos)
            }
            .onEnded { _ in
                dragInitialized = false
                onDragCommitted?()
            }
    }

    private var magnificationGesture: some Gesture {
        MagnificationGesture()
            .onChanged { scale in
                currentScale = scale
            }
            .onEnded { scale in
                var updated = sticker
                updated.scale = max(0.3, min(3.0, sticker.scale * scale))
                onUpdate(updated)
                currentScale = 1
            }
    }

    private var rotationGesture: some Gesture {
        RotationGesture()
            .onChanged { angle in
                currentRotation = angle
            }
            .onEnded { angle in
                var updated = sticker
                updated.rotation = sticker.rotation + angle.degrees
                onUpdate(updated)
                currentRotation = .zero
            }
    }

    private var combinedGesture: some Gesture {
        dragGesture
            .simultaneously(with: magnificationGesture)
            .simultaneously(with: rotationGesture)
    }
}

// MARK: - Background Video Player (fullscreen, looping, with play/pause)

/// Renders a video filling the entire canvas as background (resizeAspectFill).
/// Uses a UIView-backed AVPlayerLayer for guaranteed rendering.
/// Accepts scale/offset transforms applied directly on the layer (GPU, no re-render).
struct BackgroundVideoPlayerView: UIViewRepresentable {
    let url: URL?
    let thumbnail: UIImage?
    var scale: CGFloat = 1.0
    var offsetX: CGFloat = 0
    var offsetY: CGFloat = 0

    func makeUIView(context: Context) -> BackgroundVideoUIView {
        let view = BackgroundVideoUIView()
        view.backgroundColor = .clear
        if let thumbnail {
            view.setThumbnail(thumbnail)
        }
        if let url {
            view.loadAndPlay(url: url)
        }
        view.applyTransform(scale: scale, offsetX: offsetX, offsetY: offsetY)
        return view
    }

    func updateUIView(_ uiView: BackgroundVideoUIView, context: Context) {
        if let url, uiView.currentURL != url {
            uiView.loadAndPlay(url: url)
        }
        if let thumbnail, uiView.thumbnailView.image == nil {
            uiView.setThumbnail(thumbnail)
        }
        // Apply transforms on the layer directly — GPU-composited, no SwiftUI re-render
        uiView.applyTransform(scale: scale, offsetX: offsetX, offsetY: offsetY)
    }

    static func dismantleUIView(_ uiView: BackgroundVideoUIView, coordinator: ()) {
        uiView.teardown()
    }
}

/// UIKit view with AVPlayerLayer sublayer — handles layout, looping, and tap-to-pause.
final class BackgroundVideoUIView: UIView {
    private(set) var currentURL: URL?
    let thumbnailView = UIImageView()
    private let playerLayer = AVPlayerLayer()
    private var player: AVQueuePlayer?
    private var looper: AVPlayerLooper?
    private var statusObserver: NSKeyValueObservation?
    private var isPlaying = false

    private let playIcon: UIImageView = {
        let config = UIImage.SymbolConfiguration(pointSize: 48, weight: .medium)
        let img = UIImage(systemName: "play.circle.fill", withConfiguration: config)
        let iv = UIImageView(image: img)
        iv.tintColor = UIColor.white.withAlphaComponent(0.85)
        iv.layer.shadowColor = UIColor.black.cgColor
        iv.layer.shadowOpacity = 0.5
        iv.layer.shadowOffset = CGSize(width: 0, height: 2)
        iv.layer.shadowRadius = 8
        iv.isHidden = true
        return iv
    }()

    override init(frame: CGRect) {
        super.init(frame: frame)
        clipsToBounds = true

        thumbnailView.contentMode = .scaleAspectFill
        thumbnailView.clipsToBounds = true
        addSubview(thumbnailView)

        playerLayer.videoGravity = .resizeAspectFill
        layer.addSublayer(playerLayer)

        addSubview(playIcon)

        let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap))
        addGestureRecognizer(tap)

        NotificationCenter.default.addObserver(self, selector: #selector(muteCanvas), name: .storyComposerMuteCanvas, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(unmuteCanvas), name: .storyComposerUnmuteCanvas, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(timelinePlay), name: .timelineDidStartPlaying, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(timelineStop), name: .timelineDidStopPlaying, object: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func layoutSubviews() {
        super.layoutSubviews()
        thumbnailView.frame = bounds
        playerLayer.frame = bounds
        playIcon.sizeToFit()
        playIcon.center = CGPoint(x: bounds.midX, y: bounds.midY)
    }

    func setThumbnail(_ image: UIImage) {
        thumbnailView.image = image
    }

    /// Apply scale + offset via CATransform3D — GPU-composited, no layout pass.
    func applyTransform(scale: CGFloat, offsetX: CGFloat, offsetY: CGFloat) {
        var t = CATransform3DIdentity
        t = CATransform3DScale(t, scale, scale, 1)
        t = CATransform3DTranslate(t, offsetX / scale, offsetY / scale, 0)
        layer.sublayerTransform = t
        thumbnailView.transform = CGAffineTransform(scaleX: scale, y: scale)
            .translatedBy(x: offsetX / scale, y: offsetY / scale)
    }

    func loadAndPlay(url: URL) {
        teardown()
        currentURL = url

        // Activate audio session for playback
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)

        let item = AVPlayerItem(url: url)
        item.preferredForwardBufferDuration = 2.0
        let queuePlayer = AVQueuePlayer(playerItem: item)
        queuePlayer.isMuted = false
        player = queuePlayer
        playerLayer.player = queuePlayer

        if let currentItem = queuePlayer.currentItem {
            looper = AVPlayerLooper(player: queuePlayer, templateItem: currentItem)
        }

        statusObserver = item.observe(\.status, options: [.new]) { [weak self] item, _ in
            guard item.status == .readyToPlay else { return }
            DispatchQueue.main.async {
                self?.statusObserver = nil
                self?.player?.play()
                self?.isPlaying = true
                self?.thumbnailView.isHidden = true
                self?.playIcon.isHidden = true
            }
        }

        if item.status == .readyToPlay {
            statusObserver = nil
            queuePlayer.play()
            isPlaying = true
            thumbnailView.isHidden = true
        }
    }

    func teardown() {
        statusObserver?.invalidate()
        statusObserver = nil
        player?.pause()
        looper?.disableLooping()
        looper = nil
        playerLayer.player = nil
        player = nil
        currentURL = nil
        isPlaying = false
        thumbnailView.isHidden = false
        playIcon.isHidden = true
    }

    @objc private func handleTap() {
        guard player != nil else { return }
        if isPlaying {
            player?.pause()
            isPlaying = false
            playIcon.isHidden = false
        } else {
            player?.play()
            isPlaying = true
            playIcon.isHidden = true
        }
    }

    @objc private func muteCanvas() { player?.isMuted = true }
    @objc private func unmuteCanvas() { player?.isMuted = false }
    @objc private func timelinePlay() {
        player?.seek(to: .zero)
        player?.play()
        isPlaying = true
        playIcon.isHidden = true
    }
    @objc private func timelineStop() {
        player?.pause()
        isPlaying = false
        playIcon.isHidden = false
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        teardown()
    }
}
