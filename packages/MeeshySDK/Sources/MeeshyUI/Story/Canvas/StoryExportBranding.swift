import AVFoundation
import CoreGraphics
import CoreMedia
import CryptoKit
import Foundation
import MeeshySDK

/// Emballage de marque d'un export de story — interlude d'identité en tête et
/// carte de fin en queue — appliqué en **une seule passe d'encodage**.
///
/// ## Pourquoi une passe unique
///
/// `StoryExportIntro.prepend` et `StoryExportOutro.append` posent chacune
/// quelques secondes de marque, mais chacune ré-encode la story ENTIÈRE : leur
/// `AVMutableVideoCompositionInstruction` couvre toute la timeline, ce qui
/// interdit tout passthrough à `AVAssetExportSession`. Enchaînées après le bake,
/// elles portaient le coût d'un export à **trois** encodages complets du même
/// contenu, dont deux n'existaient que pour coller 3 s de marque.
///
/// Les deux fonctions historiques restent en place — elles sont publiques et
/// testées pièce par pièce — mais les chemins produits passent par ici.
///
/// SDK — atome : ne prend que des paramètres opaques (une URL, une identité
/// plate, une taille). L'orchestration (quand emballer, quelle identité)
/// reste app-side.
public enum StoryExportBranding {

    public enum BrandingError: Error {
        case compositionTrackUnavailable
        case introRenderFailed
        case encodingFailed(Error?)
    }

    /// Chevauchement de la carte de fin sur la fin de la story — miroir exact
    /// de `StoryExportOutro.append`.
    static let outroOverlap: TimeInterval = 1.5

    // MARK: - Plan de marque (passe unique)

    /// Tout ce dont `StoryExporter` a besoin pour composer la marque DANS le
    /// bake, en une seule passe d'encodage.
    ///
    /// Les clips sont des fichiers déjà encodés et mémoïsés : le bake les
    /// insère comme pistes et le compositor les compose par opacité. Rien n'est
    /// re-rendu, rien n'est ré-encodé une deuxième fois.
    public struct Plan: Sendable {
        /// Interlude d'identité. `nil` quand aucune identité n'a été résolue —
        /// la story démarre alors à zéro.
        public let introClip: URL?
        public let introJingle: URL?
        /// Carte de fin — toujours présente, elle ne dépend d'aucune identité.
        public let outroClip: URL
        public let outroJingle: URL
        /// Décalage de la story dans la composition finale.
        public let storyStart: CMTime
        /// Fenêtre du fondu d'ouverture (vide quand il n'y a pas d'interlude).
        public let introFade: CMTimeRange
        /// Durée du clip de fin, et décalage de son jingle par rapport à son début.
        public let outroDuration: CMTime
        public let outroJingleOffset: CMTime
    }

    /// Résout le plan de marque : encode (ou récupère du cache) les clips et
    /// les signatures sonores, et calcule les timings.
    ///
    /// Miroir exact des timings de `wrap` — c'est ce qui rend les deux chemins
    /// interchangeables et permet aux tests de les comparer.
    public static func makePlan(intro: StoryExportIntroContent?,
                                outro: StoryExportIntroContent?,
                                renderSize: CGSize) async throws -> Plan {
        var introClip: URL?
        var introJingle: URL?
        var storyStart = CMTime.zero
        var introFade = CMTimeRange(start: .zero, duration: .zero)

        if let intro {
            guard let image = StoryExportIntro.render(intro, size: renderSize) else {
                throw BrandingError.introRenderFailed
            }
            introClip = try await StoryExportIntro.makeClip(
                image: image, duration: StoryExportIntro.clipDuration, size: renderSize)
            introJingle = try await brandJingle(.intro)
            storyStart = CMTime(seconds: StoryExportIntro.holdDuration, preferredTimescale: 600)
            introFade = CMTimeRange(
                start: storyStart,
                duration: CMTime(seconds: StoryExportIntro.crossfadeDuration,
                                 preferredTimescale: 600))
        }

        let outroClip = try await brandOutroClip(size: renderSize, content: outro)
        let outroDuration = try await AVURLAsset(url: outroClip).load(.duration)

        return Plan(
            introClip: introClip,
            introJingle: introJingle,
            outroClip: outroClip,
            outroJingle: try await brandJingle(.outro),
            storyStart: storyStart,
            introFade: introFade,
            outroDuration: outroDuration,
            // Avec une identité peinte, le logo termine la vidéo en silence et
            // le jingle n'entre qu'à la 2ᵉ phase — miroir de `wrap`.
            outroJingleOffset: outro != nil
                ? CMTime(seconds: StoryExportOutro.logoPhase, preferredTimescale: 600)
                : .zero
        )
    }

    // MARK: - Artefacts de marque mis en cache

    /// Les deux signatures sonores de la marque.
    public enum Jingle: String {
        case intro, outro
    }

    /// Retourne la signature sonore demandée, synthétisée une seule fois.
    ///
    /// `MeeshyBrandJingle` rend un PCM **entièrement déterministe** (un motif
    /// de notes figé) puis l'écrit en M4A. Le refaire à chaque export était du
    /// calcul pur perdu.
    public static func brandJingle(_ jingle: Jingle) async throws -> URL {
        try await cachedArtifact(key: "meeshy-brand-jingle-\(jingle.rawValue).m4a") {
            switch jingle {
            case .intro: return try MeeshyBrandJingle.renderToTemporaryFile()
            case .outro: return try MeeshyBrandJingle.renderOutroToTemporaryFile()
            }
        }
    }

    /// Retourne le clip de la carte de fin, encodé une seule fois par gabarit
    /// et par identité peinte.
    ///
    /// `StoryExportOutro.makeClip` rend 105 frames par CoreGraphics puis les
    /// encode en H.264 — ~1,8 s mesurées, soit près de 30 % du temps total d'un
    /// export de 10 s. Or le résultat ne dépend QUE de `size` et de `content` :
    /// deux exports successifs du même auteur produisaient deux fois le même
    /// fichier.
    ///
    /// La clé porte un digest de TOUT ce que la carte peint — y compris les
    /// octets de l'avatar et de la bannière. Une identité modifiée produit donc
    /// une clé différente : aucune carte périmée ne peut être servie.
    public static func brandOutroClip(size: CGSize,
                                      content: StoryExportIntroContent?) async throws -> URL {
        let identity = content.map(identityDigest) ?? "logo"
        let key = "meeshy-brand-outro-\(Int(size.width))x\(Int(size.height))-\(identity).mp4"
        return try await cachedArtifact(key: key) {
            try await StoryExportOutro.makeClip(size: size, content: content)
        }
    }

    /// Empreinte de tout ce qui est peint sur la carte d'identité.
    ///
    /// Les images passent par leurs OCTETS (`dataProvider`) et non par leurs
    /// dimensions : un avatar remplacé au même gabarit doit invalider l'entrée.
    /// `SHA256` et non `Hasher` — `hasher.combine(Data)` n'échantillonne qu'un
    /// préfixe des octets, ce qui laisserait passer deux images de même en-tête.
    private static func identityDigest(_ content: StoryExportIntroContent) -> String {
        var hasher = SHA256()
        for field in [content.displayName, content.username,
                      content.moodEmoji ?? "", content.moodMessage ?? "",
                      content.accentColorHex] {
            hasher.update(data: Data(field.utf8))
            hasher.update(data: Data([0x1f]))   // séparateur : évite les collisions par concaténation
        }
        for image in [content.avatar, content.banner] {
            if let bytes = image?.dataProvider?.data as Data? {
                hasher.update(data: bytes)
            }
            hasher.update(data: Data([0x1e]))
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined().prefix(16).description
    }

    /// Mémoïse un artefact de marque sur disque via `CacheCoordinator.video`.
    /// Même patron que `StoryExporter.syntheticTransparentAsset`.
    private static func cachedArtifact(key: String,
                                       make: () async throws -> URL) async throws -> URL {
        if let cached = CacheCoordinator.videoLocalFileURL(for: key) {
            return cached
        }
        let generated = try await make()
        defer { try? FileManager.default.removeItem(at: generated) }
        let data = try Data(contentsOf: generated)
        await CacheCoordinator.shared.video.save(data, for: key)
        guard let cached = CacheCoordinator.videoLocalFileURL(for: key) else {
            // Cache indisponible (budget saturé, disque plein) : l'export doit
            // aboutir quand même. On rend une copie temporaire que l'appelant
            // supprimera — dégradé en vitesse, jamais en résultat.
            let fallback = FileManager.default.temporaryDirectory
                .appendingPathComponent("meeshy-brand-\(UUID().uuidString)-\(key)")
            try data.write(to: fallback)
            return fallback
        }
        return cached
    }

    /// Compose `storyURL` avec son emballage de marque et retourne le MP4 final.
    ///
    /// - Parameters:
    ///   - storyURL: le MP4 de la story, tel que produit par `StoryExporter`.
    ///   - intro: identité peinte sur l'interlude d'ENTRÉE. `nil` (course
    ///     réseau, première installation) le supprime mais **pas** la carte de
    ///     fin, qui ne dépend d'aucune identité — invariant posé en revue le
    ///     2026-07-26 et conservé ici.
    ///   - outro: identité peinte sur la carte de FIN. Non-nil déclenche la
    ///     fermeture en 2 temps (logo muet puis carte d'auteur portant le
    ///     jingle) ; `nil` donne la carte logo-seule. Paramètre distinct
    ///     d'`intro` parce que les deux chemins produits divergent : le partage
    ///     et l'enregistrement Photos peignent l'auteur en fermeture, l'export
    ///     depuis le composer timeline ferme sur le logo seul.
    ///   - renderSize: gabarit du MP4 final — celui de la story.
    /// - Returns: l'URL du MP4 assemblé. L'appelant en est propriétaire.
    public static func wrap(storyURL: URL,
                            intro: StoryExportIntroContent?,
                            outro: StoryExportIntroContent?,
                            renderSize: CGSize) async throws -> URL {
        let storyAsset = AVURLAsset(url: storyURL)
        let storyDuration = try await storyAsset.load(.duration)

        let composition = AVMutableComposition()
        var temporaryFiles: [URL] = []
        defer { temporaryFiles.forEach { try? FileManager.default.removeItem(at: $0) } }

        // La story démarre après la tenue de l'interlude quand il y en a un.
        let storyStart = intro != nil
            ? CMTime(seconds: StoryExportIntro.holdDuration, preferredTimescale: 600)
            : .zero
        let baseEnd = CMTimeAdd(storyStart, storyDuration)

        guard let storyVideo = composition.addMutableTrack(
                withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
              let storyAudioTrack = composition.addMutableTrack(
                withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
        else { throw BrandingError.compositionTrackUnavailable }

        let storyRange = CMTimeRange(start: .zero, duration: storyDuration)
        if let sv = try await storyAsset.loadTracks(withMediaType: .video).first {
            try storyVideo.insertTimeRange(storyRange, of: sv, at: storyStart)
        }
        if let sa = try await storyAsset.loadTracks(withMediaType: .audio).first {
            try storyAudioTrack.insertTimeRange(storyRange, of: sa, at: storyStart)
        } else {
            // Story muette : sans ce silence explicite, la piste audio s'arrête
            // avec le jingle et certains lecteurs tronquent la vidéo à cette durée.
            storyAudioTrack.insertEmptyTimeRange(
                CMTimeRange(start: storyStart, duration: storyDuration))
        }

        let storyLayer = AVMutableVideoCompositionLayerInstruction(assetTrack: storyVideo)
        let storyAudioParams = AVMutableAudioMixInputParameters(track: storyAudioTrack)
        var introLayer: AVMutableVideoCompositionLayerInstruction?
        var audioParameters: [AVMutableAudioMixInputParameters] = []

        // Fin du fondu d'entrée — borne basse du fondu de sortie plus bas, pour
        // que les deux rampes d'opacité de la couche story restent disjointes.
        var introFadeEnd = CMTime.zero

        // MARK: Interlude d'identité
        if let intro {
            guard let image = StoryExportIntro.render(intro, size: renderSize) else {
                throw BrandingError.introRenderFailed
            }
            let introURL = try await StoryExportIntro.makeClip(
                image: image, duration: StoryExportIntro.clipDuration, size: renderSize)
            temporaryFiles.append(introURL)
            // Artefact de marque mémoïsé — surtout PAS dans `temporaryFiles`,
            // qui est purgé en sortie : ce fichier appartient au cache.
            let jingleURL = try await brandJingle(.intro)

            guard let introVideo = composition.addMutableTrack(
                    withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
                  let jingleTrack = composition.addMutableTrack(
                    withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
            else { throw BrandingError.compositionTrackUnavailable }

            let introAsset = AVURLAsset(url: introURL)
            let introDuration = try await introAsset.load(.duration)
            if let iv = try await introAsset.loadTracks(withMediaType: .video).first {
                try introVideo.insertTimeRange(
                    CMTimeRange(start: .zero, duration: introDuration), of: iv, at: .zero)
            }
            let jingleAsset = AVURLAsset(url: jingleURL)
            let jingleDuration = try await jingleAsset.load(.duration)
            if let ja = try await jingleAsset.loadTracks(withMediaType: .audio).first {
                try jingleTrack.insertTimeRange(
                    CMTimeRange(start: .zero, duration: jingleDuration), of: ja, at: .zero)
            }

            // Crossfade symétrique : l'interlude s'efface, la story se révèle.
            let fade = CMTimeRange(
                start: storyStart,
                duration: CMTime(seconds: StoryExportIntro.crossfadeDuration,
                                 preferredTimescale: 600))
            introFadeEnd = CMTimeAdd(fade.start, fade.duration)

            let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: introVideo)
            layer.setOpacityRamp(fromStartOpacity: 1, toEndOpacity: 0, timeRange: fade)
            introLayer = layer
            storyLayer.setOpacityRamp(fromStartOpacity: 0, toEndOpacity: 1, timeRange: fade)

            let jingleParams = AVMutableAudioMixInputParameters(track: jingleTrack)
            jingleParams.setVolumeRamp(fromStartVolume: 1, toEndVolume: 0, timeRange: fade)
            audioParameters.append(jingleParams)
        }

        // MARK: Carte de fin
        let overlap = CMTime(seconds: outroOverlap, preferredTimescale: 600)
        let rawOutroStart = CMTimeSubtract(baseEnd, overlap)
        // Deux bornes : jamais avant le début du temps, et jamais à l'intérieur
        // du fondu d'entrée — deux rampes d'opacité qui se chevauchent sur la
        // MÊME couche ne se multiplient pas (contrairement à ce que produisait
        // la chaîne en deux passes, où la seconde s'appliquait sur un fichier
        // déjà baké). Sans cette borne une story plus courte que
        // `holdDuration + outroOverlap` verrait sa rampe d'entrée écrasée.
        let outroStart = max(max(rawOutroStart, .zero), introFadeEnd)
        let outroFade = CMTimeRange(start: outroStart,
                                    duration: CMTimeSubtract(baseEnd, outroStart))

        // Les deux artefacts les plus coûteux du pipeline de marque, mémoïsés :
        // la carte de fin (105 frames CoreGraphics + H.264) et la signature
        // sonore de fermeture. Ni l'un ni l'autre ne dépend de la story.
        let outroURL = try await brandOutroClip(size: renderSize, content: outro)
        let outroJingleURL = try await brandJingle(.outro)

        guard let outroVideo = composition.addMutableTrack(
                withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
              let outroJingleTrack = composition.addMutableTrack(
                withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
        else { throw BrandingError.compositionTrackUnavailable }

        let outroAsset = AVURLAsset(url: outroURL)
        let outroDuration = try await outroAsset.load(.duration)
        if let ov = try await outroAsset.loadTracks(withMediaType: .video).first {
            try outroVideo.insertTimeRange(
                CMTimeRange(start: .zero, duration: outroDuration), of: ov, at: outroStart)
        }
        // Le jingle démarre avec le logo (carte logo-seule) OU à la 2ᵉ phase
        // quand une identité est peinte — le logo termine alors en silence.
        let outroJingleStart = outro != nil
            ? CMTimeAdd(outroStart, CMTime(seconds: StoryExportOutro.logoPhase,
                                           preferredTimescale: 600))
            : outroStart
        let outroJingleAsset = AVURLAsset(url: outroJingleURL)
        let outroJingleDuration = try await outroJingleAsset.load(.duration)
        if let oa = try await outroJingleAsset.loadTracks(withMediaType: .audio).first {
            try outroJingleTrack.insertTimeRange(
                CMTimeRange(start: .zero, duration: outroJingleDuration),
                of: oa, at: outroJingleStart)
        }

        let outroLayer = AVMutableVideoCompositionLayerInstruction(assetTrack: outroVideo)
        outroLayer.setOpacityRamp(fromStartOpacity: 0, toEndOpacity: 1, timeRange: outroFade)
        storyLayer.setOpacityRamp(fromStartOpacity: 1, toEndOpacity: 0, timeRange: outroFade)
        storyAudioParams.setVolumeRamp(fromStartVolume: 1, toEndVolume: 0, timeRange: outroFade)
        audioParameters.append(storyAudioParams)

        let totalDuration = CMTimeAdd(outroStart, outroDuration)

        let instruction = AVMutableVideoCompositionInstruction()
        instruction.timeRange = CMTimeRange(start: .zero, duration: totalDuration)
        // Premier élément = couche de devant. La carte de fin couvre la story,
        // qui couvre l'interlude.
        instruction.layerInstructions = [outroLayer, storyLayer, introLayer].compactMap { $0 }

        let videoComposition = AVMutableVideoComposition()
        videoComposition.instructions = [instruction]
        videoComposition.frameDuration = StoryExportFrameRate.frameDuration
        videoComposition.renderSize = renderSize

        let audioMix = AVMutableAudioMix()
        audioMix.inputParameters = audioParameters

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy-story-\(UUID().uuidString).mp4")
        guard let session = AVAssetExportSession(
            asset: composition, presetName: AVAssetExportPresetHighestQuality)
        else { throw BrandingError.compositionTrackUnavailable }
        session.outputURL = outputURL
        session.outputFileType = .mp4
        session.videoComposition = videoComposition
        session.audioMix = audioMix

        // `export()` sans argument — le `export(to:as:)` d'iOS 18 tombe en
        // SIGSEGV combiné à outputURL/outputFileType (même piège que
        // `StoryExportIntro` et `StoryExportOutro`).
        await session.export()
        guard session.status == .completed else {
            throw BrandingError.encodingFailed(session.error)
        }
        return outputURL
    }
}
