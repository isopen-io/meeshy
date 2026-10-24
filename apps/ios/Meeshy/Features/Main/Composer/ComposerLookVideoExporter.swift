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
/// pas rendue couchée — la prise brute repart plutôt que perdue. Chaque rendu
/// s'écrit en UNE passe (`VideoEncodePass.render`, #11849) : la copie de
/// l'utilisateur à la définition de la source, l'envoi au plafond des publications.
nonisolated enum ComposerLookVideoExporter {

    /// - Returns: pour chaque usage demandé (`uses`), la vidéo regardée : `url`
    ///   telle quelle sans look, sans cadrage et sans découpe ; une copie coupée
    ///   sans ré-encodage quand seule la longueur change (`Plan.trimOnly`), la même
    ///   pour la galerie et l'envoi ; sinon un rendu PAR usage, chacun encodé une
    ///   fois. `nil` si un rendu a échoué — tout ou rien, aucun fichier ne traîne
    ///   (l'appelant ne remet alors rien : le brut porte ce que la découpe et le
    ///   cadrage ont retiré).
    ///
    /// `@concurrent` : peindre les couches du cadre et monter l'export ne se
    /// fait jamais sur le fil principal, d'où le `✓` l'appelle.
    /// `uses` : la copie de l'utilisateur en galerie (définition et HDR de la
    /// source) et/ou l'envoi (budget des publications) — correction porteur du
    /// tour 4 de #11849 : seul l'envoi suit le budget d'envoi.
    /// `declaredSpaceName` : l'espace que déclaraient les trames du viseur — le
    /// cube y lit la vidéo comme il y lisait l'aperçu.
    /// `timeRange` : la plage gardée par la découpe (#9353) — elle seule part,
    /// image et son ; `nil` ⇒ le clip entier.
    /// `audioGain` : le son réglé en retouche (#9754), de 0 (muet) à 2 (#10360),
    /// 1 = intact.
    @concurrent
    static func export(_ url: URL, look: ComposerPhotoLook, framing: ComposerFraming = .identity,
                       timeRange: CMTimeRange? = nil, aspect: CGFloat = ComposerLookPainter.designAspect,
                       person: CallFramePerson, date: Date, uses: ComposerVideoUses = .gallery,
                       declaredSpaceName: String? = nil, audioGain: Float = 1,
                       overlay: ComposerTextOverlay? = nil) async -> ComposerVideoRendition? {
        let asset = AVURLAsset(url: url)
        switch plan(look: look, framing: framing, timeRange: timeRange, audioGain: audioGain, hasOverlay: overlay != nil) {
        case .untouched: return ComposerVideoRendition(same: url, uses: uses)
        case .trimOnly(let plage): return await trimmed(asset, timeRange: plage).map { ComposerVideoRendition(same: $0, uses: uses) }
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
                                                      faces: visages, overlay: overlay)
                request.finish(with: image.cropped(to: CGRect(origin: .zero, size: toile)), context: nil)
            }
            guard MeeshyVideoWatermarkBaker.sizesMatch(composition.renderSize, upright) else { return nil }
            composition.renderSize = toile
            let couleurs = compositionColors(source: try await track.load(.formatDescriptions).first
                .flatMap(VideoColorTagging.properties(of:)))
            composition.colorPrimaries = couleurs[AVVideoColorPrimariesKey]
            composition.colorTransferFunction = couleurs[AVVideoTransferFunctionKey]
            composition.colorYCbCrMatrix = couleurs[AVVideoYCbCrMatrixKey]
            let mixage = await audioMix(asset, gain: audioGain)
            // La date de création et le lieu de la prise suivent la vidéo rendue.
            let metadonnees = (try? await asset.load(.metadata)) ?? []
            let rendus = try await renderEach(targets(for: uses), asset: asset, composition: composition,
                                              audioMix: mixage, timeRange: timeRange, metadata: metadonnees)
            return ComposerVideoRendition(rendered: rendus, uses: uses)
        } catch {
            Logger.media.error("Live look video export failed: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    private struct UnpaintedFrame: Error {}

    /// **Le plafond de l'ENVOI est celui des publications** (#11849) : une story et
    /// un post (1080×1920, 4 Mb/s) REMUXENT ce fichier dans `compressVideo` au lieu
    /// de le ré-encoder — une seule génération entre la prise et l'envoi. La copie
    /// en galerie, elle, garde la définition et le HDR de la source (correction
    /// porteur, tour 4). Un message suit le même chemin dès que sa définition
    /// rejoint la HD (#11915).
    static let renderBudget: MediaContext = .story

    /// La composition émet les couleurs de la prise quand elle est HDR (HLG, PQ) :
    /// la retouche ne la ramène pas en SDR. Sinon, Display P3 comme l'aperçu (#9329).
    static func compositionColors(source tags: [String: String]?) -> [String: String] {
        guard let tags, VideoSourceTraits(colorTags: tags, nominalFrameRate: 0, audioChannelCount: nil).isHDR else {
            return [AVVideoColorPrimariesKey: AVVideoColorPrimaries_P3_D65,
                    AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
                    AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2]
        }
        return tags
    }

    /// La galerie d'abord, l'envoi ensuite — dans l'ordre de `ComposerVideoRendition`.
    private static func targets(for uses: ComposerVideoUses) -> [VideoRenderTarget] {
        [(ComposerVideoUses.gallery, VideoRenderTarget.sourceDefinition),
         (ComposerVideoUses.delivery, VideoRenderTarget.sending(renderBudget))]
            .filter { uses.contains($0.0) }
            .map { $0.1 }
    }

    /// Un rendu par cible, l'un après l'autre (une composition ne se lit pas à
    /// deux en même temps) ; un échec efface ceux déjà écrits.
    private static func renderEach(_ targets: [VideoRenderTarget], asset: AVAsset, composition: AVVideoComposition,
                                   audioMix: AVAudioMix?, timeRange: CMTimeRange?,
                                   metadata: [AVMetadataItem]) async throws -> [URL] {
        guard let cible = targets.first else { return [] }
        let rendu = try await VideoEncodePass.render(asset, composition: composition, audioMix: audioMix,
                                                     timeRange: timeRange, metadata: metadata, target: cible)
        do {
            return [rendu] + (try await renderEach(Array(targets.dropFirst()), asset: asset, composition: composition,
                                                   audioMix: audioMix, timeRange: timeRange, metadata: metadata))
        } catch {
            try? FileManager.default.removeItem(at: rendu)
            throw error
        }
    }

    /// **Ce que l'export doit faire de la prise** (#9889).
    nonisolated enum Plan: Equatable, Sendable {
        /// Rien n'a changé : la prise repart telle quelle.
        case untouched
        /// Seule la longueur change : une copie des échantillons, sans ré-encodage.
        case trimOnly(CMTimeRange)
        /// Un look, un cadrage ou un son réglé : une composition.
        case render
    }

    /// `hasOverlay` : un texte posé par-dessus (#12591) touche aux échantillons, comme un look.
    static func plan(look: ComposerPhotoLook, framing: ComposerFraming, timeRange: CMTimeRange?,
                     audioGain: Float, hasOverlay: Bool = false) -> Plan {
        guard !hasOverlay, !paints(look: look, framing: framing, audioGain: audioGain) else { return .render }
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

/// Les usages d'un rendu vidéo : la copie de l'utilisateur, l'envoi, ou les deux.
nonisolated struct ComposerVideoUses: OptionSet, Sendable {
    let rawValue: Int
    static let gallery = ComposerVideoUses(rawValue: 1)
    static let delivery = ComposerVideoUses(rawValue: 2)
}

/// Les fichiers d'un rendu, un par usage demandé ; le même fichier quand rien
/// n'est ré-encodé (brut, découpe sans retouche).
nonisolated struct ComposerVideoRendition: Equatable, Sendable {
    let gallery: URL?
    let delivery: URL?

    init(gallery: URL?, delivery: URL?) {
        self.gallery = gallery
        self.delivery = delivery
    }

    init(same url: URL, uses: ComposerVideoUses) {
        self.init(gallery: uses.contains(.gallery) ? url : nil, delivery: uses.contains(.delivery) ? url : nil)
    }

    /// `rendered` suit l'ordre des cibles : la galerie d'abord, l'envoi ensuite.
    init(rendered: [URL], uses: ComposerVideoUses) {
        let galerie = uses.contains(.gallery) ? rendered.first : nil
        self.init(gallery: galerie, delivery: uses.contains(.delivery) ? rendered.last : nil)
    }

    /// Le fichier de galerie à effacer une fois écrit, s'il n'est ni la prise ni l'envoi.
    func galleryLeftover(original: URL) -> URL? {
        gallery.flatMap { $0 == original || $0 == delivery ? nil : $0 }
    }
}

/// **Le chemin UNIQUE d'une vidéo vers Photos** (#9684) — miniature, flèche ⬇︎ et
/// « Terminé ». Un rendu distinct s'écrit ; un rendu identique à l'original ne
/// s'écrit que si l'original n'y est pas déjà — un FAIT de la prise (son brut écrit
/// par la caméra), jamais une lecture du réglage. `true` : la prise est dans Photos.
@MainActor
enum ComposerVideoGalleryCopy {
    static func write(_ rendue: URL, original: URL, originalInLibrary: Bool,
                      gallery: any ComposerGalleryProviding) async -> Bool {
        guard rendue != original || !originalInLibrary else { return true }
        return await gallery.saveVideo(at: rendue)
    }
}
