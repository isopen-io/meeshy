import Foundation

/// Témoin d'abord (#9867) : la loi de boucle partagée, encore vide.
nonisolated enum ReaderLoopLaw {
    static func shouldRearm(capturedEpoch: UInt64, liveEpoch: UInt64,
                            capturedNode: ObjectIdentifier, liveNode: ObjectIdentifier?) -> Bool {
        false
    }
}
