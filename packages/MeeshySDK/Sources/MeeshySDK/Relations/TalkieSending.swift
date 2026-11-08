import Foundation

// ÉMETTRE LE TALKIE (#16927, iso `apps/web/src/lib/talkie/talkie-sender.ts`) — les briques pures de l'émetteur : la
// lecture de l'accusé de `talkie:start`, l'en-tête ADTS d'une trame AAC, le découpage en fragments et les plafonds d'une
// prise de parole. Le serveur rejuge tout à chaque appui ; ces briques ne décident d'aucun droit.

/// Ce que l'interface dit d'une prise de parole qui n'a pas abouti. Un blocage et un repli rendent la MÊME issue
/// (`voice`) : l'émetteur ne doit jamais deviner qu'on a coupé SA voix.
public enum TalkieSendOutcome: String, Sendable, Equatable {
    /// Pas (ou plus) de lien d'au moins Proche : la ligne disparaît, ni grisée ni expliquée.
    case notAllowed
    case voice
    case e2ee
    case rateLimited
    case offline
    case failed
    case micDenied
    case limit

    private static let refusals: [String: TalkieSendOutcome] = [
        "TALKIE_NOT_ALLOWED": .notAllowed,
        "TALKIE_BLOCKED": .voice,
        "TALKIE_FALLBACK_VOICE": .voice,
        "TALKIE_E2EE_CONVERSATION": .e2ee,
        "TALKIE_RATE_LIMITED": .rateLimited,
    ]

    /// Un code que ce client ne connaît pas vaut un échec, jamais une raison inventée.
    public static func ofRefusal(_ code: String?) -> TalkieSendOutcome {
        code.flatMap { refusals[$0] } ?? .failed
    }
}

/// Une prise de parole OUVERTE par la passerelle, ses bornes ramenées au contrat.
public struct TalkieOpened: Sendable, Equatable {
    public let talkieId: String
    public let maxDuration: TimeInterval
    public let maxChunkBytes: Int

    public init(talkieId: String, maxDuration: TimeInterval, maxChunkBytes: Int) {
        self.talkieId = talkieId
        self.maxDuration = maxDuration
        self.maxChunkBytes = maxChunkBytes
    }
}

/// `data` de l'accusé de `talkie:start`, tel que la passerelle le sert.
struct TalkieOpenedWire: Decodable, Sendable, Equatable {
    let talkieId: String
    let maxDurationMs: Double?
    let maxChunkBytes: Int?
}

/// Le verdict de `talkie:start` : ouverte, ou refusée avec ce qu'il faut en dire.
public enum TalkieStartVerdict: Sendable, Equatable {
    case opened(TalkieOpened)
    case refused(TalkieSendOutcome)

    static func read(_ ack: SocketAck<TalkieOpenedWire>) -> TalkieStartVerdict {
        switch ack {
        case .accepted(let wire) where !wire.talkieId.isEmpty:
            return .opened(TalkieOpened(
                talkieId: wire.talkieId,
                maxDuration: bounded(wire.maxDurationMs.map { $0 / 1000 }, ceiling: TalkieContract.maxDuration),
                maxChunkBytes: Int(bounded(wire.maxChunkBytes.map(Double.init), ceiling: Double(TalkieContract.maxChunkBytes)))
            ))
        case .accepted, .acceptedWithoutPayload, .undecodable:
            return .refused(.failed)
        case .refused(let refusal):
            return .refused(.ofRefusal(refusal.code))
        case .timedOut:
            return .refused(.offline)
        }
    }

    /// Une borne servie absente, nulle, négative ou plus large que le contrat est ramenée au contrat.
    private static func bounded(_ served: Double?, ceiling: Double) -> Double {
        guard let served, served.isFinite, served > 0 else { return ceiling }
        return min(served, ceiling)
    }
}

/// L'en-tête ADTS (7 octets, sans CRC) qui rend une trame AAC-LC lisible SEULE — c'est ce que lisent les trois
/// récepteurs (`TalkieVoicePlayer`, `talkie-player.ts`, `TalkieAdts.kt`).
public enum TalkieAdts {
    private static let headerLength = 7
    private static let maxFrameLength = 0x1FFF
    private static let sampleRates: [Double] = [
        96_000, 88_200, 64_000, 48_000, 44_100, 32_000, 24_000, 22_050, 16_000, 12_000, 11_025, 8_000, 7_350,
    ]

    /// `nil` : une trame vide, une fréquence hors de la table MPEG-4, une configuration de canaux illisible ou une
    /// trame trop longue pour son champ de 13 bits.
    public static func frame(_ packet: Data, sampleRate: Double, channels: Int) -> Data? {
        guard !packet.isEmpty,
              let index = sampleRates.firstIndex(of: sampleRate),
              (1...7).contains(channels) else { return nil }
        let length = packet.count + headerLength
        guard length <= maxFrameLength else { return nil }
        let profile = 1
        let header: [UInt8] = [
            0xFF,
            0xF1,
            UInt8((profile << 6) | (index << 2) | (channels >> 2)),
            UInt8(((channels & 0x3) << 6) | (length >> 11)),
            UInt8((length >> 3) & 0xFF),
            UInt8(((length & 0x7) << 5) | 0x1F),
            0xFC,
        ]
        return Data(header) + packet
    }
}

/// Un fragment prêt à partir : ses trames ADTS bout à bout, leur durée, l'instant de capture de la première.
public struct TalkieFragment: Sendable, Equatable {
    public let data: Data
    public let duration: TimeInterval
    public let capturedAt: Date

    public init(data: Data, duration: TimeInterval, capturedAt: Date) {
        self.data = data
        self.duration = duration
        self.capturedAt = capturedAt
    }
}

/// Le découpage en fragments : chaque trame rejoint le fragment courant ; il part dès qu'il atteint sa durée, et AVANT
/// qu'une trame ne lui fasse dépasser le plafond d'octets.
public struct TalkieFragmenter: Sendable {
    public var maxChunkBytes: Int
    private let fragmentDuration: TimeInterval
    private var data = Data()
    private var duration: TimeInterval = 0
    private var capturedAt: Date?

    public init(maxChunkBytes: Int = TalkieContract.maxChunkBytes, fragmentDuration: TimeInterval = TalkieContract.fragmentDuration) {
        self.maxChunkBytes = maxChunkBytes
        self.fragmentDuration = fragmentDuration
    }

    /// Les fragments complétés par cette trame, dans l'ordre (zéro, un ou deux).
    public mutating func append(_ frame: Data, duration frameDuration: TimeInterval, at instant: Date) -> [TalkieFragment] {
        guard !frame.isEmpty else { return [] }
        var completed: [TalkieFragment] = []
        if !data.isEmpty, data.count + frame.count > maxChunkBytes, let full = flush() {
            completed.append(full)
        }
        if data.isEmpty { capturedAt = instant }
        data.append(frame)
        duration += frameDuration
        if duration >= fragmentDuration, let full = flush() {
            completed.append(full)
        }
        return completed
    }

    /// Ce qui reste : le fragment courant, même incomplet.
    public mutating func flush() -> TalkieFragment? {
        guard !data.isEmpty, let capturedAt else { return nil }
        let fragment = TalkieFragment(data: data, duration: duration, capturedAt: capturedAt)
        data = Data()
        duration = 0
        self.capturedAt = nil
        return fragment
    }
}

/// Les plafonds d'une prise de parole entière : un fragment admis reçoit son `seq` ; au-delà, l'émetteur ferme AVANT
/// que la passerelle ne coupe.
public struct TalkieBudget: Sendable {
    private let maxTotalBytes: Int
    private let maxChunks: Int
    private var nextSeq = 0
    private var sentBytes = 0

    public init(maxTotalBytes: Int = TalkieContract.maxTotalBytes, maxChunks: Int = TalkieContract.maxChunks) {
        self.maxTotalBytes = maxTotalBytes
        self.maxChunks = maxChunks
    }

    /// Le `seq` du fragment admis, ou `nil` s'il ferait dépasser un plafond.
    public mutating func admit(bytes: Int) -> Int? {
        guard nextSeq + 1 <= maxChunks, sentBytes + bytes <= maxTotalBytes else { return nil }
        let seq = nextSeq
        nextSeq += 1
        sentBytes += bytes
        return seq
    }
}

/// Les temps d'une prise de parole, comptés depuis l'appui (#17094) : micro prêt, accusé reçu, premier fragment parti.
/// Le journal du talkie l'écrit, pour qu'une recette sur appareil dise où passe le temps.
public struct TalkieLatency: Sendable, Equatable {
    public enum Step: String, Sendable, CaseIterable {
        case micReady
        case opened
        case firstChunk
    }

    public let pressedAt: Date
    public private(set) var marks: [Step: TimeInterval] = [:]

    public init(pressedAt: Date) {
        self.pressedAt = pressedAt
    }

    /// La première marque d'une étape compte ; un instant antérieur à l'appui vaut zéro.
    public mutating func mark(_ step: Step, at instant: Date) {
        guard marks[step] == nil else { return }
        marks[step] = max(0, instant.timeIntervalSince(pressedAt))
    }

    public func milliseconds(_ step: Step) -> Int? {
        marks[step].map { Int(($0 * 1000).rounded()) }
    }

    /// `micro 312 ms · accusé 140 ms · premier fragment 455 ms` — une étape non atteinte se lit `—`.
    public var summary: String {
        let labels: [(Step, String)] = [(.micReady, "micro"), (.opened, "accusé"), (.firstChunk, "premier fragment")]
        return labels
            .map { step, label in "\(label) \(milliseconds(step).map { "\($0) ms" } ?? "—")" }
            .joined(separator: " · ")
    }
}
