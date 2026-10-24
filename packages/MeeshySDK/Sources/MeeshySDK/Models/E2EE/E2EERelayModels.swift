import Combine
import Foundation

// Le contrat FIL du relais d'enveloppes libsignal (#3706, spec E2EE libsignal
// § 3.4 et § 4.3), miroir Swift de `packages/shared/types/e2ee-directory.ts`.
// Ces types vivent dans le cœur du SDK, et non dans `MeeshyE2EE`, parce que le
// transport les porte : la socket décode `e2ee:envelope`, le POST de message
// encode ses enveloppes, et le refus Sesame (409) se lit dans l'enveloppe
// d'erreur. Aucun ne porte de clé ni de clair : des identifiants d'appareil et
// des chiffrés opaques.

/// Les constantes du protocole sur le fil.
public enum E2EEWire {
    /// `encryptionProtocol` d'un envoi libsignal.
    public static let libsignalProtocol = "libsignal-v1"
    /// Le marqueur non vide posé dans `encryptedContent` : les gardes de la
    /// passerelle lisent la PRÉSENCE d'un chiffré, le chiffré voyage dans les enveloppes.
    public static let encryptedContentMarker = "libsignal-v1"
    /// Le littéral que la passerelle persiste dans `content` d'un message `e2ee`.
    public static let contentPlaceholder = "[Encrypted]"
    /// Le mode d'une conversation chiffrée de bout en bout, tel que la passerelle le normalise.
    public static let mode = "e2ee"
}

/// Les codes stables que la passerelle pose en `code` (`E2EE_ERROR_CODES`).
public enum E2EEErrorCode {
    public static let devicesMismatch = "E2EE_DEVICES_MISMATCH"
    public static let clientOutdated = "E2EE_CLIENT_OUTDATED"
    public static let deviceNotBound = "E2EE_DEVICE_NOT_BOUND"
    public static let deviceLimitReached = "E2EE_DEVICE_LIMIT_REACHED"
    public static let envelopesInvalid = "E2EE_ENVELOPES_INVALID"
    public static let regimeChanged = "E2EE_REGIME_CHANGED"
    public static let identityRevoked = "E2EE_IDENTITY_REVOKED"
    public static let prekeyStockFull = "E2EE_PREKEY_STOCK_FULL"

    /// Les codes que la passerelle sert sur l'ENVOI d'un message : ils se
    /// lisent sur toute adresse, comme le refus d'un clair (#11379).
    public static let relayRefusals: Set<String> = [devicesMismatch, clientOutdated, deviceNotBound, envelopesInvalid, regimeChanged]
}

/// Un appareil désigné par la passerelle (Sesame).
public struct E2EEDeviceRef: Codable, Hashable, Sendable {
    public let userId: String
    public let deviceId: UInt32

    public init(userId: String, deviceId: UInt32) {
        self.userId = userId
        self.deviceId = deviceId
    }
}

/// L'écart d'un 409 `E2EE_DEVICES_MISMATCH` (Sesame § 3) : des appareils
/// manquants, en trop, ou dont la génération (`registrationId`) a changé.
public struct E2EEDevicesMismatch: Codable, Equatable, Sendable, Error {
    public let missing: [E2EEDeviceRef]
    public let extra: [E2EEDeviceRef]
    public let stale: [E2EEDeviceRef]

    public init(missing: [E2EEDeviceRef] = [], extra: [E2EEDeviceRef] = [], stale: [E2EEDeviceRef] = []) {
        self.missing = missing
        self.extra = extra
        self.stale = stale
    }
}

/// Une enveloppe émise : le chiffré libsignal d'UN appareil destinataire.
public struct E2EEOutgoingEnvelope: Codable, Equatable, Sendable {
    public let userId: String
    public let deviceId: UInt32
    public let registrationId: UInt32
    /// 3 = `PreKeySignalMessage`, 2 = `SignalMessage`.
    public let type: Int
    /// Le chiffré, en base64.
    public let body: String

    public init(userId: String, deviceId: UInt32, registrationId: UInt32, type: Int, body: String) {
        self.userId = userId
        self.deviceId = deviceId
        self.registrationId = registrationId
        self.type = type
        self.body = body
    }
}

/// `encryptionMetadata` d'un envoi libsignal : le protocole et l'appareil émetteur.
public struct E2EEWireMetadata: Codable, Equatable, Sendable {
    public let `protocol`: String
    public let senderDeviceId: UInt32

    public init(senderDeviceId: UInt32) {
        self.protocol = E2EEWire.libsignalProtocol
        self.senderDeviceId = senderDeviceId
    }
}

/// Une enveloppe servie à SON appareil. `recipientRegistrationId` dit pour quelle
/// génération de la place elle a été chiffrée (#12592) : une enveloppe qui n'est
/// pas pour la mienne ne s'ouvre pas, elle s'écarte.
public struct E2EEServedEnvelope: Codable, Equatable, Sendable {
    public let id: String
    public let messageId: String
    public let conversationId: String
    public let recipientRegistrationId: UInt32?
    public let senderUserId: String
    public let senderDeviceId: UInt32
    public let type: Int
    public let body: String
    public let createdAt: String

    public init(
        id: String, messageId: String, conversationId: String, recipientRegistrationId: UInt32?,
        senderUserId: String, senderDeviceId: UInt32, type: Int, body: String, createdAt: String
    ) {
        self.id = id
        self.messageId = messageId
        self.conversationId = conversationId
        self.recipientRegistrationId = recipientRegistrationId
        self.senderUserId = senderUserId
        self.senderDeviceId = senderDeviceId
        self.type = type
        self.body = body
        self.createdAt = createdAt
    }

    public func isAddressed(to registrationId: UInt32) -> Bool {
        recipientRegistrationId.map { $0 == registrationId } ?? true
    }
}

/// Le canal des enveloppes `e2ee:envelope` (#3707) que la socket de messages
/// reçoit pour CET appareil — la room de sa génération. Un canal à part plutôt
/// qu'un éditeur de plus sur le gestionnaire de socket : seul `MeeshyE2EE`, côté
/// app, l'écoute.
// unchecked: `received` est un `let` immuable ; PassthroughSubject sérialise ses émissions mais Combine ne le déclare pas Sendable.
public final class E2EEEnvelopeChannel: @unchecked Sendable {
    public static let shared = E2EEEnvelopeChannel()
    public let received = PassthroughSubject<E2EEServedEnvelope, Never>()

    public init() {}
}

public extension MeeshyError {
    /// Le code E2EE stable d'un refus de la passerelle, quelle que soit la
    /// forme que le transport lui a donnée (refus typé, ou 403 dont le corps
    /// porte le code).
    var e2eeCode: String? {
        switch self {
        case .rejected(let rejection):
            return rejection.code.flatMap { $0.hasPrefix("E2EE_") ? $0 : nil }
        case .forbidden(_, let body):
            guard let body, let envelope = try? JSONDecoder().decode(E2EECodeEnvelope.self, from: body) else { return nil }
            return envelope.code.flatMap { $0.hasPrefix("E2EE_") ? $0 : nil }
        default:
            return nil
        }
    }
}

private struct E2EECodeEnvelope: Decodable {
    let code: String?
}
