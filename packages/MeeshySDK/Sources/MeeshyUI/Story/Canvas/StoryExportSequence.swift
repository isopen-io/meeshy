import Foundation
import AVFoundation

/// **Enchaîne des MP4 déjà rendus en un seul fichier** (#9681) — une publication
/// à plusieurs scènes se rend scène par scène (`StoryExporter` ne sait rendre
/// qu'UNE slide), puis ses morceaux se mettent bout à bout, image et son.
///
/// Atome pur : des fichiers en entrée, un fichier en sortie. Quoi enchaîner, et
/// dans quel ordre, se décide côté app.
///
/// Les morceaux sortent tous du même moteur, au même format : la copie sans
/// ré-encodage (`passthrough`) suffit et ne coûte presque rien ; un ré-encodage
/// ne sert que de repli si elle échoue.
public enum StoryExportSequence {

    public static func concatenate(_ parts: [URL], to output: URL) async -> Bool {
        guard !parts.isEmpty, let composition = try? await composition(of: parts) else { return false }
        for preset in [AVAssetExportPresetPassthrough, AVAssetExportPresetHighestQuality] {
            try? FileManager.default.removeItem(at: output)
            guard let session = AVAssetExportSession(asset: composition, presetName: preset) else { continue }
            session.outputURL = output
            session.outputFileType = .mp4
            session.shouldOptimizeForNetworkUse = true
            // `export()` sans argument — même piège que `StoryExportOutro` avec
            // le `export(to:as:)` d'iOS 18.
            await session.export()
            if session.status == .completed { return true }
        }
        try? FileManager.default.removeItem(at: output)
        return false
    }

    private static func composition(of parts: [URL]) async throws -> AVMutableComposition {
        let composition = AVMutableComposition()
        guard let video = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
              let audio = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
        else { throw CocoaError(.fileWriteUnknown) }
        var cursor = CMTime.zero
        for part in parts {
            let asset = AVURLAsset(url: part)
            let duration = try await asset.load(.duration)
            let range = CMTimeRange(start: .zero, duration: duration)
            if let track = try await asset.loadTracks(withMediaType: .video).first {
                if cursor == .zero { video.preferredTransform = try await track.load(.preferredTransform) }
                try video.insertTimeRange(range, of: track, at: cursor)
            } else {
                video.insertEmptyTimeRange(CMTimeRange(start: cursor, duration: duration))
            }
            if let track = try await asset.loadTracks(withMediaType: .audio).first {
                try audio.insertTimeRange(range, of: track, at: cursor)
            } else {
                audio.insertEmptyTimeRange(CMTimeRange(start: cursor, duration: duration))
            }
            cursor = CMTimeAdd(cursor, duration)
        }
        if audio.segments.allSatisfy(\.isEmpty) { composition.removeTrack(audio) }
        return composition
    }
}
