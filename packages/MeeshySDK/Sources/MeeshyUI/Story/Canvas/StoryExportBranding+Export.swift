import AVFoundation
import Foundation
import os
import MeeshySDK

extension StoryExportBranding {

    private static let exportLogger = MeeshyLog.logger(.storyExportShare, subsystem: .sdk)

    /// Encode la composition emballée en MP4.
    static func export(_ composition: AVMutableComposition,
                       videoComposition: AVMutableVideoComposition,
                       audioMix: AVMutableAudioMix) async throws -> URL {
        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy-story-\(UUID().uuidString).mp4")
        guard let session = AVAssetExportSession(
            asset: composition, presetName: AVAssetExportPresetHighestQuality)
        else { throw BrandingError.compositionTrackUnavailable }
        session.outputURL = outputURL
        session.outputFileType = .mp4
        session.shouldOptimizeForNetworkUse = true
        session.videoComposition = videoComposition
        session.audioMix = audioMix

        // `export()` sans argument — le `export(to:as:)` d'iOS 18 tombe en
        // SIGSEGV combiné à outputURL/outputFileType (même piège que
        // `StoryExportIntro` et `StoryExportOutro`).
        await session.export()
        guard session.status == .completed else {
            try? FileManager.default.removeItem(at: outputURL)
            throw BrandingError.encodingFailed(session.error)
        }
        return outputURL
    }

    /// Un export qui échoue au DÉCODAGE est relancé une fois (#14495).
    ///
    /// `AVFoundationErrorDomain -11821` (« Cannot Decode ») naît dans le
    /// service de décodage, pas dans la composition : le décodeur H.264 lâche
    /// (`VT-DS -8969`) sur le premier export d'un processus quand le service
    /// démarre à peine, et le même export, sur une session neuve, aboutit.
    /// Toute autre erreur est déterministe : la rejouer doublerait l'attente
    /// pour le même échec, elle remonte donc telle quelle à
    /// `StoryExportBrandingFallback`.
    static func exportRetryingDecodeFailure(_ export: () async throws -> URL) async throws -> URL {
        do {
            return try await export()
        } catch let error where isDecodeFailure(error) {
            exportLogger.notice("emballage de marque : décodage refusé, export relancé une fois")
            return try await export()
        }
    }

    private static func isDecodeFailure(_ error: Error) -> Bool {
        guard case BrandingError.encodingFailed(let underlying?) = error else { return false }
        let cause = underlying as NSError
        return cause.domain == AVFoundationErrorDomain && cause.code == AVError.decodeFailed.rawValue
    }
}
