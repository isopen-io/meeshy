import UIKit
@preconcurrency import AVFoundation
import MeeshySDK

/// **Un fond vidéo attend sa première image comme une vidéo posée** (#14180).
///
/// Sur la scène du composer (`isEnabled`, levé par `StoryComposerCanvasView`),
/// un fond dont le fichier est sur l'appareil se couvre d'un voile dès
/// l'attache de son player : le ThumbHash s'il en a un, puis l'affiche — l'image où sa lecture commence, décodée hors du fil
/// principal par `StoryVideoPoster` et peinte du look et des réglages que le
/// player reçoit. Le voile part quand le player peint sa première image
/// (`StoryVideoPoster.onFirstImage`), le signal de la vidéo posée.
///
/// Le voile est un calque du player lui-même : il en suit le cadre et la
/// transformation sans que la couche de fond ait à les lui recopier. Un fond
/// ne se rogne pas à la lecture : elle commence à la première image du
/// fichier, l'affiche aussi.
@MainActor
final class StoryVideoWaitVeil {
    nonisolated deinit {}

    private(set) var layer: CALayer?
    private(set) var posterImage: CGImage?
    private(set) var posterTask: Task<Void, Never>?
    private var observation: NSKeyValueObservation?
    private var watchedPlayer: ObjectIdentifier?
    /// La scène du composer le lève ; la lecture garde sa porte de contenu prêt.
    var isEnabled = false

    nonisolated init() {}

    /// Couvre le player d'un fond local jusqu'à sa première image, peinte du
    /// look et des réglages du fond, cadrée comme lui.
    func cover(_ playerLayer: AVPlayerLayer?, playing url: URL, thumbHash: String?,
               look: StoryMediaLook?, adjustments: ImageAdjustments?, fitMode: String?) {
        cancel()
        guard isEnabled, let playerLayer else { return }
        let gravity = StoryBackgroundLayer.resolveImageGravity(naturalSize: playerLayer.bounds.size,
                                                               canvasSize: playerLayer.bounds.size, override: fitMode)
        let look = StoryMediaLookPainterRegistry.paintable(look)
        let adjustments = StoryBackgroundLook.painted(adjustments, for: .video)
        let lecteur = ObjectIdentifier(playerLayer)
        watchedPlayer = lecteur
        if let hash = thumbHash, let image = ThumbHashDecoder.decodeIfAvailable(hash) {
            install(CanvasImageOrientation.displayCGImage(image), on: playerLayer, gravity: gravity)
        }
        let pixels = CGSize(width: max(1, playerLayer.bounds.width * playerLayer.contentsScale),
                            height: max(1, playerLayer.bounds.height * playerLayer.contentsScale))
        posterTask = Task { [weak self, weak playerLayer] in
            let image = await StoryVideoPoster.frame(at: url, maximumSize: pixels, look: look,
                                                     adjustments: adjustments, startingAt: { _ in 0 })
            guard let self, !Task.isCancelled, let image else { return }
            self.posterImage = image
            guard let playerLayer, self.watchedPlayer == lecteur, !playerLayer.isReadyForDisplay else { return }
            self.install(image, on: playerLayer, gravity: gravity)
        }
        observation = StoryVideoPoster.onFirstImage(of: playerLayer) { [weak self] in
            guard let self, self.watchedPlayer == lecteur else { return }
            self.fadeOut(duration: 0.2)
        }
    }

    /// Le voile et l'affiche partent avec le player.
    func cancel() {
        posterTask?.cancel()
        posterTask = nil
        posterImage = nil
        observation?.invalidate()
        observation = nil
        watchedPlayer = nil
        layer?.removeFromSuperlayer()
        layer = nil
    }

    private func install(_ contents: CGImage?, on playerLayer: AVPlayerLayer, gravity: CALayerContentsGravity) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }
        if let existant = layer {
            existant.contents = contents
            return
        }
        let voile = CALayer()
        voile.frame = playerLayer.bounds
        voile.contents = contents
        voile.contentsGravity = gravity
        voile.masksToBounds = true
        playerLayer.addSublayer(voile)
        layer = voile
    }

    private func fadeOut(duration: TimeInterval) {
        observation?.invalidate()
        observation = nil
        watchedPlayer = nil
        guard let voile = layer else { return }
        layer = nil
        CATransaction.begin()
        CATransaction.setAnimationDuration(duration)
        CATransaction.setCompletionBlock { voile.removeFromSuperlayer() }
        voile.opacity = 0
        CATransaction.commit()
    }
}
