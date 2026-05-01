import SwiftUI
import AVKit
import MeeshySDK

public struct DraggableMediaView: View {
    @Binding public var mediaObject: StoryMediaObject
    public let image: UIImage?
    public let videoURL: URL?
    public let externalPlayer: AVPlayer?
    public let isEditing: Bool
    public let onDragEnd: () -> Void
    public let onTapToFront: (() -> Void)?
    public let onTogglePlay: ((String) -> Void)?

    /// Aspect ratio (width/height) of the source media. When `nil`, the view derives it
    /// from `image.size` (sync) or the AVAsset's natural size (async). The default avoids
    /// forcing every call site to plumb a ratio through.
    public var naturalAspectRatio: CGFloat?

    /// Reports a resolved video aspect ratio back to the parent so it can cache the value
    /// across re-renders. Image ratios are read directly from `UIImage.size` and don't
    /// need this callback.
    public var onAspectRatioResolved: ((CGFloat) -> Void)?

    /// Live drag tracking. `onDragStarted` carries the bbox once; `onDragChanged` only
    /// carries position (size is constant during a drag). `onDragCommitted` fires after
    /// the binding is updated.
    public var onDragChanged: ((CGPoint) -> Void)?
    public var onDragStarted: ((_ position: CGPoint, _ size: CGSize) -> Void)?
    public var onDragCommitted: (() -> Void)?

    @State private var internalPlayer: AVQueuePlayer?
    @State private var playerLooper: AVPlayerLooper?
    @State private var isPlaying: Bool = false
    @State private var dragInitialized: Bool = false
    /// In-flight aspect-ratio resolution task. Held so we can `cancel()` on URL
    /// change or view disappear and avoid landing a stale ratio.
    @State private var aspectRatioTask: Task<Void, Never>?

    @State private var baseX: CGFloat?
    @State private var baseY: CGFloat?
    @State private var baseScale: CGFloat?
    @State private var baseRotation: CGFloat?

    @GestureState private var dragOffset: CGSize = .zero
    @GestureState private var gestureScale: CGFloat = 1.0
    @GestureState private var gestureRotation: Angle = .zero

    public init(mediaObject: Binding<StoryMediaObject>,
                image: UIImage? = nil,
                videoURL: URL? = nil,
                externalPlayer: AVPlayer? = nil,
                isEditing: Bool = false,
                naturalAspectRatio: CGFloat? = nil,
                onAspectRatioResolved: ((CGFloat) -> Void)? = nil,
                onDragStarted: ((CGPoint, CGSize) -> Void)? = nil,
                onDragChanged: ((CGPoint) -> Void)? = nil,
                onDragCommitted: (() -> Void)? = nil,
                onDragEnd: @escaping () -> Void = {},
                onTapToFront: (() -> Void)? = nil,
                onTogglePlay: ((String) -> Void)? = nil) {
        self._mediaObject = mediaObject
        self.image = image
        self.videoURL = videoURL
        self.externalPlayer = externalPlayer
        self.isEditing = isEditing
        self.naturalAspectRatio = naturalAspectRatio
        self.onAspectRatioResolved = onAspectRatioResolved
        self.onDragStarted = onDragStarted
        self.onDragChanged = onDragChanged
        self.onDragCommitted = onDragCommitted
        self.onDragEnd = onDragEnd
        self.onTapToFront = onTapToFront
        self.onTogglePlay = onTogglePlay
    }

    private var activePlayer: AVPlayer? {
        externalPlayer ?? internalPlayer
    }

    private var isVideoElement: Bool {
        mediaObject.kind == .video
    }

    private var currentX: CGFloat { baseX ?? mediaObject.x }
    private var currentY: CGFloat { baseY ?? mediaObject.y }
    private var currentScale: CGFloat { baseScale ?? mediaObject.scale }
    private var currentRotation: CGFloat { baseRotation ?? mediaObject.rotation }

    /// Resolved aspect ratio used for sizing. Falls back to `image.size` when the parent
    /// hasn't supplied a value (free for images), then to 1.0 (square) as last resort.
    private var resolvedAspectRatio: CGFloat {
        if let supplied = naturalAspectRatio, supplied.isFinite, supplied > 0 {
            return supplied
        }
        if let image, image.size.height > 0 {
            return image.size.width / image.size.height
        }
        return 1.0
    }

    public var body: some View {
        GeometryReader { geo in
            mediaContentWithGestures(canvasWidth: geo.size.width, canvasHeight: geo.size.height)
                .onAppear {
                    syncBaseFromBinding()
                    if externalPlayer == nil, let url = videoURL {
                        setupInternalPlayer(url: url)
                    } else if externalPlayer != nil {
                        isPlaying = externalPlayer?.rate ?? 0 > 0
                    }
                    resolveVideoAspectRatioIfNeeded()
                }
                .onChange(of: videoURL) { _, newURL in
                    if externalPlayer == nil, let url = newURL {
                        teardownInternalPlayer()
                        setupInternalPlayer(url: url)
                    }
                    resolveVideoAspectRatioIfNeeded()
                }
                .onChange(of: mediaObject.id) { _, _ in
                    syncBaseFromBinding()
                }
                .onChange(of: mediaObject.x) { _, _ in syncBaseFromBinding() }
                .onChange(of: mediaObject.y) { _, _ in syncBaseFromBinding() }
                .onChange(of: mediaObject.scale) { _, _ in syncBaseFromBinding() }
                .onChange(of: mediaObject.rotation) { _, _ in syncBaseFromBinding() }
                .onDisappear {
                    if externalPlayer == nil {
                        teardownInternalPlayer()
                    }
                    aspectRatioTask?.cancel()
                    aspectRatioTask = nil
                }
                .onReceive(NotificationCenter.default.publisher(for: .storyComposerMuteCanvas)) { _ in
                    internalPlayer?.isMuted = true
                }
                .onReceive(NotificationCenter.default.publisher(for: .storyComposerUnmuteCanvas)) { _ in
                    internalPlayer?.isMuted = false
                }
                .onReceive(NotificationCenter.default.publisher(for: .timelineDidStartPlaying)) { _ in
                    if let player = internalPlayer, !isPlaying {
                        player.seek(to: .zero)
                        player.play()
                        isPlaying = true
                    }
                }
                .onReceive(NotificationCenter.default.publisher(for: .timelineDidStopPlaying)) { _ in
                    internalPlayer?.pause()
                    isPlaying = false
                }
        }
    }

    // MARK: - Sync base state from binding

    private func syncBaseFromBinding() {
        baseX = mediaObject.x
        baseY = mediaObject.y
        baseScale = mediaObject.scale
        baseRotation = mediaObject.rotation
    }

    // MARK: - Aspect-aware sizing

    /// Computes the media's frame at scale=1, fitting the longest source axis to ~65%
    /// of the canvas's shorter dimension. Cross-viewport behavior follows from the canvas
    /// itself being 9:16 of any viewport — `min(canvasWidth, canvasHeight)` is always the
    /// canvas width on a phone, iPad, or web, so the rendered proportions match.
    private func baseMediaSize(canvasWidth: CGFloat, canvasHeight: CGFloat) -> CGSize {
        let shortDim = min(canvasWidth, canvasHeight)
        let ratio = max(0.1, min(10, resolvedAspectRatio))
        let target = shortDim * 0.65

        if abs(ratio - 1.0) < 0.05 {
            let side = shortDim * 0.5
            return CGSize(width: side, height: side)
        }
        if ratio < 1.0 {
            return CGSize(width: target * ratio, height: target)
        }
        return CGSize(width: target, height: target / ratio)
    }

    @ViewBuilder
    private func mediaContentWithGestures(canvasWidth: CGFloat, canvasHeight: CGFloat) -> some View {
        let effectiveScale = isEditing ? currentScale * gestureScale : currentScale
        let effectiveRotation = isEditing ? currentRotation + gestureRotation.degrees : currentRotation
        let baseSize = baseMediaSize(canvasWidth: canvasWidth, canvasHeight: canvasHeight)
        let scaledWidth = baseSize.width * effectiveScale
        let scaledHeight = baseSize.height * effectiveScale
        let normWidth = scaledWidth / max(1, canvasWidth)
        let normHeight = scaledHeight / max(1, canvasHeight)

        if isEditing {
            mediaContent(showsVideoControls: activePlayer != nil && isVideoElement)
                .frame(width: baseSize.width, height: baseSize.height)
                .scaleEffect(effectiveScale)
                .rotationEffect(.degrees(effectiveRotation))
                .frame(width: scaledWidth, height: scaledHeight)
                .contentShape(Rectangle())
                .position(
                    x: currentX * canvasWidth + dragOffset.width,
                    y: currentY * canvasHeight + dragOffset.height
                )
                .highPriorityGesture(TapGesture().onEnded { _ in onTapToFront?() })
                // Combined primary gesture — claims touch exclusively, preventing
                // parent canvas gestures from firing when touching this element.
                .gesture(
                    dragGesture(canvasWidth: canvasWidth, canvasHeight: canvasHeight,
                                normSize: CGSize(width: normWidth, height: normHeight))
                        .simultaneously(with: pinchGesture)
                        .simultaneously(with: rotateGesture)
                )
        } else {
            mediaContent(showsVideoControls: false)
                .frame(width: baseSize.width, height: baseSize.height)
                .scaleEffect(currentScale)
                .rotationEffect(.degrees(currentRotation))
                .frame(width: scaledWidth, height: scaledHeight)
                .contentShape(Rectangle())
                .position(
                    x: currentX * canvasWidth,
                    y: currentY * canvasHeight
                )
                .simultaneousGesture(TapGesture().onEnded { _ in onTapToFront?() })
        }
    }

    // MARK: - Gestures

    private func dragGesture(canvasWidth: CGFloat, canvasHeight: CGFloat,
                             normSize: CGSize) -> some Gesture {
        DragGesture()
            .updating($dragOffset) { value, state, _ in
                state = value.translation
            }
            .onChanged { value in
                let nx = min(1, max(0, currentX + value.translation.width / canvasWidth))
                let ny = min(1, max(0, currentY + value.translation.height / canvasHeight))
                let pos = CGPoint(x: nx, y: ny)
                if !dragInitialized {
                    dragInitialized = true
                    onDragStarted?(pos, normSize)
                }
                onDragChanged?(pos)
            }
            .onEnded { value in
                let rawX = min(1, max(0, currentX + value.translation.width / canvasWidth))
                let rawY = min(1, max(0, currentY + value.translation.height / canvasHeight))
                let snapped = StoryAlignmentSnap.apply(to: CGPoint(x: rawX, y: rawY))
                baseX = snapped.x
                baseY = snapped.y
                mediaObject.x = snapped.x
                mediaObject.y = snapped.y
                dragInitialized = false
                onDragCommitted?()
                onDragEnd()
            }
    }

    private var pinchGesture: some Gesture {
        MagnificationGesture()
            .updating($gestureScale) { value, state, _ in
                state = value
            }
            .onEnded { value in
                let newScale = min(4.0, max(0.3, currentScale * value))
                baseScale = newScale
                mediaObject.scale = newScale
                onDragEnd()
            }
    }

    private var rotateGesture: some Gesture {
        RotationGesture()
            .updating($gestureRotation) { value, state, _ in
                state = value
            }
            .onEnded { value in
                let newRotation = currentRotation + value.degrees
                baseRotation = newRotation
                mediaObject.rotation = newRotation
                onDragEnd()
            }
    }

    // MARK: - Media content

    @ViewBuilder
    private func mediaContent(showsVideoControls: Bool) -> some View {
        ZStack {
            if let player = activePlayer {
                _InlineVideoLayer(player: player)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                if showsVideoControls {
                    videoPlayPauseOverlay
                        .highPriorityGesture(TapGesture().onEnded { _ in togglePlayback() })
                }
            } else if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
    }

    private var videoPlayPauseOverlay: some View {
        VStack {
            Spacer()
            HStack {
                Button(action: togglePlayback) {
                    Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(width: 28, height: 28)
                        .background(Color.black.opacity(0.5))
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
                .contentShape(Circle())
                .accessibilityLabel(isPlaying ? "Pause" : "Play")
                Spacer()
            }
            .padding(6)
        }
    }

    private func togglePlayback() {
        guard let player = activePlayer else { return }
        if isPlaying {
            player.pause()
            isPlaying = false
        } else {
            StoryMediaCoordinator.shared.activate {
                NotificationCenter.default.post(name: .storyComposerMuteCanvas, object: nil)
            }
            player.play()
            isPlaying = true
        }
        onTogglePlay?(mediaObject.id)
    }

    // MARK: - Internal player (composer mode)

    private func setupInternalPlayer(url: URL) {
        teardownInternalPlayer()
        let cachedPlayer = StoryMediaLoader.shared.cachedPlayer(for: url)
        let queuePlayer: AVQueuePlayer
        if let cached = cachedPlayer as? AVQueuePlayer {
            queuePlayer = cached
        } else {
            let item = AVPlayerItem(url: url)
            item.preferredForwardBufferDuration = 2.0
            queuePlayer = AVQueuePlayer(playerItem: item)
        }
        queuePlayer.isMuted = false
        internalPlayer = queuePlayer

        if let currentItem = queuePlayer.currentItem {
            playerLooper = AVPlayerLooper(player: queuePlayer, templateItem: currentItem)
        }

        if isEditing {
            queuePlayer.pause()
            isPlaying = false
        } else {
            queuePlayer.play()
            isPlaying = true
        }
    }

    private func teardownInternalPlayer() {
        internalPlayer?.pause()
        playerLooper?.disableLooping()
        playerLooper = nil
        internalPlayer = nil
        isPlaying = false
    }

    // MARK: - Video aspect-ratio resolution (async, off-main)

    private func resolveVideoAspectRatioIfNeeded() {
        guard isVideoElement,
              naturalAspectRatio == nil,
              let url = videoURL,
              let resolveCallback = onAspectRatioResolved
        else { return }

        // Cancel any in-flight resolution for a previous URL — without this, rapid
        // video swaps (composer flipping between clips) could land last-completed
        // ratio AFTER the latest URL took effect, painting the wrong proportions.
        aspectRatioTask?.cancel()
        aspectRatioTask = Task {
            do {
                guard let size = try await AVURLAsset.naturalDisplaySize(of: url),
                      size.width > 0, size.height > 0 else { return }
                try Task.checkCancellation()
                let ratio = size.width / size.height
                resolveCallback(ratio)
            } catch is CancellationError {
                // Expected when a fresher URL arrived; drop quietly.
            } catch {
                // Silent failure — the media keeps its 1:1 fallback ratio.
            }
        }
    }
}

// MARK: - Inline AVPlayerLayer (GPU-composited, replaces SwiftUI VideoPlayer)

private struct _InlineVideoLayer: UIViewRepresentable {
    let player: AVPlayer

    func makeUIView(context: Context) -> _InlinePlayerView {
        let view = _InlinePlayerView()
        view.playerLayer.player = player
        view.playerLayer.videoGravity = .resizeAspect
        return view
    }

    func updateUIView(_ uiView: _InlinePlayerView, context: Context) {
        uiView.playerLayer.player = player
    }
}

private class _InlinePlayerView: UIView {
    override class var layerClass: AnyClass { AVPlayerLayer.self }
    var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
}
