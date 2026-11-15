import Foundation

/// Ce qu'un lecteur demande à un fichier qui se remplit (#9881) : une plage
/// d'octets, déjà en partie servie (`currentOffset`).
public struct ProgressiveRangeRequest: Sendable, Equatable {
    public let requestedOffset: Int64
    public let requestedLength: Int64
    public let currentOffset: Int64
    public let toEndOfResource: Bool

    public init(requestedOffset: Int64, requestedLength: Int64, currentOffset: Int64, toEndOfResource: Bool) {
        self.requestedOffset = requestedOffset
        self.requestedLength = requestedLength
        self.currentOffset = currentOffset
        self.toEndOfResource = toEndOfResource
    }
}

/// Où en est le fichier : octets arrivés en tête, taille annoncée, fin.
public struct ProgressiveFileState: Sendable, Equatable {
    public let availableBytes: Int64
    public let expectedBytes: Int64?
    public let isComplete: Bool

    public init(availableBytes: Int64, expectedBytes: Int64?, isComplete: Bool) {
        self.availableBytes = availableBytes
        self.expectedBytes = expectedBytes
        self.isComplete = isComplete
    }
}

/// La réponse à une demande de plage, à rejouer à chaque arrivée d'octets.
public enum ProgressiveRangeAnswer: Sendable, Equatable {
    /// Servir `length` octets à partir de `offset`, puis redemander.
    case serve(offset: Int64, length: Int)
    /// La plage commence au-delà de ce qui est arrivé : attendre la suite.
    case wait
    /// La plage est servie (ou le fichier s'est arrêté avant elle).
    case finished
}

/// **La loi de service d'un fichier qui se remplit en tête (#9881).**
///
/// Un seul téléchargement écrit le fichier dans l'ordre ; le lecteur demande
/// des plages, parfois au-delà de ce qui est arrivé. Une plage se sert par
/// morceaux bornés dès que ses premiers octets sont là, et attend sinon —
/// jamais une seconde requête réseau pour la même URL.
public enum ProgressiveRangeLaw {
    public static let defaultChunk = 256 * 1024

    public static func answer(
        for request: ProgressiveRangeRequest,
        file: ProgressiveFileState,
        maxChunk: Int = defaultChunk
    ) -> ProgressiveRangeAnswer {
        let end = requestEnd(request, file: file)
        if let end, request.currentOffset >= end { return .finished }
        guard request.currentOffset < file.availableBytes else {
            return file.isComplete ? .finished : .wait
        }
        let servable = min(end ?? file.availableBytes, file.availableBytes) - request.currentOffset
        return .serve(offset: request.currentOffset, length: Int(min(servable, Int64(max(1, maxChunk)))))
    }

    static func requestEnd(_ request: ProgressiveRangeRequest, file: ProgressiveFileState) -> Int64? {
        guard request.toEndOfResource else { return request.requestedOffset + request.requestedLength }
        if let expected = file.expectedBytes { return expected }
        return file.isComplete ? file.availableBytes : nil
    }
}
