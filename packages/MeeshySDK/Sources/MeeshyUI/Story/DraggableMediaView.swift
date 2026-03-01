import SwiftUI
import AVKit
import MeeshySDK

public struct DraggableMediaView: View {
    @Binding public var mediaObject: StoryMediaObject
    public let image: UIImage?
    public let videoURL: URL?
    public let isEditing: Bool
    public let onDragEnd: () -> Void

    @State private var videoPlayer: AVPlayer?
    @GestureState private var gestureScale: CGFloat = 1.0
    @GestureState private var gestureRotation: Angle = .zero
    @GestureState private var dragOffset: CGSize = .zero

    public init(mediaObject: Binding<StoryMediaObject>,
                image: UIImage? = nil, videoURL: URL? = nil,
                isEditing: Bool = false, onDragEnd: @escaping () -> Void = {}) {
        self._mediaObject = mediaObject
        self.image = image; self.videoURL = videoURL
        self.isEditing = isEditing; self.onDragEnd = onDragEnd
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
                .gesture(isEditing ? combinedGesture(geo: geo) : nil)
        }
    }

    @ViewBuilder
    private var mediaContent: some View {
        if let image {
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .clipShape(RoundedRectangle(cornerRadius: 8))
        } else if let videoURL {
            VideoPlayer(player: videoPlayer ?? AVPlayer())
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .onAppear {
                    if videoPlayer == nil {
                        videoPlayer = AVPlayer(url: videoURL)
                    }
                }
                .onChange(of: videoURL) { newURL in
                    if let newURL {
                        videoPlayer = AVPlayer(url: newURL)
                    }
                }
        }
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
