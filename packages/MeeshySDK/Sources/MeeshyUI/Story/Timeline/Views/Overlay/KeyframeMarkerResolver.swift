import Foundation
import MeeshySDK

/// Marqueur de keyframe projeté sur une lane — temps ABSOLU timeline
/// (début du clip + temps relatif du keyframe). Résolution pure, partagée
/// Quick/Pro, testable sans SwiftUI.
public nonisolated struct KeyframeMarker: Equatable, Identifiable, Sendable {
    public let keyframeId: String
    public let clipId: String
    public let absoluteTime: Float

    public var id: String { keyframeId }
}

public enum KeyframeMarkerResolver {

    /// Tous les keyframes du projet (médias + textes — l'audio n'en a pas),
    /// projetés en temps absolu.
    public nonisolated static func resolve(project: TimelineProject) -> [KeyframeMarker] {
        var markers: [KeyframeMarker] = []
        for media in project.mediaObjects {
            let start = Float(media.startTime ?? 0)
            for kf in media.keyframes ?? [] {
                markers.append(KeyframeMarker(
                    keyframeId: kf.id, clipId: media.id, absoluteTime: start + kf.time))
            }
        }
        for text in project.textObjects {
            let start = Float(text.startTime ?? 0)
            for kf in text.keyframes ?? [] {
                markers.append(KeyframeMarker(
                    keyframeId: kf.id, clipId: text.id, absoluteTime: start + kf.time))
            }
        }
        return markers
    }

    /// Marqueurs des clips hébergés par la lane donnée.
    public nonisolated static func markers(
        for laneClipIds: [String],
        in all: [KeyframeMarker]
    ) -> [KeyframeMarker] {
        all.filter { laneClipIds.contains($0.clipId) }
    }
}
