import Foundation

// LE TALKIE (#13935, décision porteur D-4, #13946) — un Proche appuie et parle, sa voix sort chez l'autre sans décrocher.
// Le contrat est `packages/shared/types/talkie.ts` ; ce fichier en est la lecture Swift, côté RÉCEPTION (#16673) ;
// l'émission est `TalkieSending.swift` (#16927). Le
// client ne recalcule AUCUNE règle (niveau, réception coupée, E2EE, appel, Ne pas déranger) : la passerelle a jugé.

public enum TalkieContract {
    /// `TALKIE_MAX_DURATION_MS` : une prise de parole dure au plus 30 s.
    public static let maxDuration: TimeInterval = 30
    /// Le seul encodage relayé au MVP : celui du vocal (AAC mono, trames ADTS lisibles dès la première).
    public static let codec = "aac-adts"
    /// `TALKIE_MAX_CHUNK_BYTES` : le plafond d'un fragment.
    public static let maxChunkBytes = 16_384
    /// `TALKIE_MAX_TOTAL_BYTES` : le plafond d'une prise de parole entière.
    public static let maxTotalBytes = 512_000
    /// `TALKIE_MAX_CHUNKS` : le plafond du NOMBRE de fragments d'une prise de parole.
    public static let maxChunks = 300
    /// Un fragment part toutes les ~120 ms (#17094) : la voix s'entend d'autant plus tôt qu'un fragment est court — le
    /// récepteur ne joue qu'un fragment ENTIER — et 30 s restent sous `maxChunks` à toute fréquence du micro.
    public static let fragmentDuration: TimeInterval = 0.12
}

/// `talkie:incoming` — une prise de parole commence. Aucun nom ne voyage : l'écran l'hydrate par ses caches. Un
/// encodage que ce client ne sait pas lire ne s'ouvre pas (`isPlayable`).
public struct TalkieIncoming: Decodable, Sendable, Equatable {
    public let talkieId: String
    public let fromUserId: String
    public let codec: String
    public let startedAt: String
    public let maxDurationMs: Int

    public init(talkieId: String, fromUserId: String, codec: String = TalkieContract.codec, startedAt: String, maxDurationMs: Int) {
        self.talkieId = talkieId
        self.fromUserId = fromUserId
        self.codec = codec
        self.startedAt = startedAt
        self.maxDurationMs = maxDurationMs
    }

    public var isPlayable: Bool { codec == TalkieContract.codec }

    /// La durée servie, bornée par le contrat : une valeur absurde ne garde jamais une prise de parole ouverte.
    public var maxDuration: TimeInterval {
        min(max(TimeInterval(maxDurationMs) / 1000, 0), TalkieContract.maxDuration)
    }
}

/// `talkie:chunk` — un fragment, à jouer DÈS son arrivée. Le son voyage en binaire Socket.IO natif (`Data`), jamais
/// en base64 : ce type ne se décode donc pas par JSON, il se lit depuis la charge brute (`init?(wire:)`).
public struct TalkieChunk: Sendable, Equatable {
    public let talkieId: String
    public let fromUserId: String
    public let seq: Int
    public let data: Data

    public init(talkieId: String, fromUserId: String, seq: Int, data: Data) {
        self.talkieId = talkieId
        self.fromUserId = fromUserId
        self.seq = seq
        self.data = data
    }

    /// La charge telle que Socket.IO la rend : le binaire est déjà replacé en `Data`. Toute charge incomplète ⇒ `nil`.
    public init?(wire: Any?) {
        guard let dict = wire as? [String: Any],
              let talkieId = dict["talkieId"] as? String, !talkieId.isEmpty,
              let fromUserId = dict["fromUserId"] as? String, !fromUserId.isEmpty,
              let seq = (dict["seq"] as? NSNumber)?.intValue, seq >= 0,
              let data = Self.bytes(dict["data"]), !data.isEmpty else { return nil }
        self.init(talkieId: talkieId, fromUserId: fromUserId, seq: seq, data: data)
    }

    private static func bytes(_ value: Any?) -> Data? {
        if let data = value as? Data { return data }
        if let data = value as? NSData { return data as Data }
        if let array = value as? [UInt8] { return Data(array) }
        return nil
    }
}

/// `sender` : bouton relâché · `limit` : 30 s ou plafond atteint · `cut` : coupée (blocage, réglage, appel). Une raison
/// qu'un serveur plus récent ajouterait se lit `nil`.
public enum TalkieEndReason: String, Sendable, Equatable {
    case sender
    case limit
    case cut
}

/// `talkie:ended` — chez le destinataire, et chez les autres appareils de l'émetteur.
public struct TalkieEnded: Decodable, Sendable, Equatable {
    public let talkieId: String
    public let fromUserId: String
    public let toUserId: String
    public let reason: TalkieEndReason?

    public init(talkieId: String, fromUserId: String, toUserId: String, reason: TalkieEndReason?) {
        self.talkieId = talkieId
        self.fromUserId = fromUserId
        self.toUserId = toUserId
        self.reason = reason
    }

    private enum CodingKeys: String, CodingKey { case talkieId, fromUserId, toUserId, reason }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        talkieId = try c.decode(String.self, forKey: .talkieId)
        fromUserId = try c.decode(String.self, forKey: .fromUserId)
        toUserId = try c.decode(String.self, forKey: .toUserId)
        let raw = (try? c.decodeIfPresent(String.self, forKey: .reason)) ?? nil
        reason = raw.flatMap(TalkieEndReason.init(rawValue:))
    }

    /// `cut` fait taire SUR-LE-CHAMP ; toute autre fin laisse finir ce qui est déjà en file.
    public var silencesNow: Bool { reason == .cut }
}
