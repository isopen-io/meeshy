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
/// pas rendue couchée — la prise brute repart plutôt que perdue. Le rendu
/// s'écrit en UNE passe au plafond des publications (`VideoEncodePass.render`,
/// #11849).
nonisolated enum ComposerLookVideoExporter {

    /// - Returns: la vidéo regardée, `url` telle quelle sans look, sans cadrage
    ///   et sans découpe, une copie coupée sans ré-encodage quand seule la
    ///   longueur change (`Plan.trimOnly`), `nil` si le rendu a échoué (l'appelant ne remet alors
    ///   rien : le brut porte ce que la découpe et le cadrage ont retiré).
    ///
    /// `@concurrent` : peindre les couches du cadre et monter l'export ne se
    /// fait jamais sur le fil principal, d'où le `✓` l'appelle.
    /// `declaredSpaceName` : l'espace que déclaraient les trames du viseur — le
    /// cube y lit la vidéo comme il y lisait l'aperçu.
    /// `timeRange` : la plage gardée par la découpe (#9353) — elle seule part,
    /// image et son ; `nil` ⇒ le clip entier.
    /// `audioGain` : le son réglé en retouche (#9754), de 0 (muet) à 2 (#10360),
    /// 1 = intact.
    @concurrent
    static func export(_ url: URL, look: ComposerPhotoLook, framing: ComposerFraming = .identity,
                       timeRange: CMTimeRange? = nil, aspect: CGFloat = ComposerLookPainter.designAspect,
                       person: CallFramePerson, date: Date,
                       declaredSpaceName: String? = nil, audioGain: Float = 1) async -> URL? {
        let asset = AVURLAsset(url: url)
        switch plan(look: look, framing: framing, timeRange: timeRange, audioGain: audioGain) {
        case .untouched: return url
        case .trimOnly(let plage): return await trimmed(asset, timeRange: plage)
        case .render: break
        }
        do {
            guard let track = try await asset.loadTracks(withMediaType: .video).first else { return nil }
            let natural = try await track.load(.naturalSize)
            let transform = try await track.load(.preferredTransform)
            let upright = MeeshyVideoWatermarkBaker.orientedSize(natural: natural, transform: transform)
            let toile = ComposerLookPainter.canvas(for: upright, aspect: aspect)
            let scene = ComposerLookPainter.scene(for: look, canvas: toile, date: date, person: person)
            if look.frame != ComposerPhotoFrame.none, scene == nil { throw UnpaintedFrame() }
            let visages = ComposerFaceEffects.export()
            let composition = AVMutableVideoComposition(asset: asset) { @Sendable request in
                let declare = declaredSpaceName.flatMap { CGColorSpace(name: $0 as CFString) }
                let image = ComposerLookPainter.paint(request.sourceImage, look: look, framing: framing,
                                                      scene: scene, canvas: toile, declared: declare,
                                                      faces: visages)
                request.finish(with: image.cropped(to: CGRect(origin: .zero, size: toile)), context: nil)
            }
            guard MeeshyVideoWatermarkBaker.sizesMatch(composition.renderSize, upright) else { return nil }
            composition.renderSize = toile
            composition.colorPrimaries = AVVideoColorPrimaries_P3_D65
            composition.colorTransferFunction = AVVideoTransferFunction_ITU_R_709_2
            composition.colorYCbCrMatrix = AVVideoYCbCrMatrix_ITU_R_709_2
            let mixage = await audioMix(asset, gain: audioGain)
            // La date de création et le lieu de la prise suivent la vidéo rendue.
            let metadonnees = (try? await asset.load(.metadata)) ?? []
            return try await VideoEncodePass.render(asset, composition: composition, audioMix: mixage,
                                                    timeRange: timeRange, metadata: metadonnees,
                                                    context: renderBudget)
        } catch {
            Logger.media.error("Live look video export failed: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    private struct UnpaintedFrame: Error {}

    /// **Le plafond du rendu est celui des publications** (#11849) : une story et
    /// un post (1080×1920, 4 Mb/s) REMUXENT ce fichier dans `compressVideo` au lieu
    /// de le ré-encoder — une seule génération entre la prise et l'envoi. La copie
    /// en galerie est la même : ce qu'on publie est ce qu'on garde, le brut restant
    /// dans Photos quand il y a été écrit (#10284). Un message (720p) le
    /// ré-encode encore, jusqu'à ce que sa définition rejoigne la HD (#11915).
    static let renderBudget: MediaContext = .story

    /// **Ce que l'export doit faire de la prise** (#9889).
    nonisolated enum Plan: Equatable, Sendable {
        /// Rien n'a changé : la prise repart telle quelle.
        case untouched
        /// Seule la longueur change : une copie des échantillons, sans ré-encodage.
        case trimOnly(CMTimeRange)
        /// Un look, un cadrage ou un son réglé : une composition.
        case render
    }

    static func plan(look: ComposerPhotoLook, framing: ComposerFraming, timeRange: CMTimeRange?,
                     audioGain: Float) -> Plan {
        guard !paints(look: look, framing: framing, audioGain: audioGain) else { return .render }
        return timeRange.map(Plan.trimOnly) ?? .untouched
    }

    /// Le look, le cadrage ou le son réglé touchent-ils aux échantillons ?
    static func paints(look: ComposerPhotoLook, framing: ComposerFraming, audioGain: Float) -> Bool {
        ComposerLiveLookRule.rendersLive(look) || !framing.isIdentity || audioGain != 1
    }

    /// **Couper sans retoucher ne ré-encode pas** (#9889, défaut validé de #11247) :
    /// `Passthrough` copie les échantillons compressés. La coupe tombe sur l'image
    /// clé qui précède le début demandé (au plus une seconde plus tôt pour une
    /// prise de l'iPhone), et la piste de découpe le dit.
    private static func trimmed(_ asset: AVAsset, timeRange: CMTimeRange) async -> URL? {
        guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetPassthrough) else {
            return nil
        }
        session.metadata = (try? await asset.load(.metadata)) ?? []
        return await run(session, timeRange: timeRange, name: "video_trim")
    }

    /// **Le son réglé part dans le rendu** (#9754) : chaque piste de son porte
    /// le gain de la retouche, par la loi de l'aperçu (#10360) — l'atténuation
    /// au volume du mixage, l'amplification au-delà de 100 % par le même tap
    /// (`ComposerTakeBoostTap`) ; intact, aucun mixage n'est posé.
    static func audioMix(_ asset: AVAsset, gain: Float) async -> AVAudioMix? {
        guard gain != 1, let pistes = try? await asset.loadTracks(withMediaType: .audio), !pistes.isEmpty else {
            return nil
        }
        let amplification = ComposerTakeGain.boost(gain)
        guard amplification > 1 else {
            let mixage = AVMutableAudioMix()
            mixage.inputParameters = pistes.map { piste in
                let reglage = AVMutableAudioMixInputParameters(track: piste)
                reglage.setVolume(ComposerTakeGain.volume(gain), at: .zero)
                return reglage
            }
            return mixage
        }
        return ComposerTakeBoostTap.audioMix(trackIDs: pistes.map(\.trackID), volume: ComposerTakeGain.volume(gain),
                                             level: ComposerTakeBoostLevel(boost: amplification))
    }

    private static func run(_ session: AVAssetExportSession, timeRange: CMTimeRange?, name: String) async -> URL? {
        let sortie = FileManager.default.temporaryDirectory
            .appendingPathComponent("\(name)_\(UUID().uuidString).mov")
        session.outputURL = sortie
        session.outputFileType = .mov
        session.shouldOptimizeForNetworkUse = true
        if let timeRange { session.timeRange = timeRange }
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            session.exportAsynchronously { continuation.resume() }
        }
        guard session.status == .completed else {
            FileManager.default.removeItemLogging(at: sortie, context: "rendu de la prise abandonné", logger: .media)
            return nil
        }
        return sortie
    }
}
