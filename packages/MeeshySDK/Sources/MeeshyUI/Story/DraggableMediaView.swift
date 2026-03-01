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

    @State private var internalPlayer: AVPlayer?
    @State private var loopObserver: AnyObject? = nil
    @GestureState private var gestureScale: CGFloat = 1.0
    @GestureState private var gestureRotation: Angle = .zero
    @GestureState private var dragOffset: CGSize = .zero

    public init(mediaObject: Binding<StoryMediaObject>,
                image: UIImage? = nil,
                videoURL: URL? = nil,
                externalPlayer: AVPlayer? = nil,
                isEditing: Bool = false,
                onDragEnd: @escaping () -> Void = {},
                onTapToFront: (() -> Void)? = nil) {
        self._mediaObject = mediaObject
        self.image = image
        self.videoURL = videoURL
        self.externalPlayer = externalPlayer
        self.isEditing = isEditing
        self.onDragEnd = onDragEnd
        self.onTapToFront = onTapToFront
    }

    private var activePlayer: AVPlayer? {
        externalPlayer ?? internalPlayer
    }

    public var body: some View {
        GeometryReader { geo in
            mediaContent
                .frame(width: 160, height: 160)
                .scaleEffect(mediaObject.scale * gestureScale)
                .rotationEffect(.radians(mediaObject.rotation) + gestureRotation)
                .position(
                    x: mediaObject.x * geo.size.width + dragOffset.width,
                    y: mediaObject.y * geo.size.height + dragOffset.height
                )
                .contentShape(Rectangle())
                .onTapGesture {
                    onTapToFront?()
                }
                .gesture(isEditing ? combinedGesture(geo: geo) : nil)
                .onAppear {
                    // Crée un player interne uniquement si pas de player externe
                    if externalPlayer == nil, let url = videoURL {
                        setupInternalPlayer(url: url)
                    }
                }
                .onChange(of: videoURL) { newURL in
                    if externalPlayer == nil, let url = newURL {
                        teardownInternalPlayer()
                        setupInternalPlayer(url: url)
                    }
                }
                .onDisappear {
                    if externalPlayer == nil {
                        teardownInternalPlayer()
                    }
                }
        }
    }

    @ViewBuilder
    private var mediaContent: some View {
        if let image {
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .clipShape(RoundedRectangle(cornerRadius: 8))
        } else if let player = activePlayer {
            VideoPlayer(player: player)
                .clipShape(RoundedRectangle(cornerRadius: 8))
        }
    }

    private func setupInternalPlayer(url: URL) {
        let player = AVPlayer(url: url)
        player.isMuted = false
        internalPlayer = player

        let observer = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: player.currentItem,
            queue: .main
        ) { _ in
            player.seek(to: .zero)
            player.play()
        }
        loopObserver = observer as AnyObject
        player.play()
    }

    private func teardownInternalPlayer() {
        internalPlayer?.pause()
        if let observer = loopObserver {
            NotificationCenter.default.removeObserver(observer)
            loopObserver = nil
        }
        internalPlayer = nil
    }

    private func combinedGesture(geo: GeometryProxy) -> some Gesture {
        let drag = DragGesture()
            .updating($dragOffset) { v, s, _ in s = v.translation }
            .onEnded { v in
                mediaObject.x = min(1, max(0, mediaObject.x + v.translation.width / geo.size.width))
                mediaObject.y = min(1, max(0, mediaObject.y + v.translation.height / geo.size.height))
                onDragEnd()
            }

        let pinch = MagnificationGesture()
            .updating($gestureScale) { v, s, _ in s = v }
            .onEnded { v in
                mediaObject.scale = min(4.0, max(0.3, mediaObject.scale * v))
                onDragEnd()
            }

        let rotation = RotationGesture()
            .updating($gestureRotation) { v, s, _ in s = v }
            .onEnded { v in
                mediaObject.rotation += v.radians
                onDragEnd()
            }

        return drag.simultaneously(with: pinch.simultaneously(with: rotation))
    }
}
