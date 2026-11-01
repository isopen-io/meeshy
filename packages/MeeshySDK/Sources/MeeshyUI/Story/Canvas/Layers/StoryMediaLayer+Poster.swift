import Foundation
import QuartzCore
@preconcurrency import AVFoundation
import UIKit
import MeeshySDK

/// **L'affiche d'une vidéo posée : la PREMIÈRE image de sa fenêtre coupée**
/// (#13864). Tant que le player n'a rien à montrer, la scène peint l'image où
/// la lecture commencera — jamais un flou ThumbHash ni un cadre vide — puis
/// s'efface quand le player peint sa première image.
///
/// La fenêtre se résout par `StoryMediaObject.trimBounds(sourceDuration:)`,
/// le même résolveur que la lecture : l'affiche montre ce que la lecture joue.
nonisolated enum StoryVideoPoster {

    @concurrent
    static func frame(of media: StoryMediaObject, at url: URL, maximumSize: CGSize) async -> CGImage? {
        await frame(at: url, maximumSize: maximumSize,
                    look: StoryVideoAdjustmentsProcessor.paintedLook(for: media),
                    adjustments: StoryVideoAdjustmentsProcessor.paintedAdjustments(for: media),
                    startingAt: { media.trimBounds(sourceDuration: $0).start })
    }

    /// L'image de `url` là où sa lecture commence — `startingAt` reçoit la
    /// durée du fichier et rend la seconde de départ —, peinte du look et des
    /// réglages que ses trames reçoivent. Le fond vidéo (#14180) et la vidéo
    /// posée passent par elle.
    @concurrent
    static func frame(at url: URL, maximumSize: CGSize, look: StoryMediaLook?, adjustments: ImageAdjustments?,
                      startingAt start: @Sendable (Double) -> Double) async -> CGImage? {
        let asset = AVURLAsset(url: url)
        guard let duree = try? await asset.load(.duration) else { return nil }
        let secondes = CMTimeGetSeconds(duree)
        guard secondes.isFinite, secondes > 0 else { return nil }
        let requete = VideoThumbnailRequest(url: url,
                                            instants: .start(atMost: start(secondes)),
                                            maximumSize: maximumSize,
                                            tolerance: .seconds(0.1))
        guard let image = await VideoThumbnailGenerator.shared.image(for: requete)?.cgImage else { return nil }
        return StoryVideoAdjustmentsProcessor.apply(look: look, adjustments: adjustments, to: image)
    }

    /// **Le player a peint sa première image** : `action` part une fois, sur le
    /// fil principal, dès que `playerLayer` a quelque chose à montrer — le
    /// signal qui retire le voile d'attente d'une vidéo posée comme d'un fond.
    @MainActor
    static func onFirstImage(of playerLayer: AVPlayerLayer,
                             _ action: @escaping @MainActor @Sendable () -> Void) -> NSKeyValueObservation {
        playerLayer.observe(\.isReadyForDisplay, options: [.new, .initial]) { observed, _ in
            guard observed.isReadyForDisplay else { return }
            Task { @MainActor in action() }
        }
    }
}

extension StoryMediaLayer {

    /// Pose l'affiche d'une vidéo dont le fichier est sur l'appareil, sous le
    /// player, tant qu'il n'a peint aucune image.
    @MainActor
    func showPoster(of media: StoryMediaObject, from url: URL) {
        posterTask?.cancel()
        posterImage = nil
        let generation = videoLoadGeneration
        let pixels = CGSize(width: max(1, bounds.width * contentsScale), height: max(1, bounds.height * contentsScale))
        posterTask = Task { @MainActor [weak self] in
            let image = await StoryVideoPoster.frame(of: media, at: url, maximumSize: pixels)
            guard let self, !Task.isCancelled, self.videoLoadGeneration == generation, let image else { return }
            self.posterImage = image
            guard self.avPlayerLayer?.isReadyForDisplay != true else { return }
            self.installPlaceholder(contents: image)
        }
    }

    /// Le voile d'attente (affiche ou ThumbHash) part quand le player peint sa
    /// première image, jamais avant : un player attaché n'a encore rien à montrer.
    @MainActor
    func fadeOutPlaceholderWhenReadyForDisplay() {
        readyForDisplayObservation?.invalidate()
        readyForDisplayObservation = nil
        guard let playerLayer = avPlayerLayer else { return }
        let couche = StoryMediaLayerWeakBox(self)
        let lecteur = ObjectIdentifier(playerLayer)
        readyForDisplayObservation = StoryVideoPoster.onFirstImage(of: playerLayer) {
            guard let couche = couche.value,
                  couche.avPlayerLayer.map(ObjectIdentifier.init) == lecteur else { return }
            couche.readyForDisplayObservation?.invalidate()
            couche.readyForDisplayObservation = nil
            couche.fadeOutPlaceholder(duration: 0.2)
        }
    }

    @MainActor
    func cancelPoster() {
        posterTask?.cancel()
        posterTask = nil
        posterImage = nil
        readyForDisplayObservation?.invalidate()
        readyForDisplayObservation = nil
    }

    /// Awaitable handle to the poster decode, for tests.
    @MainActor
    public func _posterTaskForTesting() -> Task<Void, Never>? {
        posterTask
    }
}
