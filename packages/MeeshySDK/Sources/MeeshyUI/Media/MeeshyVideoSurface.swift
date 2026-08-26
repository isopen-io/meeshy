import SwiftUI
import AVFoundation
import UIKit

/// UIViewRepresentable atom hosting an `AVPlayerLayer` directly as the
/// view's layer class. Used as the rendering core of `MeeshyVideoPlayer`.
///
/// Why `layerClass` override : the host UIView's primary layer IS the
/// AVPlayerLayer. No sublayer, no double layout sync, no bounds mismatch.
///
/// `updateUIView` compares by reference — it NEVER recreates the layer
/// across SwiftUI body re-evaluations.
internal struct MeeshyVideoSurface: UIViewRepresentable {
    let player: AVPlayer
    let gravity: AVLayerVideoGravity
    let isMuted: Bool
    /// Opt-in Picture-in-Picture. `false` par défaut : attacher un
    /// `AVPictureInPictureController` pose aussi
    /// `canStartPictureInPictureAutomaticallyFromInline = true`, donc une
    /// surface qui n'expose pas de contrôle PiP ne doit JAMAIS l'activer —
    /// elle ouvrirait une fenêtre système au passage en arrière-plan sans
    /// que l'utilisateur l'ait demandé. Miroir de `ReelVideoSurface.enablesPip`
    /// (`ReelsPlayerView.swift`). `var` (et non `let`) avec valeur par
    /// défaut : `MeeshyVideoSurface` est `internal` et n'a pas d'init
    /// explicite, l'init memberwise synthétisé porte donc le défaut — tout
    /// call site futur reste inchangé et hors PiP.
    var enablesPip: Bool = false
    /// Première frame COMPOSÉE (`AVPlayerLayer.isReadyForDisplay`, KVO) — le
    /// signal qui autorise l'hôte à retirer le poster net qu'il affiche par-
    /// dessus. Armé sur la présence du PLAYER et le layer, jamais sur
    /// `currentItem` (`tasks/lessons.md` § 24). Défaut `nil` : aucun call site
    /// existant ne change.
    var onReadyForDisplay: (() -> Void)? = nil

    func makeUIView(context: Context) -> _SurfaceUIView {
        let view = _SurfaceUIView()
        view.isOpaque = true
        view.playerLayer.videoGravity = gravity
        view.playerLayer.player = player
        player.isMuted = isMuted
        view.onReadyForDisplay = onReadyForDisplay
        view.armReadinessObserver()
        if enablesPip {
            SharedAVPlayerManager.shared.configurePip(playerLayer: view.playerLayer)
        }
        return view
    }

    func updateUIView(_ uiView: _SurfaceUIView, context: Context) {
        uiView.onReadyForDisplay = onReadyForDisplay
        if uiView.playerLayer.player !== player {
            uiView.playerLayer.player = player
            uiView.armReadinessObserver()
        }
        if uiView.playerLayer.videoGravity != gravity {
            uiView.playerLayer.videoGravity = gravity
        }
        if player.isMuted != isMuted {
            player.isMuted = isMuted
        }
        if enablesPip {
            // Idempotent : garde d'identité de layer dans `configurePip`.
            SharedAVPlayerManager.shared.configurePip(playerLayer: uiView.playerLayer)
        }
    }

    /// Force la UIView à accepter le frame proposé par SwiftUI au lieu de
    /// retomber sur la `naturalSize` de l'`AVPlayerLayer`. Sans cet override,
    /// un `.aspectRatio(ratio, .fit)` au-dessus du surface est ignoré dès
    /// qu'un `AVPlayer` est attaché : SwiftUI lit l'intrinsic landscape
    /// `1280×720` de l'asset et écrase la contrainte de ratio portrait,
    /// ce qui aplatissait la bulle vidéo 9:16 en 16:9 au moment du tap-play.
    ///
    /// Si une dimension du proposal est `nil` ou `.infinity`, on renvoie
    /// `nil` pour laisser SwiftUI utiliser l'`intrinsicContentSize`
    /// (`noIntrinsicMetric`) — la UIView accepte alors la frame du parent
    /// sans réintroduire la naturalSize de l'AVPlayerLayer.
    func sizeThatFits(_ proposal: ProposedViewSize, uiView: _SurfaceUIView, context: Context) -> CGSize? {
        guard let w = proposal.width, let h = proposal.height,
              w.isFinite, h.isFinite, w > 0, h > 0 else {
            return nil
        }
        return CGSize(width: w, height: h)
    }

    final class _SurfaceUIView: UIView {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var onReadyForDisplay: (() -> Void)?
        private var readinessObserver: NSKeyValueObservation?

        /// `.initial` relit la valeur à l'enregistrement : une frame déjà
        /// composée (player partagé repris d'une bulle) signale immédiatement.
        /// Le rappel arrive sur le fil d'AVFoundation → sauté sur le main actor.
        func armReadinessObserver() {
            readinessObserver = playerLayer.observe(\.isReadyForDisplay, options: [.new, .initial]) { [weak self] layer, _ in
                guard layer.isReadyForDisplay else { return }
                Task { @MainActor in self?.onReadyForDisplay?() }
            }
        }
        var playerLayer: AVPlayerLayer {
            guard let layer = layer as? AVPlayerLayer else {
                preconditionFailure("MeeshyVideoSurface layer must be AVPlayerLayer")
            }
            return layer
        }

        /// Pas d'intrinsic content size — la frame doit venir exclusivement
        /// du parent SwiftUI (driven par `.aspectRatio` ou `.frame`).
        override var intrinsicContentSize: CGSize {
            CGSize(width: UIView.noIntrinsicMetric, height: UIView.noIntrinsicMetric)
        }
    }
}
