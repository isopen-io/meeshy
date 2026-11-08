import Foundation

// LE RÉVEIL DU TALKIE (#17141, contrat de la passerelle #17142) — un destinataire non connecté mais joignable par push
// est réveillé : APNs `pushtotalk` quand l'iPhone a rejoint un canal PushToTalk, sinon la notification time-sensitive
// `talkie_incoming`. Il émet ensuite `talkie:join { talkieId }` et la passerelle lui rejoue la voix. Ces briques ne
// décident d'aucun droit : la passerelle a déjà jugé avant de réveiller.

/// Comment la voix rejoint le destinataire : en direct, ou après l'avoir réveillé. Un client ancien ignore le champ.
public enum TalkieDelivery: String, Sendable, Equatable {
    case live
    case waking
}

public enum TalkieWakeContract {
    /// Le `type` de la notification de repli.
    public static let pushType = "talkie_incoming"
    /// La catégorie dédiée au talkie : la SEULE dont la voix se joue depuis la notification.
    public static let category = "MEESHY_TALKIE"
    /// La passerelle rejoue jusqu'à 60 s après la fin, et une prise de parole dure au plus 30 s.
    public static let catchUpWindow: TimeInterval = 60 + TalkieContract.maxDuration
    /// Un son de notification ne dure pas plus de 30 s : au-delà, iOS joue le son par défaut.
    public static let maxSoundDuration: TimeInterval = 30

    public static func mayRingAsSound(duration: TimeInterval) -> Bool {
        duration.isFinite && duration > 0 && duration <= maxSoundDuration
    }

    /// Le fichier du son dans `Library/Sounds` du groupe d'apps : un nom qui ne sort jamais du dossier.
    public static func soundFileName(talkieId: String) -> String {
        "talkie-\(talkieId.filter { $0.isLetter || $0.isNumber }).caf"
    }
}

/// Ce que porte un push de réveil : la prise de parole, son émetteur, son nom, et la voix si la passerelle la sert.
public struct TalkieWakePush: Sendable, Equatable {
    public let talkieId: String
    public let fromUserId: String
    public let fromUserName: String?
    /// La voix déjà enregistrée (copie vocale ou segment), sous `voiceUrl` ou les clés d'un vocal (`attachmentUrl`) —
    /// `nil` tant qu'elle n'existe pas.
    public let voiceURL: String?

    public init(talkieId: String, fromUserId: String, fromUserName: String?, voiceURL: String?) {
        self.talkieId = talkieId
        self.fromUserId = fromUserId
        self.fromUserName = fromUserName
        self.voiceURL = voiceURL
    }

    /// La notification `talkie_incoming` ; tout autre `type` rend `nil`.
    public init?(userInfo: [AnyHashable: Any]) {
        guard userInfo["type"] as? String == TalkieWakeContract.pushType else { return nil }
        self.init(pushToTalkPayload: userInfo)
    }

    /// La charge `pushtotalk`, sans `type`.
    public init?(pushToTalkPayload payload: [AnyHashable: Any]) {
        guard let talkieId = Self.text(payload["talkieId"]), let fromUserId = Self.text(payload["fromUserId"]) else { return nil }
        let name = ["fromUserName", "senderName", "fromName"].lazy.compactMap { Self.text(payload[$0]) }.first
        let voice = Self.text(payload["voiceUrl"]) ?? Self.text(payload["attachmentUrl"])
        self.init(talkieId: talkieId, fromUserId: fromUserId, fromUserName: name, voiceURL: voice)
    }

    public func displayName(fallback: String) -> String {
        let trimmed = fromUserName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? fallback : trimmed
    }

    private static func text(_ value: Any?) -> String? {
        guard let string = value as? String, !string.isEmpty else { return nil }
        return string
    }
}
