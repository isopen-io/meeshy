import SwiftUI
import AVFoundation
import MeeshySDK

/// The video preview surface: a clean `AVPlayerLayer` (no system chrome),
/// tap-to-play, a paused-state play affordance and the live caption overlay.
struct VideoEditorStage: View {
    @ObservedObject var viewModel: VideoEditorViewModel

    @State private var flash = false

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Color.black

                PlayerSurface(player: viewModel.player)
                    .allowsHitTesting(false)

                if let caption = viewModel.caption(at: viewModel.playheadTime),
                   !caption.text.isEmpty {
                    captionOverlay(caption.text)
                }

                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture { handleTap() }

                if !viewModel.isPlaying || flash {
                    playAffordance
                        .transition(.scale(scale: 0.6).combined(with: .opacity))
                }

                if !viewModel.isReady {
                    ProgressView()
                        .tint(.white)
                        .controlSize(.large)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
            .clipped()
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: viewModel.isPlaying)
        .animation(.easeOut(duration: 0.25), value: flash)
    }

    private var playAffordance: some View {
        ZStack {
            Circle()
                .fill(.black.opacity(0.42))
                .frame(width: 74, height: 74)
            Circle()
                .stroke(.white.opacity(0.14), lineWidth: 1)
                .frame(width: 74, height: 74)
            Image(systemName: viewModel.isPlaying ? "play.fill" : "pause.fill")
                .font(MeeshyFont.relative(27, weight: .bold))
                .foregroundStyle(.white)
                .offset(x: viewModel.isPlaying ? 2 : 0)
        }
        .allowsHitTesting(false)
    }

    private func captionOverlay(_ text: String) -> some View {
        VStack {
            Spacer()
            Text(text)
                .font(MeeshyFont.relative(15, weight: .semibold))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .fill(.black.opacity(0.55))
                )
                .padding(.horizontal, 24)
                .padding(.bottom, 18)
                .shadow(color: .black.opacity(0.5), radius: 4, y: 1)
        }
        .allowsHitTesting(false)
        .transition(.opacity)
    }

    private func handleTap() {
        viewModel.togglePlayback()
        flash = true
        Task {
            try? await Task.sleep(for: .milliseconds(420))
            flash = false
        }
    }
}

// MARK: - Player Surface

/// `AVPlayerLayer`-backed view — no system transport controls, just frames.
struct PlayerSurface: UIViewRepresentable {
    let player: AVPlayer

    func makeUIView(context: Context) -> PlayerLayerHostView {
        let view = PlayerLayerHostView()
        view.playerLayer.player = player
        view.playerLayer.videoGravity = .resizeAspect
        view.backgroundColor = .black
        return view
    }

    func updateUIView(_ uiView: PlayerLayerHostView, context: Context) {
        if uiView.playerLayer.player !== player {
            uiView.playerLayer.player = player
        }
    }
}

final class PlayerLayerHostView: UIView {
    override static var layerClass: AnyClass { AVPlayerLayer.self }

    var playerLayer: AVPlayerLayer {
        // Safe: `layerClass` guarantees the backing layer's type.
        layer as! AVPlayerLayer
    }
}
