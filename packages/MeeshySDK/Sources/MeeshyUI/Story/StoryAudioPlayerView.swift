import SwiftUI
import AVKit
import MeeshySDK

public struct StoryAudioPlayerView: View {
    @Binding public var audioObject: StoryAudioPlayerObject
    public let isEditing: Bool
    public let onDragEnd: () -> Void

    @State private var isPlaying = false
    @State private var playbackProgress: Double = 0
    @GestureState private var dragOffset = CGSize.zero

    public init(audioObject: Binding<StoryAudioPlayerObject>,
                isEditing: Bool = false,
                onDragEnd: @escaping () -> Void = {}) {
        self._audioObject = audioObject
        self.isEditing = isEditing
        self.onDragEnd = onDragEnd
    }

    public var body: some View {
        GeometryReader { geo in
            playerContent
                .position(
                    x: audioObject.x * geo.size.width + dragOffset.width,
                    y: audioObject.y * geo.size.height + dragOffset.height
                )
                .gesture(isEditing ? dragGesture(geo: geo) : nil)
        }
    }

    private var playerContent: some View {
        HStack(spacing: 8) {
            Button(action: togglePlayback) {
                Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.white)
            }
            .accessibilityLabel(isPlaying ? "Pause" : "Lire")

            waveformView
                .frame(width: 120, height: 32)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial, in: Capsule())
    }

    private var waveformView: some View {
        TimelineView(.animation(minimumInterval: 0.05)) { context in
            Canvas { ctx, size in
                let samples = audioObject.waveformSamples
                guard !samples.isEmpty else { return }
                let barWidth = size.width / CGFloat(samples.count)
                let centerY = size.height / 2
                let t = context.date.timeIntervalSinceReferenceDate

                for (i, sample) in samples.enumerated() {
                    let x = CGFloat(i) * barWidth + barWidth / 2
                    let height = max(2, CGFloat(sample) * size.height * 0.9)

                    let progress = isPlaying ? playbackProgress : 0
                    let isPlayed = Double(i) / Double(samples.count) < progress
                    let alpha: Double = isPlayed ? 1.0 : 0.4

                    let animOffset: CGFloat = isPlaying && isPlayed
                        ? CGFloat(sin(t * 8 + Double(i) * 0.7)) * 2 : 0

                    ctx.fill(
                        Path(CGRect(x: x - barWidth * 0.3,
                                    y: centerY - height / 2 + animOffset,
                                    width: barWidth * 0.6,
                                    height: height)),
                        with: .color(.white.opacity(alpha))
                    )
                }
            }
        }
    }

    private func dragGesture(geo: GeometryProxy) -> some Gesture {
        DragGesture()
            .updating($dragOffset) { value, state, _ in state = value.translation }
            .onEnded { value in
                audioObject.x = min(1, max(0, audioObject.x + value.translation.width / geo.size.width))
                audioObject.y = min(1, max(0, audioObject.y + value.translation.height / geo.size.height))
                onDragEnd()
            }
    }

    private func togglePlayback() {
        isPlaying.toggle()
        // TODO Task 20 : connecter à AVPlayer via StoryComposerView
    }
}
