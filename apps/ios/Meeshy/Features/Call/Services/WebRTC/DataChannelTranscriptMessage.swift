import CoreGraphics
import Foundation
import MeeshySDK

/// Enveloppe wire du data channel pour une entrée de journal — même patron
/// discriminé par `type` que `DataChannelControlMessage` (`bye`/`ping`).
nonisolated struct DataChannelTranscriptMessage: Codable, Sendable, Equatable {
    let type: String
    let entry: DataChannelTranscriptEntry
}
