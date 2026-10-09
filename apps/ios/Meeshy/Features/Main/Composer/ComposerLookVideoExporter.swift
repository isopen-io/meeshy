import AVFoundation
import CoreImage
import Foundation
import MeeshySDK
import MeeshyUI
import os

/// **La vidéo part avec le look qu'on voyait en la filmant** (#9329).
///
/// Le film s'écrit brut (`AVCaptureMovieFileOutput` : passthrough, segments
/// concaténables) ; le look s'applique ensuite, image par image, par la MÊME
/// chaîne que l'aperçu — le peintre unique (`ComposerLookPainter`), sur le
/// canevas 9:16 à la résolution de la prise, à la date de la session. Même
/// précédent que le filigrane (`MeeshyVideoWatermarkBaker`) :
/// `applyingCIFiltersWithHandler` redresse la source et cale la toile sur la
/// piste transformée, et une vidéo dont l'orientation ne serait pas tenue n'est
/// pas rendue couchée — la prise brute repart plutôt que perdue.
nonisolated enum ComposerLookVideoExporter {

    /// - Returns: la vidéo regardée, `url` telle quelle sans look, sans cadrage
    ///   et sans découpe, `nil` si le rendu a échoué (l'appelant ne remet alors
    ///   rien : le brut porte ce que la découpe et le cadrage ont retiré).
    ///
    /// `@concurrent` : peindre les couches du cadre et monter l'export ne se
    /// fait jamais sur le fil principal, d'où le `✓` l'appelle.
    /// `declaredSpaceName` : l'espace que déclaraient les trames du viseur — le
    /// cube y lit la vidéo comme il y lisait l'aperçu.
    /// `timeRange` : la plage gardée par la découpe (#9353) — elle seule part,
    /// image et son ; `nil` ⇒ le clip entier.
    /// `audioGain` : le son réglé en retouche (#9754), de 0 (muet) à 1 (intact).
    @concurrent
    static func export(_ url: URL, look: ComposerPhotoLook, framing: ComposerFraming = .identity,
                       timeRange: CMTimeRange? = nil, aspect: CGFloat = ComposerLookPainter.designAspect,
                       person: CallFramePerson, date: Date,
                       declaredSpaceName: String? = nil, audioGain: Float = 1) async -> URL? {
        guard ComposerLiveLookRule.rendersLive(look) || !framing.isIdentity || timeRange != nil
                || audioGain != 1 else { return url }
        let asset = AVURLAsset(url: url)
        do {
            guard let track = try await asset.loadTracks(withMediaType: .video).first else { return nil }
            let natural = try await track.load(.naturalSize)
            let transform = try await track.load(.preferredTransform)
            let upright = MeeshyVideoWatermarkBaker.orientedSize(natural: natural, transform: transform)
            let toile = ComposerLookPainter.canvas(for: upright, aspect: aspect)
            let scene = ComposerLookPainter.scene(for: look, canvas: toile, date: date, person: person)
            if look.frame != ComposerPhotoFrame.none, scene == nil { throw UnpaintedFrame() }
            let composition = AVMutableVideoComposition(asset: asset) { @Sendable request in
                let declare = declaredSpaceName.flatMap { CGColorSpace(name: $0 as CFString) }
                let image = ComposerLookPainter.paint(request.sourceImage, look: look, framing: framing,
                                                      scene: scene, canvas: toile, declared: declare)
                request.finish(with: image.cropped(to: CGRect(origin: .zero, size: toile)), context: nil)
            }
            guard MeeshyVideoWatermarkBaker.sizesMatch(composition.renderSize, upright) else { return nil }
            composition.renderSize = toile
            composition.colorPrimaries = AVVideoColorPrimaries_P3_D65
            composition.colorTransferFunction = AVVideoTransferFunction_ITU_R_709_2
            composition.colorYCbCrMatrix = AVVideoYCbCrMatrix_ITU_R_709_2
            let mixage = await audioMix(asset, gain: audioGain)
            return await write(asset, composition: composition, audioMix: mixage, timeRange: timeRange)
        } catch {
            Logger.media.error("Live look video export failed: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    private struct UnpaintedFrame: Error {}

    /// **Le son réglé part dans le rendu** (#9754) : chaque piste de son porte
    /// le gain de la retouche ; intact, aucun mixage n'est posé.
    static func audioMix(_ asset: AVAsset, gain: Float) async -> AVAudioMix? {
        guard gain != 1, let pistes = try? await asset.loadTracks(withMediaType: .audio), !pistes.isEmpty else {
            return nil
        }
        let mixage = AVMutableAudioMix()
        mixage.inputParameters = pistes.map { piste in
            let reglage = AVMutableAudioMixInputParameters(track: piste)
            reglage.setVolume(max(0, min(1, gain)), at: .zero)
            return reglage
        }
        return mixage
    }

    private static func write(_ asset: AVAsset, composition: AVVideoComposition, audioMix: AVAudioMix?,
                              timeRange: CMTimeRange?) async -> URL? {
        guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetHighestQuality) else {
            return nil
        }
        let sortie = FileManager.default.temporaryDirectory
            .appendingPathComponent("video_look_\(UUID().uuidString).mov")
        session.outputURL = sortie
        session.outputFileType = .mov
        session.videoComposition = composition
        session.audioMix = audioMix
        // La date de création et le lieu de la prise suivent la vidéo rendue.
        session.metadata = (try? await asset.load(.metadata)) ?? []
        if let timeRange { session.timeRange = timeRange }
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            session.exportAsynchronously { continuation.resume() }
        }
        guard session.status == .completed else {
            FileManager.default.removeItemLogging(at: sortie, context: "rendu du look abandonné", logger: .media)
            return nil
        }
        return sortie
    }
}
