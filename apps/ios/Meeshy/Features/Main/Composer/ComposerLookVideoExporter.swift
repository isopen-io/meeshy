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
/// chaîne que l'aperçu — colorimétrie de l'appel, puis compositeur de son cadre
/// en direct. Même précédent que le filigrane (`MeeshyVideoWatermarkBaker`) :
/// `applyingCIFiltersWithHandler` redresse la source et cale la toile sur la
/// piste transformée, et une vidéo dont l'orientation ne serait pas tenue n'est
/// pas rendue couchée — la prise brute repart plutôt que perdue.
nonisolated enum ComposerLookVideoExporter {

    /// - Returns: la vidéo regardée, `url` telle quelle sans look, `nil` si le
    ///   rendu a échoué (l'appelant garde alors la prise brute).
    static func export(_ url: URL, look: ComposerPhotoLook, person: CallFramePerson,
                       texts: CallFrameTexts) async -> URL? {
        guard ComposerLiveLookRule.rendersLive(look) else { return url }
        let asset = AVURLAsset(url: url)
        do {
            guard let track = try await asset.loadTracks(withMediaType: .video).first else { return nil }
            let natural = try await track.load(.naturalSize)
            let transform = try await track.load(.preferredTransform)
            let upright = MeeshyVideoWatermarkBaker.orientedSize(natural: natural, transform: transform)
            let toile = ComposerLiveLookRule.exportSize(for: look, upright: upright)
            let scene = try paintedScene(for: look, person: person, texts: texts, size: toile)
            let compositor = CallLiveFrameCompositor()
            let filter = look.filter
            let personId = person.id
            let composition = AVMutableVideoComposition(asset: asset) { @Sendable request in
                let graded = ComposerLiveLookRule.graded(request.sourceImage, filter: filter)
                let image = scene.map { compositor.compose($0, videos: [personId: graded]) } ?? graded
                request.finish(with: image.cropped(to: CGRect(origin: .zero, size: toile)), context: nil)
            }
            guard MeeshyVideoWatermarkBaker.sizesMatch(composition.renderSize, upright) else { return nil }
            composition.renderSize = toile
            composition.colorPrimaries = AVVideoColorPrimaries_P3_D65
            composition.colorTransferFunction = AVVideoTransferFunction_ITU_R_709_2
            composition.colorYCbCrMatrix = AVVideoYCbCrMatrix_ITU_R_709_2
            return await write(asset, composition: composition)
        } catch {
            Logger.media.error("Live look video export failed: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    private struct UnpaintedFrame: Error {}

    /// Les couches du cadre, peintes une fois pour toute la vidéo.
    private static func paintedScene(for look: ComposerPhotoLook, person: CallFramePerson,
                                     texts: CallFrameTexts, size: CGSize) throws -> CallLiveFrameScene? {
        guard let design = ComposerLiveLookRule.design(for: look.frame) else { return nil }
        let inputs = CallLiveFrameLayerInputs(frameId: design.id, people: [person], texts: texts, size: size)
        guard let scene = CallLiveFrameCompositor().paint(design: design, inputs: inputs) else {
            throw UnpaintedFrame()
        }
        return scene
    }

    private static func write(_ asset: AVAsset, composition: AVVideoComposition) async -> URL? {
        guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetHighestQuality) else {
            return nil
        }
        let sortie = FileManager.default.temporaryDirectory
            .appendingPathComponent("video_look_\(UUID().uuidString).mov")
        session.outputURL = sortie
        session.outputFileType = .mov
        session.videoComposition = composition
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
