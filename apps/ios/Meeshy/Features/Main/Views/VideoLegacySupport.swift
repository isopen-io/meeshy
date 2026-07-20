import SwiftUI
import AVKit
import AVFoundation
import MeeshySDK
import MeeshyUI

// MARK: - OrientationManager
//
// Moved from MeeshySDK (VideoFullscreenPlayerView.swift — deleted Phase 5).
// Used by AppDelegate to honour orientation-lock requests from fullscreen video.

@MainActor
final class OrientationManager: ObservableObject {
    static let shared = OrientationManager()

    @Published var orientationLock: UIInterfaceOrientationMask = .portrait

    private init() {}

    func unlock() {
        orientationLock = .allButUpsideDown
    }

    func lockPortrait() {
        orientationLock = .portrait
        if #available(iOS 16.0, *) {
            guard let windowScene = UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene }).first else { return }
            windowScene.requestGeometryUpdate(.iOS(interfaceOrientations: .portrait))
        }
    }
}

// MARK: - FullscreenAVPlayerLayerView
//
// Moved from MeeshySDK (VideoFullscreenPlayerView.swift — deleted Phase 5).
// Used by ConversationMediaGalleryView for the shared AVPlayer layer.

struct FullscreenAVPlayerLayerView: UIViewRepresentable {
    let player: AVPlayer
    let gravity: AVLayerVideoGravity
    var configurePip: Bool = true

    func makeUIView(context: Context) -> FullscreenPlayerUIView {
        let view = FullscreenPlayerUIView()
        view.playerLayer.videoGravity = gravity
        view.playerLayer.player = player
        if configurePip {
            SharedAVPlayerManager.shared.configurePip(playerLayer: view.playerLayer)
        }
        return view
    }

    func updateUIView(_ uiView: FullscreenPlayerUIView, context: Context) {
        uiView.updatePlayer(player)
        uiView.updateGravity(gravity)
        if configurePip {
            SharedAVPlayerManager.shared.configurePip(playerLayer: uiView.playerLayer)
        }
    }

    final class FullscreenPlayerUIView: UIView {
        let playerLayer = AVPlayerLayer()

        override init(frame: CGRect) {
            super.init(frame: frame)
            layer.addSublayer(playerLayer)
        }

        @available(*, unavailable)
        required init?(coder: NSCoder) { fatalError() }

        override func layoutSubviews() {
            super.layoutSubviews()
            playerLayer.frame = bounds
        }

        func updatePlayer(_ player: AVPlayer) {
            guard playerLayer.player !== player else { return }
            playerLayer.player = player
        }

        func updateGravity(_ gravity: AVLayerVideoGravity) {
            guard playerLayer.videoGravity != gravity else { return }
            playerLayer.videoGravity = gravity
        }
    }
}

// MARK: - VideoFullscreenPlayer
//
// Moved from MeeshySDK (VideoPlayerView.swift — deleted Phase 5).
// Lightweight fullscreen player for composer-preview (local file URLs).
// Watch-progress reporting removed — not applicable for pre-send previews.

struct VideoFullscreenPlayer: View {
    let urlString: String
    let speed: PlaybackSpeed

    @Environment(\.dismiss) private var dismiss
    @State private var avPlayer: AVPlayer?

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if let player = avPlayer {
                VideoPlayer(player: player)
                    .ignoresSafeArea()
            }

            VStack {
                HStack {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(MeeshyFont.relative(28))
                            .foregroundColor(.white.opacity(0.8))
                            .padding()
                    }
                    .accessibilityLabel(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))
                    Spacer()
                }
                Spacer()
            }
        }
        .onAppear {
            guard let url = MeeshyConfig.resolveMediaURL(urlString) ?? URL(string: urlString) else { return }
            let player = AVPlayer(url: url)
            player.rate = Float(speed.rawValue)
            avPlayer = player
        }
        .onDisappear {
            avPlayer?.pause()
            avPlayer = nil
        }
    }
}
