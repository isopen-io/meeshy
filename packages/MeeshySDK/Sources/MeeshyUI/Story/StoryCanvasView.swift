import SwiftUI
import PencilKit
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

    // Background image manipulation (local UX state)
    @State private var imageScale: CGFloat = 1.0
    @State private var imageOffset: CGSize = .zero
    @GestureState private var dragDelta: CGSize = .zero
    @GestureState private var pinchDelta: CGFloat = 1.0
    @GestureState private var rotationDelta: Angle = .zero
    @State private var imageRotation: Angle = .zero
    @State private var filteredImage: UIImage?

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

    private var isFondToolActive: Bool { viewModel.isFondToolActive }
    private var isFrontToolActive: Bool { viewModel.isFrontToolActive }
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
            ZStack {
                // Layer 0: Background color / gradient
                backgroundLayer

                // Layer 1: Background image/video (gesture-manipulable)
                backgroundMediaLayer

                // Layer 2: Drawing overlay (PKCanvasView — UIKit via UIViewRepresentable)
                drawingLayer

                // Layers 3-N: Front elements (text, stickers, media, audio)
                // Explicit zIndex ensures SwiftUI front content renders above
                // UIKit-backed drawing layer (UIViewRepresentable can break ZStack order).
                frontElementsGroup(canvasSize: geo.size)
                    .zIndex(1)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .overlay(
                RoundedRectangle(cornerRadius: 2)
                    .strokeBorder(
                        style: StrokeStyle(lineWidth: 1, dash: [6, 4])
                    )
                    .foregroundStyle(MeeshyColors.indigo400.opacity(viewModel.isCanvasZoomed ? 0.6 : 0))
                    .allowsHitTesting(false)
                    .animation(.easeInOut(duration: 0.3), value: viewModel.isCanvasZoomed)
            )
            .contentShape(Rectangle())
            .onTapGesture {
                handleEmptyCanvasTap()
            }
            .onAppear { viewModel.canvasSize = geo.size }
            .onChange(of: geo.size) { _, newSize in viewModel.canvasSize = newSize }
        }
        .onAppear {
            updateFilteredImage()
        }
        .onChange(of: selectedImage) { _, _ in
            withAnimation(.spring(response: 0.3)) {
                imageScale = 1.0
                imageOffset = .zero
                imageRotation = .zero
            }
            updateFilteredImage()
        }
        .onChange(of: selectedFilter) { _, _ in
            updateFilteredImage()
        }
    }

    private func updateFilteredImage() {
        filteredImage = selectedImage.map { StoryFilterProcessor.apply(selectedFilter, to: $0) }
    }

    // MARK: - Empty Canvas Tap

    private func handleEmptyCanvasTap() {
        guard !isDrawingActive else { return }
        viewModel.deselectAll()
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

    // MARK: - Background Media Layer (pinch + drag + rotate)

    @ViewBuilder
    private var backgroundMediaLayer: some View {
        if let image = filteredImage ?? selectedImage {
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
                .allowsHitTesting(!isDrawingActive && !isFrontToolActive)
                .gesture(isDrawingActive || isFrontToolActive ? nil : backgroundImageGesture)
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
        let dimmed = isFondToolActive
        let interactive = !isFondToolActive && !isDrawingActive

        ZStack {
            textObjectsLayer(interactive: interactive)
            stickerLayer(canvasSize: canvasSize, interactive: interactive)
            foregroundMediaLayer(interactive: interactive)
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
                DraggableTextObjectView(
                    textObject: textObjectBinding(for: obj.id),
                    isEditing: interactive,
                    onTapToFront: {
                        viewModel.selectedElementId = obj.id
                        viewModel.bringToFront(id: obj.id)
                        HapticFeedback.light()
                    },
                    onDoubleTap: {
                        viewModel.selectedElementId = obj.id
                        onEditText?(obj.id)
                    },
                    onDragEnd: {}
                )
                .opacity(elementOpacity(startTime: obj.startTime, duration: obj.displayDuration, fadeIn: obj.fadeIn, fadeOut: obj.fadeOut))
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
                }
            )
            .allowsHitTesting(interactive)
        }
    }

    // MARK: - Foreground Media Layer

    @ViewBuilder
    private func foregroundMediaLayer(interactive: Bool) -> some View {
        ForEach(mediaObjects.filter({ $0.placement == "foreground" }), id: \.id) { obj in
            if isElementVisible(startTime: obj.startTime, duration: obj.duration) {
                DraggableMediaView(
                    mediaObject: mediaObjectBinding(for: obj.id),
                    image: viewModel.loadedImages[obj.id],
                    videoURL: viewModel.loadedVideoURLs[obj.id],
                    isEditing: interactive,
                    onDragEnd: {},
                    onTapToFront: {
                        viewModel.selectedElementId = obj.id
                        viewModel.bringToFront(id: obj.id)
                        HapticFeedback.light()
                    }
                )
                .opacity(elementOpacity(startTime: obj.startTime, duration: obj.duration, fadeIn: obj.fadeIn, fadeOut: obj.fadeOut))
                .overlay(alignment: .bottomLeading) {
                    if obj.mediaType == "video" {
                        videoPlayBadge
                    }
                }
                .selectionGlow(viewModel.selectedElementId == obj.id)
                .canvasContextMenu(
                    elementId: obj.id,
                    elementType: obj.mediaType == "video" ? .video : .image,
                    viewModel: viewModel
                )
                .highPriorityGesture(
                    TapGesture(count: 2).onEnded {
                        viewModel.selectedElementId = obj.id
                        onEditMedia?(obj.id)
                    }
                )
                .zIndex(Double(viewModel.zIndex(for: obj.id)))
            }
        }
    }

    // MARK: - Foreground Audio Layer

    @ViewBuilder
    private func foregroundAudioLayer(interactive: Bool) -> some View {
        ForEach(audioPlayerObjects.filter({ $0.placement == "foreground" }), id: \.id) { obj in
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
                .simultaneousGesture(TapGesture().onEnded {
                    viewModel.selectedElementId = obj.id
                    viewModel.bringToFront(id: obj.id)
                })
                .zIndex(Double(viewModel.zIndex(for: obj.id)))
            }
        }
    }

    // MARK: - Video Play Badge

    private var videoPlayBadge: some View {
        Image(systemName: "play.fill")
            .font(.system(size: 10, weight: .bold))
            .foregroundColor(.white)
            .padding(6)
            .background(Circle().fill(Color.black.opacity(0.5)))
            .padding(8)
            .allowsHitTesting(false)
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

// MARK: - Legacy Binding Bridge

/// Backward-compatible initializer for StoryComposerView (pre-ViewModel migration).
/// Creates a thin bridge ViewModel that reads/writes through the provided bindings.
extension StoryCanvasView {
    @MainActor
    init(
        textObjects: Binding<[StoryTextObject]>,
        onSelectText: ((String) -> Void)?,
        onEditText: ((String) -> Void)?,
        stickerObjects: Binding<[StorySticker]>,
        selectedFilter: Binding<StoryFilter?>,
        drawingData: Binding<Data?>,
        isDrawingActive: Binding<Bool>,
        backgroundColor: Binding<Color>,
        selectedImage: Binding<UIImage?>,
        drawingCanvas: Binding<PKCanvasView>,
        drawingColor: Binding<Color>,
        drawingWidth: Binding<CGFloat>,
        drawingTool: Binding<DrawingTool>,
        mediaObjects: Binding<[StoryMediaObject]> = .constant([]),
        audioPlayerObjects: Binding<[StoryAudioPlayerObject]> = .constant([]),
        loadedImages: Binding<[String: UIImage]> = .constant([:]),
        loadedVideoURLs: Binding<[String: URL]> = .constant([:]),
        loadedAudioURLs: Binding<[String: URL]> = .constant([:]),
        onSelectMedia: ((String) -> Void)? = nil,
        onBackgroundTap: (() -> Void)? = nil
    ) {
        let vm = StoryComposerViewModel()
        // Seed the ViewModel with initial values from the bindings
        var effects = vm.currentEffects
        effects.textObjects = textObjects.wrappedValue
        effects.mediaObjects = mediaObjects.wrappedValue
        effects.audioPlayerObjects = audioPlayerObjects.wrappedValue
        vm.currentEffects = effects
        vm.drawingData = drawingData.wrappedValue
        vm.drawingColor = drawingColor.wrappedValue
        vm.drawingWidth = drawingWidth.wrappedValue
        vm.loadedImages = loadedImages.wrappedValue
        vm.loadedVideoURLs = loadedVideoURLs.wrappedValue
        vm.loadedAudioURLs = loadedAudioURLs.wrappedValue
        if isDrawingActive.wrappedValue {
            vm.activeTool = .drawing
        }

        // Convert Color binding to hex string for the ViewModel
        let uiColor = UIColor(backgroundColor.wrappedValue)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        uiColor.getRed(&r, green: &g, blue: &b, alpha: &a)
        vm.backgroundColor = String(format: "#%02X%02X%02X", Int(r * 255), Int(g * 255), Int(b * 255))

        self.viewModel = vm
        self._drawingCanvas = drawingCanvas
        self._drawingTool = drawingTool
        self._selectedFilter = selectedFilter
        self._selectedImage = selectedImage
        self._stickerObjects = stickerObjects
        self.onEditText = onEditText
        self.onEditMedia = nil
    }
}

// MARK: - Draggable Sticker

public struct DraggableSticker: View {
    public let sticker: StorySticker
    public let canvasSize: CGSize
    public var onUpdate: (StorySticker) -> Void
    public var onRemove: () -> Void

    @State private var currentScale: CGFloat = 1
    @State private var currentRotation: Angle = .zero
    @State private var showDeleteButton = false

    public init(sticker: StorySticker, canvasSize: CGSize,
                onUpdate: @escaping (StorySticker) -> Void,
                onRemove: @escaping () -> Void) {
        self.sticker = sticker; self.canvasSize = canvasSize
        self.onUpdate = onUpdate; self.onRemove = onRemove
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

    private var dragGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                let newX = max(0.05, min(0.95, value.location.x / canvasSize.width))
                let newY = max(0.05, min(0.95, value.location.y / canvasSize.height))
                var updated = sticker
                updated.x = newX; updated.y = newY
                onUpdate(updated)
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
