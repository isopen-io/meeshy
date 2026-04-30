import SwiftUI
import AVKit
import MeeshySDK

public struct DraggableMediaView: View {
    @Binding public var mediaObject: StoryMediaObject
    public let image: UIImage?
    public let videoURL: URL?
    /// Player fourni externellement (mode lecteur/Reader) — si nil, créé en interne avec autoplay loop.
    public let externalPlayer: AVPlayer?
    public let isEditing: Bool
    public let onDragEnd: () -> Void
    /// Appelé quand l'utilisateur tape ce média — le parent doit le ramener au premier plan (z-index).
    public let onTapToFront: (() -> Void)?
    /// Appelé quand l'utilisateur toggle play/pause — passe l'ID de l'élément média.
    public let onTogglePlay: ((String) -> Void)?

    /// Actual canvas width in points — used to compute proportional media base size.
    /// Defaults to 393pt (iPhone 14 Pro reference width).
    public var canvasWidth: CGFloat = 393

    /// Actual canvas height in points — used to size media along its longest axis.
    /// Defaults to 698pt (canvasWidth * 16/9, matches StoryCanvasReaderView.canvasSize).
    public var canvasHeightHint: CGFloat = 698

    /// Aspect ratio (width/height) of the source media. Defaults to `1.0` (square) when
    /// unknown (e.g., video before the asset is loaded). Once known, the media renders in
    /// its natural proportions and `scale` becomes a uniform multiplier.
    public var naturalAspectRatio: CGFloat = 1.0

    /// Callback fired when the natural aspect ratio is detected from a video asset (async).
    /// The composer caches this in the ViewModel so the next render uses the correct ratio.
    public var onAspectRatioResolved: ((CGFloat) -> Void)?

    /// Live drag tracking — fired when the user starts/moves/ends a drag. Used by the
    /// parent canvas to render alignment guides + visibility warnings while dragging.
    public var onDragChanged: ((_ position: CGPoint, _ size: CGSize) -> Void)?
    public var onDragStarted: ((_ position: CGPoint, _ size: CGSize) -> Void)?
    public var onDragCommitted: (() -> Void)?

    @State private var internalPlayer: AVQueuePlayer?
    @State private var playerLooper: AVPlayerLooper?
    @State private var isPlaying: Bool = false
    @State private var dragInitialized: Bool = false

    // Local state snapshots: read from binding once, then only update on gesture end.
    // This prevents parent re-renders from resetting the visual position mid-gesture.
    @State private var baseX: CGFloat?
    @State private var baseY: CGFloat?
    @State private var baseScale: CGFloat?
    @State private var baseRotation: CGFloat?

    // Gesture-transient visual offsets — never written to binding, reset automatically on gesture end.
    @GestureState private var dragOffset: CGSize = .zero
    @GestureState private var gestureScale: CGFloat = 1.0
    @GestureState private var gestureRotation: Angle = .zero

    // Canvas size captured from GeometryReader, stored to avoid re-reading mid-gesture.
    @State private var canvasSize: CGSize = .zero

    public init(mediaObject: Binding<StoryMediaObject>,
                image: UIImage? = nil,
                videoURL: URL? = nil,
                externalPlayer: AVPlayer? = nil,
                isEditing: Bool = false,
                canvasWidth: CGFloat = 393,
                canvasHeightHint: CGFloat = 698,
                naturalAspectRatio: CGFloat = 1.0,
                onAspectRatioResolved: ((CGFloat) -> Void)? = nil,
                onDragStarted: ((CGPoint, CGSize) -> Void)? = nil,
                onDragChanged: ((CGPoint, CGSize) -> Void)? = nil,
                onDragCommitted: (() -> Void)? = nil,
                onDragEnd: @escaping () -> Void = {},
                onTapToFront: (() -> Void)? = nil,
                onTogglePlay: ((String) -> Void)? = nil) {
        self._mediaObject = mediaObject
        self.image = image
        self.videoURL = videoURL
        self.externalPlayer = externalPlayer
        self.isEditing = isEditing
        self.canvasWidth = canvasWidth
        self.canvasHeightHint = canvasHeightHint
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
        mediaObject.mediaType == "video"
    }

    // Resolved base values: use local snapshot if set, otherwise fall back to binding.
    private var currentX: CGFloat { baseX ?? mediaObject.x }
    private var currentY: CGFloat { baseY ?? mediaObject.y }
    private var currentScale: CGFloat { baseScale ?? mediaObject.scale }
    private var currentRotation: CGFloat { baseRotation ?? mediaObject.rotation }

    public var body: some View {
        GeometryReader { geo in
            mediaContentWithGestures(canvasWidth: geo.size.width, canvasHeight: geo.size.height)
                .onAppear {
                    canvasSize = geo.size
                    syncBaseFromBinding()
                    if externalPlayer == nil, let url = videoURL {
                        setupInternalPlayer(url: url)
                    } else if externalPlayer != nil {
                        isPlaying = externalPlayer?.rate ?? 0 > 0
                    }
                    resolveVideoAspectRatioIfNeeded()
                }
                .onChange(of: geo.size) { _, newSize in
                    canvasSize = newSize
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

    // MARK: - Content with conditional gestures

    /// Aspect-aware base media size : computes the dimensions of the media's frame
    /// at scale=1, preserving its natural aspect ratio and fitting within ~65% of the
    /// canvas's shorter dimension on its longest axis.
    ///
    /// - Portrait media (ratio < 1) → height = 0.65 * shortDim, width derived from ratio
    /// - Landscape media (ratio > 1) → width = 0.65 * shortDim, height derived from ratio
    /// - Square media (ratio = 1) → side = 0.5 * shortDim
    ///
    /// Cross-viewport behavior : `shortDim = min(canvasWidth, canvasHeight)`, so a portrait
    /// photo at scale=1 takes ~65% of canvas height on iPhone, iPad, and web (canvas is
    /// always 9:16 — `shortDim` is always the canvas width). This is the proportional
    /// "présentable" baseline the user asked for.
    private func baseMediaSize(canvasWidth: CGFloat, canvasHeight: CGFloat) -> CGSize {
        let shortDim = min(canvasWidth, canvasHeight)
        let ratio = max(0.1, min(10, naturalAspectRatio))
        let portraitTarget = shortDim * 0.65
        let landscapeTarget = shortDim * 0.65
        let squareTarget = shortDim * 0.5

        if abs(ratio - 1.0) < 0.05 {
            return CGSize(width: squareTarget, height: squareTarget)
        }
        if ratio < 1.0 {
            // Portrait : longest axis = height
            return CGSize(width: portraitTarget * ratio, height: portraitTarget)
        }
        // Landscape : longest axis = width
        return CGSize(width: landscapeTarget, height: landscapeTarget / ratio)
    }

    @ViewBuilder
    private func mediaContentWithGestures(canvasWidth: CGFloat, canvasHeight: CGFloat) -> some View {
        let effectiveScale = isEditing ? currentScale * gestureScale : currentScale
        let effectiveRotation = isEditing ? currentRotation + gestureRotation.degrees : currentRotation
        let baseSize = baseMediaSize(canvasWidth: canvasWidth, canvasHeight: canvasHeight)
        let scaledWidth = baseSize.width * effectiveScale
        let scaledHeight = baseSize.height * effectiveScale

        // Normalized bbox of the element — fed into the drag callbacks so the parent
        // can compute alignment guides + safe-zone warnings from current dimensions.
        let normWidth = scaledWidth / max(1, canvasWidth)
        let normHeight = scaledHeight / max(1, canvasHeight)

        if isEditing {
            mediaContentBase
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
                                normWidth: normWidth, normHeight: normHeight)
                        .simultaneously(with: pinchGesture)
                        .simultaneously(with: rotateGesture)
                )
                .overlay {
                    if isVideoElement, activePlayer != nil {
                        videoPlayPauseOverlay
                            .frame(width: scaledWidth, height: scaledHeight)
                            .position(
                                x: currentX * canvasWidth + dragOffset.width,
                                y: currentY * canvasHeight + dragOffset.height
                            )
                            .highPriorityGesture(
                                TapGesture().onEnded { _ in togglePlayback() }
                            )
                    }
                }
        } else {
            mediaContent
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
                             normWidth: CGFloat, normHeight: CGFloat) -> some Gesture {
        DragGesture()
            .updating($dragOffset) { value, state, _ in
                state = value.translation
            }
            .onChanged { value in
                let nx = min(1, max(0, currentX + value.translation.width / canvasWidth))
                let ny = min(1, max(0, currentY + value.translation.height / canvasHeight))
                let size = CGSize(width: normWidth, height: normHeight)
                if !dragInitialized {
                    dragInitialized = true
                    onDragStarted?(CGPoint(x: nx, y: ny), size)
                }
                onDragChanged?(CGPoint(x: nx, y: ny), size)
            }
            .onEnded { value in
                // Compute raw position, then apply soft snap to alignment targets.
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

    // MARK: - Media content (without video overlay — used in editing mode)
    //
    // `.scaledToFit` (vs. `.scaledToFill`) preserves the media's natural aspect ratio
    // without cropping. Combined with the aspect-aware frame from `baseMediaSize(...)`,
    // the visible content matches the source proportions on every viewport.

    private var mediaContentBase: some View {
        ZStack {
            if let player = activePlayer {
                _InlineVideoLayer(player: player)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            } else if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
    }

    // MARK: - Media content (reader mode — no controls, video plays automatically)

    private var mediaContent: some View {
        ZStack {
            if let player = activePlayer {
                _InlineVideoLayer(player: player)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            } else if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
    }

    // MARK: - Video play/pause overlay

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

    // MARK: - Playback toggle

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
        // Try cached prerolled player first (zero-latency path)
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

        // Seamless looping via AVPlayerLooper (no gap, Apple recommended)
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

    /// Resolves the natural aspect ratio of a video asset and reports it back to the
    /// parent. Only fires when `naturalAspectRatio` is still at its default (1.0) AND
    /// a video URL is available — avoids unnecessary asset loads. Once the parent caches
    /// the ratio, subsequent renders use the correct proportions.
    private func resolveVideoAspectRatioIfNeeded() {
        guard isVideoElement,
              abs(naturalAspectRatio - 1.0) < 0.01,
              let url = videoURL,
              let resolveCallback = onAspectRatioResolved
        else { return }

        Task.detached(priority: .userInitiated) {
            let asset = AVURLAsset(url: url)
            do {
                let tracks = try await asset.loadTracks(withMediaType: .video)
                guard let track = tracks.first else { return }
                let size = try await track.load(.naturalSize)
                let transform = try await track.load(.preferredTransform)
                // Apply the transform's rotation to get the displayed dimensions.
                let displayed = size.applying(transform)
                let w = abs(displayed.width)
                let h = abs(displayed.height)
                guard w > 0, h > 0 else { return }
                let ratio = w / h
                await MainActor.run {
                    resolveCallback(ratio)
                }
            } catch {
                // Silent failure — the media keeps its 1:1 fallback ratio.
            }
        }
    }
}

// MARK: - Inline AVPlayerLayer (GPU-composited, replaces SwiftUI VideoPlayer)
//
// `.resizeAspect` preserves the natural aspect ratio (no cropping) — paired with the
// aspect-aware frame from `baseMediaSize(...)`, the video renders pixel-accurate to
// its source on every viewport.

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
