import SwiftUI
import Photos
import AVFoundation
import UIKit
import MeeshySDK
import MeeshyUI

// ============================================================================
// MARK: - RecentMediaPreview (long-press quick look)
// ============================================================================

/// Preview shown on long-press of a recent-media cell, via the system
/// context-menu preview, sized to the asset's real aspect ratio. Photos render
/// full quality; videos show their poster frame instantly, then start looping
/// playback AVEC LE SON as soon as the player item resolves.
///
/// Le son n'est pas qu'un `isMuted = false` : sans catégorie `.playback` posée,
/// l'aperçu reste muet dès que l'interrupteur Silence est enclenché (catégorie
/// par défaut `.soloAmbient`). La session passe donc par la source UNIQUE
/// call-aware du SDK, comme `SharedAVPlayerManager.play()` — pendant un appel
/// VoIP elle est un no-op, l'aperçu joue alors sous la session de l'appel et le
/// micro reste intact.
struct RecentMediaPreview: View {
    let asset: PHAsset
    let model: RecentMediaStripModel

    @State private var image: UIImage?
    @State private var player: AVQueuePlayer?
    @State private var looper: AVPlayerLooper?

    private var previewSize: CGSize {
        let width = CGFloat(max(asset.pixelWidth, 1))
        let height = CGFloat(max(asset.pixelHeight, 1))
        let maxSide: CGFloat = 320
        let scale = min(maxSide / width, maxSide / height)
        return CGSize(width: width * scale, height: height * scale)
    }

    var body: some View {
        ZStack {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
            } else {
                Color.black.opacity(0.05)
                ProgressView()
            }
            if let player {
                PreviewVideoSurface(player: player)
            }
        }
        .frame(width: previewSize.width, height: previewSize.height)
        .task {
            image = await model.preview(for: asset)
            guard asset.mediaType == .video,
                  let item = await model.videoPlayerItem(for: asset) else { return }
            let queue = AVQueuePlayer()
            queue.allowsExternalPlayback = false
            queue.preventsDisplaySleepDuringVideoPlayback = false
            // L'aperçu sonne : les autres lecteurs de l'app se taisent d'abord.
            // AVANT d'armer la session — `stopAll()` passe par
            // `SharedAVPlayerManager.stop()`, qui désactive la session ; l'ordre
            // inverse la désarmerait juste après l'avoir posée.
            PlaybackCoordinator.shared.stopAll()
            MediaSessionCoordinator.shared.activateContentPlayback(.audible)
            looper = AVPlayerLooper(player: queue, templateItem: item)
            player = queue
            queue.play()
        }
        // Le looper est démonté AVANT le player : il garde des observateurs KVO
        // dessus, et l'ordre inverse risque un callback sur un player en cours
        // de désallocation (même règle que `AttachmentQuickLookPreview`).
        .onDisappear {
            player?.pause()
            looper = nil
            player = nil
            MediaSessionCoordinator.shared.deactivatePlaybackSync()
        }
    }
}

/// Chrome-less `AVPlayerLayer` host for the context-menu video preview.
/// AVKit's `VideoPlayer` is the wrong tool here: it draws transport controls
/// (unusable inside a context-menu preview) over a black backdrop that hides
/// the poster frame while the stream buffers. A bare player layer stays
/// transparent until the first frame renders, so the poster shows through.
private struct PreviewVideoSurface: UIViewRepresentable {
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
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer {
            guard let layer = layer as? AVPlayerLayer else {
                preconditionFailure("PlayerLayerView layer must be AVPlayerLayer")
            }
            return layer
        }
    }
}
