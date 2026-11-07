import Foundation

// LE BRING (#13936, décision porteur D-3, #13945) — un son FORCÉ sur le téléphone de l'autre, pour
// l'urgence extrême. Le contrat est `packages/shared/types/bring.ts` ; ce fichier en est la lecture Swift. Le client
// ne recalcule AUCUNE règle (niveau, quota, blocage, service coupé) : il lit ce que la passerelle sert.

/// La fenêtre pendant laquelle un Bring sonne au plus (`BRING_RING_WINDOW_MS`). Aucun événement n'annonce
/// l'expiration : chaque client cesse de sonner à `expiresAt`.
public enum BringContract {
    public static let ringWindow: TimeInterval = 120
    /// `data.type` des pushes du Bring (`BRING_PUSH_TYPES`).
    public static let ringPushType = "bring"
    public static let stoppedPushType = "bring_stopped"
}

/// `GET /bring/:userId` — le bouton existe-t-il, et combien en reste-t-il aujourd'hui ? `available == false` ⇒ le
/// bouton DISPARAÎT, sans raison. `perDay` / `remainingToday` `nil` = illimité.
public struct BringAvailability: Decodable, Sendable, Equatable {
    public let userId: String
    public let available: Bool
    public let perDay: Int?
    public let remainingToday: Int?
    public let resetsAt: String?

    public init(userId: String, available: Bool, perDay: Int?, remainingToday: Int?, resetsAt: String? = nil) {
        self.userId = userId
        self.available = available
        self.perDay = perDay
        self.remainingToday = remainingToday
        self.resetsAt = resetsAt
    }

    /// La même disponibilité, recomptée par la réponse d'un envoi (sans relire).
    public func counted(perDay: Int?, remainingToday: Int?) -> BringAvailability {
        BringAvailability(userId: userId, available: available, perDay: perDay, remainingToday: remainingToday, resetsAt: resetsAt)
    }

    /// Le bouton n'est plus offert : refus servi après coup (blocage, service coupé, lien baissé).
    public var withdrawn: BringAvailability {
        BringAvailability(userId: userId, available: false, perDay: perDay, remainingToday: 0, resetsAt: resetsAt)
    }

    public var isExhausted: Bool { remainingToday == 0 }
}

/// `POST /bring/:userId` (201, ou 200 + le MÊME Bring s'il sonne déjà).
public struct BringSent: Decodable, Sendable, Equatable {
    public let bringId: String
    public let toUserId: String
    public let sentAt: String
    public let expiresAt: String
    public let perDay: Int?
    public let remainingToday: Int?

    public init(bringId: String, toUserId: String, sentAt: String, expiresAt: String, perDay: Int?, remainingToday: Int?) {
        self.bringId = bringId
        self.toUserId = toUserId
        self.sentAt = sentAt
        self.expiresAt = expiresAt
        self.perDay = perDay
        self.remainingToday = remainingToday
    }
}

/// `bring:ring` (socket, chez le destinataire seulement) — ou le push `bring`, ramené à la même forme. Aucun nom ne
/// voyage sur le socket : l'écran l'hydrate par ses caches.
public struct BringRing: Decodable, Sendable, Equatable {
    public let bringId: String
    public let fromUserId: String
    public let toUserId: String
    public let sentAt: String
    public let expiresAt: String

    public init(bringId: String, fromUserId: String, toUserId: String, sentAt: String, expiresAt: String) {
        self.bringId = bringId
        self.fromUserId = fromUserId
        self.toUserId = toUserId
        self.sentAt = sentAt
        self.expiresAt = expiresAt
    }

    /// Le push `bring` (`BringPushData`) : `data.type == "bring"` et les cinq champs du Bring. Un autre push ⇒ `nil`.
    public init?(push userInfo: [AnyHashable: Any]) {
        guard userInfo["type"] as? String == BringContract.ringPushType,
              let bringId = userInfo["bringId"] as? String,
              let fromUserId = userInfo["fromUserId"] as? String,
              let sentAt = userInfo["sentAt"] as? String,
              let expiresAt = userInfo["expiresAt"] as? String else { return nil }
        self.init(bringId: bringId, fromUserId: fromUserId, toUserId: "", sentAt: sentAt, expiresAt: expiresAt)
    }

    /// L'échéance servie ; illisible ⇒ la fenêtre du contrat depuis `now`, jamais une sonnerie sans fin.
    public func deadline(now: Date) -> Date {
        BringInstant.parse(expiresAt) ?? now.addingTimeInterval(BringContract.ringWindow)
    }
}

/// Qui a arrêté. Aucune raison ne dit « bloqué » : un blocage ne s'annonce jamais au bloqué. Une raison qu'un serveur
/// plus récent ajouterait se lit `nil`.
public enum BringStopReason: String, Sendable, Equatable {
    case recipient
    case sender
}

/// `bring:stopped` (socket, chez les DEUX) — ou le push `bring_stopped`.
public struct BringStopped: Decodable, Sendable, Equatable {
    public let bringId: String
    public let fromUserId: String?
    public let toUserId: String?
    public let reason: BringStopReason?

    public init(bringId: String, fromUserId: String?, toUserId: String?, reason: BringStopReason?) {
        self.bringId = bringId
        self.fromUserId = fromUserId
        self.toUserId = toUserId
        self.reason = reason
    }

    private enum CodingKeys: String, CodingKey { case bringId, fromUserId, toUserId, reason }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        bringId = try c.decode(String.self, forKey: .bringId)
        fromUserId = (try? c.decodeIfPresent(String.self, forKey: .fromUserId)) ?? nil
        toUserId = (try? c.decodeIfPresent(String.self, forKey: .toUserId)) ?? nil
        let raw = (try? c.decodeIfPresent(String.self, forKey: .reason)) ?? nil
        reason = raw.flatMap(BringStopReason.init(rawValue:))
    }

    /// Le push `bring_stopped`. Un autre push ⇒ `nil`.
    public init?(push userInfo: [AnyHashable: Any]) {
        guard userInfo["type"] as? String == BringContract.stoppedPushType,
              let bringId = userInfo["bringId"] as? String else { return nil }
        self.init(
            bringId: bringId,
            fromUserId: nil,
            toUserId: nil,
            reason: (userInfo["reason"] as? String).flatMap(BringStopReason.init(rawValue:))
        )
    }
}

/// Ce que l'envoi d'un Bring a donné, rangé par ce que l'écran en DIT. Le client ne distingue pas un blocage d'un
/// lien trop bas : `gone` fait disparaître le bouton, sans raison.
public enum BringSendOutcome: Sendable, Equatable {
    case sent(BringSent)
    /// 403 — sous Ami, blocage, service coupé : le bouton disparaît.
    case gone
    /// 429 — « Plus de Bring aujourd'hui vers X ».
    case quota
    /// Pas de réseau.
    case offline
    /// Tout le reste (503, panne) : réessayer.
    case failed

    public static func from(_ error: Error) -> BringSendOutcome {
        if let urlError = error as? URLError {
            return urlError.code == .notConnectedToInternet ? .offline : .failed
        }
        guard let meeshyError = error as? MeeshyError else { return .failed }
        switch meeshyError {
        case .forbidden: return .gone
        case .server(let statusCode, _) where statusCode == 429: return .quota
        case .network: return .offline
        default: return .failed
        }
    }
}

/// `GET|PUT /relations/:userId/settings` — les réglages que JE pose pour l'autre. Seul `bringBlocked` est lu à ce
/// lot ; les autres réglages arrivent avec leur lot, et un champ absent vaut sa valeur par défaut.
public struct RelationPersonSettings: Decodable, Sendable, Equatable {
    public let userId: String
    public let bringBlocked: Bool

    public init(userId: String, bringBlocked: Bool) {
        self.userId = userId
        self.bringBlocked = bringBlocked
    }

    private enum CodingKeys: String, CodingKey { case userId, bringBlocked }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        userId = try c.decode(String.self, forKey: .userId)
        bringBlocked = (try? c.decodeIfPresent(Bool.self, forKey: .bringBlocked)) ?? false
    }
}

/// Les instants ISO 8601 du contrat, avec ou sans millisecondes.
public enum BringInstant {
    public static func parse(_ value: String) -> Date? {
        WireDate.date(from: value)
    }
}
