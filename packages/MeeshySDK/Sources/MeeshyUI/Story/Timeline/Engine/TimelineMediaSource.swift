import Foundation
import AVFoundation
import MeeshySDK
#if canImport(UIKit)
import UIKit
#endif

/// Abstraction d'une source media (vidéo, audio, image) consommable par l'engine timeline.
/// Type valeur Sendable, sans état mutable, jamais lié à l'UI.
public struct TimelineMediaSource: Sendable, Identifiable, Equatable {

    public enum Kind: String, Sendable, Equatable {
        case video
        case audio
        case image
    }

    public nonisolated let id: String
    public nonisolated let kind: Kind
    public nonisolated let url: URL?

    public nonisolated init(id: String, kind: Kind, url: URL?) {
        self.id = id
        self.kind = kind
        self.url = url
    }
}

public extension TimelineMediaSource {

    /// Construit une source depuis un `StoryMediaObject`. Retourne `nil` si le `mediaType`
    /// n'est pas reconnu (`image` ou `video` uniquement).
    nonisolated static func fromMediaObject(
        _ media: StoryMediaObject,
        videoURLs: [String: URL],
        audioURLs: [String: URL]
    ) -> TimelineMediaSource? {
        switch media.kind {
        case .image:
            return TimelineMediaSource(id: media.id, kind: .image, url: nil)
        case .video:
            return TimelineMediaSource(id: media.id, kind: .video, url: videoURLs[media.id])
        case .none:
            return nil
        }
    }

    /// Construit une source depuis un `StoryAudioPlayerObject`. Retourne toujours `.audio`.
    nonisolated static func fromAudioObject(
        _ audio: StoryAudioPlayerObject,
        audioURLs: [String: URL]
    ) -> TimelineMediaSource? {
        TimelineMediaSource(id: audio.id, kind: .audio, url: audioURLs[audio.id])
    }
}

public enum TimelineMediaSourceError: Error, Equatable, Sendable {
    case missingURL
    case notApplicableForImage
    case assetLoadFailed(String)
}

public extension TimelineMediaSource {
    /// Charge l'asset AVFoundation associé en chargeant `.tracks` et `.duration` de manière asynchrone.
    /// Throws si le kind est `.image` (pas d'asset AV) ou si l'URL est nil ou si le chargement échoue.
    nonisolated func loadAsset() async throws -> AVURLAsset {
        guard kind != .image else {
            throw TimelineMediaSourceError.notApplicableForImage
        }
        guard let url else {
            throw TimelineMediaSourceError.missingURL
        }
        let asset = AVURLAsset(url: url, options: [
            AVURLAssetPreferPreciseDurationAndTimingKey: true
        ])
        do {
            _ = try await asset.load(.tracks, .duration)
            return asset
        } catch {
            throw TimelineMediaSourceError.assetLoadFailed(error.localizedDescription)
        }
    }
}
