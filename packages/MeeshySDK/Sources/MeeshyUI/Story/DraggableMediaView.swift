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

    @State private var internalPlayer: AVQueuePlayer?
    @State private var playerLooper: AVPlayerLooper?
    @State private var isPlaying: Bool = false

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
                onDragEnd: @escaping () -> Void = {},
                onTapToFront: (() -> Void)? = nil,
                onTogglePlay: ((String) -> Void)? = nil) {
        self._mediaObject = mediaObject
        self.image = image
        self.videoURL = videoURL
        self.externalPlayer = externalPlayer
        self.isEditing = isEditing
        self.canvasWidth = canvasWidth
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
                }
                .onChange(of: geo.size) { _, newSize in
                    canvasSize = newSize
                }
                .onChange(of: videoURL) { _, newURL in
                    if externalPlayer == nil, let url = newURL {
                        teardownInternalPlayer()
                        setupInternalPlayer(url: url)
                    }
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

    private var baseMediaSize: CGFloat { canvasWidth * 0.4 }

    @ViewBuilder
    private func mediaContentWithGestures(canvasWidth: CGFloat, canvasHeight: CGFloat) -> some View {
        let effectiveScale = isEditing ? currentScale * gestureScale : currentScale
        let effectiveRotation = isEditing ? currentRotation + gestureRotation.degrees : currentRotation
        let scaledSize = baseMediaSize * effectiveScale

        if isEditing {
            mediaContentBase
                .frame(width: baseMediaSize, height: baseMediaSize)
                .scaleEffect(effectiveScale)
                .rotationEffect(.degrees(effectiveRotation))
                .frame(width: scaledSize, height: scaledSize)
                .contentShape(Rectangle())
                .position(
                    x: currentX * canvasWidth + dragOffset.width,
                    y: currentY * canvasHeight + dragOffset.height
                )
                .highPriorityGesture(TapGesture().onEnded { _ in onTapToFront?() })
                // Combined primary gesture — claims touch exclusively, preventing
                // parent canvas gestures from firing when touching this element.
                .gesture(
                    dragGesture(canvasWidth: canvasWidth, canvasHeight: canvasHeight)
                        .simultaneously(with: pinchGesture)
                        .simultaneously(with: rotateGesture)
                )
                .overlay {
                    if isVideoElement, activePlayer != nil {
                        videoPlayPauseOverlay
                            .frame(width: scaledSize, height: scaledSize)
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
                .frame(width: baseMediaSize, height: baseMediaSize)
                .scaleEffect(currentScale)
                .rotationEffect(.degrees(currentRotation))
                .frame(width: scaledSize, height: scaledSize)
                .contentShape(Rectangle())
                .position(
                    x: currentX * canvasWidth,
                    y: currentY * canvasHeight
                )
                .simultaneousGesture(TapGesture().onEnded { _ in onTapToFront?() })
        }
    }

    // MARK: - Gestures

    private func dragGesture(canvasWidth: CGFloat, canvasHeight: CGFloat) -> some Gesture {
        DragGesture()
            .updating($dragOffset) { value, state, _ in
                state = value.translation
            }
            .onEnded { value in
                let newX = min(1, max(0, currentX + value.translation.width / canvasWidth))
                let newY = min(1, max(0, currentY + value.translation.height / canvasHeight))
                baseX = newX
                baseY = newY
                mediaObject.x = newX
                mediaObject.y = newY
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

    private var mediaContentBase: some View {
        ZStack {
            if let player = activePlayer {
                _InlineVideoLayer(player: player)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            } else if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
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
                    .scaledToFill()
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
}

// MARK: - Inline AVPlayerLayer (GPU-composited, replaces SwiftUI VideoPlayer)

private struct _InlineVideoLayer: UIViewRepresentable {
    let player: AVPlayer

    func makeUIView(context: Context) -> _InlinePlayerView {
        let view = _InlinePlayerView()
        view.playerLayer.player = player
        view.playerLayer.videoGravity = .resizeAspectFill
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
