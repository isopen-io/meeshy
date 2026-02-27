import SwiftUI
import MeeshySDK

// MARK: - Video Player Overlay Controls

public struct VideoPlayerOverlayControls: View {
    @ObservedObject var manager: SharedAVPlayerManager

    let accentColor: String
    var isFullscreen: Bool = false
    var onExpandFullscreen: (() -> Void)?
    var onClose: (() -> Void)?

    @State private var isSeeking = false
    @State private var seekValue: Double = 0

    private var accent: Color { Color(hex: accentColor) }

    private var progress: Double {
        guard manager.duration > 0 else { return 0 }
        return isSeeking ? seekValue : manager.currentTime / manager.duration
    }

    public init(
        manager: SharedAVPlayerManager,
        accentColor: String,
        isFullscreen: Bool = false,
        onExpandFullscreen: (() -> Void)? = nil,
        onClose: (() -> Void)? = nil
    ) {
        self.manager = manager
        self.accentColor = accentColor
        self.isFullscreen = isFullscreen
        self.onExpandFullscreen = onExpandFullscreen
        self.onClose = onClose
    }

    // MARK: - Body

    public var body: some View {
        ZStack {
            scrimGradients
            VStack {
                topBar
                Spacer()
                centerControls
                Spacer()
                bottomBar
            }
            .padding(.horizontal, isFullscreen ? 16 : 8)
            .padding(.top, isFullscreen ? 12 : 6)
            .padding(.bottom, isFullscreen ? 12 : 24)
        }
    }

    // MARK: - Scrim Gradients

    private var scrimGradients: some View {
        VStack {
            LinearGradient(
                colors: [Color.black.opacity(0.6), Color.clear],
                startPoint: .top,
                endPoint: .bottom
            )
            .frame(height: 50)

            Spacer()

            LinearGradient(
                colors: [Color.clear, Color.black.opacity(0.6)],
                startPoint: .top,
                endPoint: .bottom
            )
            .frame(height: 60)
        }
    }

    // MARK: - Top Bar

    private var topBar: some View {
        HStack {
            if isFullscreen, let onClose {
                Button {
                    onClose()
                    HapticFeedback.light()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 32, height: 32)
                        .background(Circle().fill(Color.white.opacity(0.2)))
                }
            } else if let onExpand = onExpandFullscreen {
                Button {
                    onExpand()
                    HapticFeedback.light()
                } label: {
                    Image(systemName: "arrow.up.left.and.arrow.down.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(width: 28, height: 28)
                        .background(Circle().fill(Color.white.opacity(0.2)))
                }
            }

            Spacer()

            Button {
                manager.cycleSpeed()
                HapticFeedback.light()
            } label: {
                Text(manager.playbackSpeed.label)
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundColor(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(accent))
            }
        }
    }

    // MARK: - Center Controls

    private var centerControls: some View {
        HStack(spacing: isFullscreen ? 40 : 28) {
            Button {
                manager.skip(seconds: -10)
                HapticFeedback.light()
            } label: {
                Image(systemName: "gobackward.10")
                    .font(.system(size: isFullscreen ? 24 : 18, weight: .semibold))
                    .foregroundColor(.white)
            }

            Button {
                manager.togglePlayPause()
                HapticFeedback.light()
            } label: {
                let size: CGFloat = isFullscreen ? 56 : 42
                ZStack {
                    Circle()
                        .fill(Color.white.opacity(0.2))
                        .frame(width: size, height: size)

                    Image(systemName: manager.isPlaying ? "pause.fill" : "play.fill")
                        .font(.system(size: isFullscreen ? 28 : 20, weight: .bold))
                        .foregroundColor(.white)
                        .offset(x: manager.isPlaying ? 0 : 2)
                }
            }

            Button {
                manager.skip(seconds: 10)
                HapticFeedback.light()
            } label: {
                Image(systemName: "goforward.10")
                    .font(.system(size: isFullscreen ? 24 : 18, weight: .semibold))
                    .foregroundColor(.white)
            }
        }
    }

    // MARK: - Bottom Bar

    private var bottomBar: some View {
        VStack(spacing: isFullscreen ? 6 : 4) {
            seekBar

            HStack {
                Text(formatMediaDuration(isSeeking ? seekValue * manager.duration : manager.currentTime))
                    .font(.system(size: isFullscreen ? 11 : 9, weight: .semibold, design: .monospaced))
                    .foregroundColor(.white.opacity(0.7))

                Spacer()

                Text(formatMediaDuration(manager.duration))
                    .font(.system(size: isFullscreen ? 11 : 9, weight: .semibold, design: .monospaced))
                    .foregroundColor(.white.opacity(0.7))
            }
        }
    }

    // MARK: - Seek Bar

    private var seekBar: some View {
        GeometryReader { geo in
            let trackHeight: CGFloat = isFullscreen ? 4 : 3
            let thumbSize: CGFloat = isFullscreen ? 14 : 12
            let filledWidth = geo.size.width * progress

            ZStack(alignment: .leading) {
                Capsule()
                    .fill(Color.white.opacity(0.3))
                    .frame(height: trackHeight)

                Capsule()
                    .fill(accent)
                    .frame(width: max(0, filledWidth), height: trackHeight)

                Circle()
                    .fill(Color.white)
                    .frame(width: thumbSize, height: thumbSize)
                    .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
                    .offset(x: max(0, min(filledWidth - thumbSize / 2, geo.size.width - thumbSize)))
            }
            .frame(height: max(trackHeight, thumbSize))
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        isSeeking = true
                        let fraction = max(0, min(1, value.location.x / geo.size.width))
                        seekValue = fraction
                    }
                    .onEnded { value in
                        let fraction = max(0, min(1, value.location.x / geo.size.width))
                        let targetSeconds = fraction * manager.duration
                        manager.seek(to: targetSeconds)
                        isSeeking = false
                        seekValue = 0
                    }
            )
        }
        .frame(height: isFullscreen ? 14 : 12)
    }
}
