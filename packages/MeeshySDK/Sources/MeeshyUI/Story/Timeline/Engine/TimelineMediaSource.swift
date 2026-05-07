import Foundation
import AVFoundation
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
