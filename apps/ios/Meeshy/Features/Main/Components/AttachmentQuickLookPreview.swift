import SwiftUI
import AVFoundation
import UIKit

/// Full-screen long-press preview for a STAGED (not-yet-sent) image or video
/// attachment. The composer already holds the media locally
/// (`composerState.pendingMediaFiles`/`pendingThumbnails`), so unlike the
/// recent-media strip's equivalent (`RecentMediaPreview` in
/// `RecentMediaStrip.swift`, which resolves a `PHAsset`), this needs no async
/// PhotoKit round-trip — it renders straight from the local file.
struct AttachmentQuickLookPreview: View {
    enum Kind { case image, video }

    let kind: Kind
    /// The staged file's local URL. For `.video` this is the actual source to
    /// play; for `.image` it's only used as a higher-quality fallback when no
    /// thumbnail is cached yet.
    let fileURL: URL?
    let thumbnail: UIImage?

    @State private var fullImage: UIImage?
    @State private var player: AVQueuePlayer?
    @State private var looper: AVPlayerLooper?

    var body: some View {
        ZStack {
            if let image = fullImage ?? thumbnail {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
            } else {
                Color.black.opacity(0.05)
                ProgressView()
            }
            if let player {
                AttachmentQuickLookVideoSurface(player: player)
            }
        }
        .frame(width: 280, height: 280)
        .task {
            switch kind {
            case .image:
                guard fullImage == nil, let fileURL, let data = try? Data(contentsOf: fileURL) else { return }
                fullImage = UIImage(data: data)
            case .video:
                guard let fileURL else { return }
                let queue = AVQueuePlayer()
                queue.isMuted = true
                queue.allowsExternalPlayback = false
                queue.preventsDisplaySleepDuringVideoPlayback = false
                let item = AVPlayerItem(url: fileURL)
                looper = AVPlayerLooper(player: queue, templateItem: item)
                player = queue
                queue.play()
            }
        }
        // Tear down the looper BEFORE releasing the player: AVPlayerLooper
        // keeps KVO observers on its player, and releasing both in the wrong
        // order risks a callback landing on an already-deallocating player.
        .onDisappear {
            player?.pause()
            looper = nil
            player = nil
        }
    }
}

/// Chrome-less `AVPlayerLayer` host — same rationale as
/// `RecentMediaStrip.swift`'s `PreviewVideoSurface`: AVKit's `VideoPlayer`
/// draws unusable transport controls over a black backdrop inside a
/// long-press preview.
private struct AttachmentQuickLookVideoSurface: UIViewRepresentable {
    let player: AVPlayer

    func makeUIView(context: Context) -> PlayerLayerView {
        let view = PlayerLayerView()
        view.playerLayer.videoGravity = .resizeAspect
        view.playerLayer.player = player
        return view
    }

    func updateUIView(_ uiView: PlayerLayerView, context: Context) {
        if uiView.playerLayer.player !== player {
            uiView.playerLayer.player = player
        }
    }

    final class PlayerLayerView: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer {
            guard let layer = layer as? AVPlayerLayer else {
                preconditionFailure("PlayerLayerView layer must be AVPlayerLayer")
            }
            return layer
        }
    }
}
