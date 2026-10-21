import CoreGraphics
import Foundation
import MeeshySDK

/// Routage typé des messages entrants du data channel. Pur et testable :
/// une seule passe de décodage décide bye / entrée de journal de
/// transcription / bruit (ping keep-alive, payload inconnu d'une version
/// future).
/// `nonisolated` : value type pur, décodable depuis n'importe quel contexte
/// (le callback data channel WebRTC arrive hors main thread).
nonisolated enum DataChannelInbound: Equatable {
    case bye(reason: String?)
    case transcriptEntry(DataChannelTranscriptEntry)
    case ignored

    static func decode(_ data: Data) -> DataChannelInbound {
        if let control = try? JSONDecoder().decode(DataChannelControlMessage.self, from: data),
           control.type == "bye" {
            return .bye(reason: control.reason)
        }
        if let message = try? JSONDecoder().decode(DataChannelTranscriptMessage.self, from: data),
           message.type == "transcript-entry" {
            return .transcriptEntry(message.entry)
        }
        return .ignored
    }
}
