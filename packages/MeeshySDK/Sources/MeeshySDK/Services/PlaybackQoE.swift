import Foundation

// MARK: - La qualité d'une lecture, en UN résumé par session (#10504)
//
// Méthode Mux / Conviva : une session de lecture se résume à sa fin —
// démarrage, rebuffering, erreurs, débit, boucles, pauses, recherches, son,
// sous-titres, quartiles atteints, raison de sortie. Rien ne part PENDANT la
// lecture : l'accumulateur ne fait que des additions, et `finish` rend
// l'unique résumé.

public struct PlaybackSummary: Encodable, Sendable, Equatable {
    public enum ExitReason: String, Encodable, Sendable, CaseIterable {
        case completed, swiped, closed, backgrounded, error, other
    }

    public let playbackId: String
    public let mediaId: String
    public let mediaDurationMs: Int?
    public let startupMs: Int?
    public let exitBeforeStart: Bool
    public let playedMs: Int
    public let rebufferCount: Int
    public let rebufferMs: Int
    public let errorCode: Int?
    public let errorDomain: String?
    public let avgBitrateKbps: Int?
    public let renditionChanges: Int
    public let loops: Int
    public let pauses: Int
    public let seeks: Int
    public let mutedAtStart: Bool
    public let muteToggles: Int
    public let captionsOn: Bool
    /// Bitmask : 1 = 25 %, 2 = 50 %, 4 = 75 %, 8 = 100 %.
    public let quartiles: Int
    public let exitReason: ExitReason
}

/// Les quartiles atteints d'une durée, en bitmask cumulatif.
public enum PlaybackQuartiles {
    public static func mask(reachedMs: Int, durationMs: Int) -> Int {
        guard durationMs > 0, reachedMs > 0 else { return 0 }
        let thresholds: [(Int, Int)] = [(1, 25), (2, 50), (4, 75), (8, 100)]
        return thresholds.reduce(0) { mask, pair in
            reachedMs * 100 >= durationMs * pair.1 ? mask | pair.0 : mask
        }
    }
}

/// Le contrat d'un accumulateur de qualité de lecture — l'app le branche sur
/// `AVPlayerItem` (KVO, journaux d'accès et d'erreur) et `timeControlStatus`.
public protocol PlaybackQoEProviding: Sendable {
    mutating func noteFirstFrame(atMs: Int)
    mutating func noteBufferEmpty(atMs: Int)
    mutating func noteLikelyToKeepUp(atMs: Int)
    mutating func notePlaying(atMs: Int)
    mutating func notePaused(atMs: Int)
    mutating func noteSeek()
    mutating func noteLoop()
    mutating func noteMuteToggled()
    mutating func notePosition(ms: Int)
    mutating func noteAccessLog(observedBitrateKbps: Int?, renditionChanged: Bool)
    mutating func noteError(code: Int, domain: String)
    func finish(atMs: Int, reason: PlaybackSummary.ExitReason) -> PlaybackSummary
}

/// Les horloges sont des millisecondes RELATIVES au début de la session
/// (`atMs`), fournies par l'appelant : l'accumulateur reste pur et testable.
public struct PlaybackQoEAccumulator: PlaybackQoEProviding, Equatable {
    public let playbackId: String
    public let mediaId: String
    public private(set) var mediaDurationMs: Int?
    public let mutedAtStart: Bool
    public let captionsOn: Bool

    private var firstFrameMs: Int?
    private var playingSinceMs: Int?
    private var playedMs = 0
    private var bufferingSinceMs: Int?
    private var rebufferCount = 0
    private var rebufferMs = 0
    private var errorCode: Int?
    private var errorDomain: String?
    private var bitrateSumKbps = 0
    private var bitrateSamples = 0
    private var renditionChanges = 0
    private var loops = 0
    private var pauses = 0
    private var seeks = 0
    private var muteToggles = 0
    private var furthestMs = 0
    private var completedLoopMask = 0

    public init(playbackId: String = UUID().uuidString.lowercased(), mediaId: String, mediaDurationMs: Int?, mutedAtStart: Bool, captionsOn: Bool = false) {
        self.playbackId = playbackId
        self.mediaId = mediaId
        self.mediaDurationMs = mediaDurationMs
        self.mutedAtStart = mutedAtStart
        self.captionsOn = captionsOn
    }

    public mutating func noteFirstFrame(atMs: Int) {
        guard firstFrameMs == nil else { return }
        firstFrameMs = max(0, atMs)
    }

    /// Un buffer vide AVANT la première image est du démarrage, pas un rebuffer.
    public mutating func noteBufferEmpty(atMs: Int) {
        guard firstFrameMs != nil, bufferingSinceMs == nil else { return }
        bufferingSinceMs = atMs
        rebufferCount += 1
    }

    public mutating func noteLikelyToKeepUp(atMs: Int) {
        guard let since = bufferingSinceMs else { return }
        rebufferMs += max(0, atMs - since)
        bufferingSinceMs = nil
    }

    public mutating func notePlaying(atMs: Int) {
        guard playingSinceMs == nil else { return }
        playingSinceMs = atMs
    }

    public mutating func notePaused(atMs: Int) {
        guard let since = playingSinceMs else { return }
        playedMs += max(0, atMs - since)
        playingSinceMs = nil
        pauses += 1
    }

    public mutating func noteSeek() { seeks += 1 }

    /// La durée connue après coup (élément chargé) : elle ne remplace pas une
    /// durée déjà déclarée.
    public mutating func noteDuration(ms: Int) {
        guard mediaDurationMs == nil, ms > 0 else { return }
        mediaDurationMs = ms
    }

    /// Une boucle de réel : la passe précédente est allée au bout.
    public mutating func noteLoop() {
        loops += 1
        if let duration = mediaDurationMs { furthestMs = max(furthestMs, duration) }
        completedLoopMask = 15
    }

    public mutating func noteMuteToggled() { muteToggles += 1 }

    public mutating func notePosition(ms: Int) { furthestMs = max(furthestMs, ms) }

    public mutating func noteAccessLog(observedBitrateKbps: Int?, renditionChanged: Bool) {
        if let kbps = observedBitrateKbps, kbps > 0 {
            bitrateSumKbps += kbps
            bitrateSamples += 1
        }
        if renditionChanged { renditionChanges += 1 }
    }

    /// Le CODE et le domaine seulement — jamais un message (il peut porter une URL).
    public mutating func noteError(code: Int, domain: String) {
        errorCode = code
        errorDomain = String(domain.prefix(64))
    }

    public func finish(atMs: Int, reason: PlaybackSummary.ExitReason) -> PlaybackSummary {
        let openPlay = playingSinceMs.map { max(0, atMs - $0) } ?? 0
        let openBuffer = bufferingSinceMs.map { max(0, atMs - $0) } ?? 0
        let reachedMask = mediaDurationMs.map { PlaybackQuartiles.mask(reachedMs: furthestMs, durationMs: $0) } ?? 0
        return PlaybackSummary(
            playbackId: playbackId,
            mediaId: mediaId,
            mediaDurationMs: mediaDurationMs,
            startupMs: firstFrameMs,
            exitBeforeStart: firstFrameMs == nil,
            playedMs: playedMs + openPlay,
            rebufferCount: rebufferCount,
            rebufferMs: rebufferMs + openBuffer,
            errorCode: errorCode,
            errorDomain: errorDomain,
            avgBitrateKbps: bitrateSamples > 0 ? bitrateSumKbps / bitrateSamples : nil,
            renditionChanges: renditionChanges,
            loops: loops,
            pauses: pauses,
            seeks: seeks,
            mutedAtStart: mutedAtStart,
            muteToggles: muteToggles,
            captionsOn: captionsOn,
            quartiles: reachedMask | completedLoopMask,
            exitReason: errorCode != nil && reason == .other ? .error : reason
        )
    }
}
