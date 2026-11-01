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
        let asset = AVURLAsset(url: url)
        guard let duree = try? await asset.load(.duration) else { return nil }
        let secondes = CMTimeGetSeconds(duree)
        guard secondes.isFinite, secondes > 0 else { return nil }
        let debut = media.trimBounds(sourceDuration: secondes).start
        let generateur = AVAssetImageGenerator(asset: asset)
        generateur.appliesPreferredTrackTransform = true
        generateur.maximumSize = maximumSize
        generateur.requestedTimeToleranceBefore = .zero
        generateur.requestedTimeToleranceAfter = CMTime(seconds: 0.1, preferredTimescale: 600)
        guard let image = try? await generateur.image(at: CMTime(seconds: debut, preferredTimescale: 600)).image
        else { return nil }
        return StoryVideoAdjustmentsProcessor.apply(media, to: image)
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
        readyForDisplayObservation = playerLayer.observe(\.isReadyForDisplay, options: [.new, .initial]) { observed, _ in
            guard observed.isReadyForDisplay else { return }
            let lecteur = ObjectIdentifier(observed)
            Task { @MainActor in
                guard let couche = couche.value,
                      couche.avPlayerLayer.map(ObjectIdentifier.init) == lecteur else { return }
                couche.readyForDisplayObservation?.invalidate()
                couche.readyForDisplayObservation = nil
                couche.fadeOutPlaceholder(duration: 0.2)
            }
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
