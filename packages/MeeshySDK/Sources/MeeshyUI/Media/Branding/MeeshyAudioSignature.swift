import AVFoundation
import CoreMedia
import Foundation
import MeeshySDK
import os

/// Appose la signature sonore Meeshy (`MeeshyBrandJingle`) sur un fichier
/// audio enregistré en local — l'équivalent sonore du filigrane apposé sur les
/// images et les vidéos.
///
/// C'est la MÊME signature que celle des exports de story : le carillon
/// synthétisé, identique au sample près sur tous les appareils.
///
/// SDK — atome : une URL d'entrée, une URL de sortie. La décision « quelles
/// familles reçoivent une marque » reste app-side (`MediaSaveBranding`).
public enum MeeshyAudioSignature {

    /// Où poser la signature.
    ///
    /// Le DÉFAUT est `.leading` — la décision produit du plan
    /// (`tasks/media-watermark-plan.md` : « concaténation d'un jingle court en
    /// tête du fichier audio ») : l'annonce se joue avant le contenu, comme
    /// l'interlude de marque ouvre un export de story.
    public enum Placement: Equatable, Sendable {
        /// Avant le contenu — le défaut. La marque annonce Meeshy à chaque
        /// lecture, au prix d'un décalage du contenu de sa durée.
        case leading
        /// Après le contenu. Le son de l'auteur reste audible dès la première
        /// seconde, la marque referme — miroir de la carte de fin des exports.
        case trailing
    }

    /// Silence entre le contenu et la signature : sans lui, le carillon
    /// s'enchaîne au ras du dernier mot et s'entend comme une coupure.
    ///
    /// `nonisolated` : le module (`MeeshyUI`) a `SWIFT_DEFAULT_ACTOR_ISOLATION
    /// = MainActor` (SE-0466), qui isolerait sinon implicitement cette
    /// constante et les fonctions de timing pures ci-dessous — elles sont
    /// appelées hors MainActor par `MeeshyMediaBrandingGeometryTests`, comme
    /// leurs équivalentes de `MeeshyVideoWatermarkBaker`.
    public static nonisolated let gap: TimeInterval = 0.4

    /// Durée de la signature effectivement posée, selon le placement — les
    /// deux motifs de `MeeshyBrandJingle` n'ont pas la même longueur.
    public static nonisolated func signatureDuration(for placement: Placement) -> TimeInterval {
        switch placement {
        case .leading: return MeeshyBrandJingle.duration
        case .trailing: return MeeshyBrandJingle.outroDuration
        }
    }

    public enum SignatureError: Error, Equatable {
        case noAudioTrack
        case compositionFailed
        case exportSessionUnavailable
        case exportFailed(String)
    }

    // MARK: - Timings (purs, testables sans AVFoundation)

    /// Instant d'entrée de la signature dans le fichier produit.
    public static nonisolated func signatureStart(contentDuration: TimeInterval,
                                      placement: Placement = .leading,
                                      gap: TimeInterval = MeeshyAudioSignature.gap) -> TimeInterval {
        switch placement {
        case .trailing: return contentDuration + gap
        case .leading: return 0
        }
    }

    /// Instant d'entrée du CONTENU dans le fichier produit.
    public static nonisolated func contentStart(signatureDuration: TimeInterval = MeeshyBrandJingle.duration,
                                    placement: Placement = .leading,
                                    gap: TimeInterval = MeeshyAudioSignature.gap) -> TimeInterval {
        switch placement {
        case .trailing: return 0
        case .leading: return signatureDuration + gap
        }
    }

    /// Durée totale du fichier produit — dans les deux placements, le contenu,
    /// le silence et la signature s'enchaînent sans se recouvrir.
    public static nonisolated func totalDuration(contentDuration: TimeInterval,
                                     signatureDuration: TimeInterval = MeeshyBrandJingle.duration,
                                     gap: TimeInterval = MeeshyAudioSignature.gap) -> TimeInterval {
        contentDuration + gap + signatureDuration
    }

    // MARK: - Composition

    /// Écrit une copie de `source` précédée (ou suivie) de la signature
    /// sonore, et retourne son URL — un `.m4a`, quel que soit le format
    /// d'entrée, puisque la composition est ré-encodée.
    ///
    /// Ne modifie JAMAIS `source` : c'est très souvent le fichier du cache
    /// disque, qui doit rester la copie fidèle de l'original.
    public static func stampedCopy(of source: URL,
                                   placement: Placement = .leading) async throws -> URL {
        // Le motif suit le placement : l'arpège ASCENDANT ouvre (comme
        // l'interlude d'un export de story), la cadence DESCENDANTE referme
        // (comme sa carte de fin). Un carillon de fermeture posé en tête
        // sonnerait comme une fin au début.
        let jingleURL: URL
        switch placement {
        case .leading: jingleURL = try MeeshyBrandJingle.renderToTemporaryFile()
        case .trailing: jingleURL = try MeeshyBrandJingle.renderOutroToTemporaryFile()
        }
        defer {
            FileManager.default.removeItemLogging(at: jingleURL, context: "audio signature jingle cleanup", logger: .media)
        }

        let asset = AVURLAsset(url: source)
        guard let sourceTrack = try await asset.loadTracks(withMediaType: .audio).first else {
            throw SignatureError.noAudioTrack
        }
        let contentDuration = try await asset.load(.duration)

        let jingleAsset = AVURLAsset(url: jingleURL)
        guard let jingleTrack = try await jingleAsset.loadTracks(withMediaType: .audio).first else {
            throw SignatureError.noAudioTrack
        }
        let jingleDuration = try await jingleAsset.load(.duration)

        let composition = AVMutableComposition()
        guard let track = composition.addMutableTrack(withMediaType: .audio,
                                                      preferredTrackID: kCMPersistentTrackID_Invalid)
        else { throw SignatureError.compositionFailed }

        let contentOffset = CMTime(
            seconds: contentStart(signatureDuration: jingleDuration.seconds, placement: placement),
            preferredTimescale: 600)
        let signatureOffset = CMTime(
            seconds: signatureStart(contentDuration: contentDuration.seconds, placement: placement),
            preferredTimescale: 600)

        // Le silence de séparation est posé EXPLICITEMENT : insérer au-delà de
        // la fin courante d'une piste laisse à AVFoundation le soin de combler,
        // ce qu'on ne veut pas deviner.
        do {
            switch placement {
            case .trailing:
                try track.insertTimeRange(CMTimeRange(start: .zero, duration: contentDuration),
                                          of: sourceTrack, at: contentOffset)
                track.insertEmptyTimeRange(
                    CMTimeRange(start: contentDuration, duration: signatureOffset - contentDuration))
                try track.insertTimeRange(CMTimeRange(start: .zero, duration: jingleDuration),
                                          of: jingleTrack, at: signatureOffset)
            case .leading:
                try track.insertTimeRange(CMTimeRange(start: .zero, duration: jingleDuration),
                                          of: jingleTrack, at: signatureOffset)
                track.insertEmptyTimeRange(
                    CMTimeRange(start: jingleDuration, duration: contentOffset - jingleDuration))
                try track.insertTimeRange(CMTimeRange(start: .zero, duration: contentDuration),
                                          of: sourceTrack, at: contentOffset)
            }
        } catch {
            throw SignatureError.compositionFailed
        }

        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy-branded-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let output = directory.appendingPathComponent(
            source.deletingPathExtension().lastPathComponent + ".m4a")

        guard let session = AVAssetExportSession(asset: composition,
                                                 presetName: AVAssetExportPresetAppleM4A)
        else { throw SignatureError.exportSessionUnavailable }
        session.outputURL = output
        session.outputFileType = .m4a

        await session.export()
        guard session.status == .completed else {
            FileManager.default.removeItemLogging(
                at: directory, context: "audio signature export-failure cleanup", logger: .media,
            )
            throw SignatureError.exportFailed(session.error?.localizedDescription ?? "unknown")
        }
        return output
    }
}
