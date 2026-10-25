import Foundation
import MeeshySDK

// Le contrat des routes `/api/v1/e2ee/*` (#3706), miroir Swift de
// `packages/shared/types/e2ee-directory.ts`. Tout ce qui voyage ici est PUBLIC
// (clés publiques, signatures XEdDSA) ou OPAQUE (enveloppes libsignal) : aucun
// type de ce fichier ne porte de clé privée.

public struct E2EESignedKey: Codable, Equatable, Sendable {
    public let keyId: UInt32
    public let publicKey: String
    public let signature: String

    public init(keyId: UInt32, publicKey: String, signature: String) {
        self.keyId = keyId
        self.publicKey = publicKey
        self.signature = signature
    }
}

public struct E2EEOneTimeKey: Codable, Equatable, Sendable {
    public let keyId: UInt32
    public let publicKey: String

    public init(keyId: UInt32, publicKey: String) {
        self.keyId = keyId
        self.publicKey = publicKey
    }
}

/// La preuve que l'appareil détient la clé privée de l'identité qu'il enrôle,
/// pour CE compte, à cet instant (`deviceBindingMessage` côté passerelle).
public struct E2EEDeviceBindingProof: Codable, Equatable, Sendable {
    public let timestamp: Int64
    public let signature: String

    public init(timestamp: Int64, signature: String) {
        self.timestamp = timestamp
        self.signature = signature
    }

    /// Le message signé, à l'octet près celui que la passerelle reconstruit.
    public static func message(userId: String, registrationId: UInt32, identityKey: String, timestamp: Int64) -> String {
        "meeshy-e2ee-device-binding:v1:\(userId):\(registrationId):\(identityKey):\(timestamp)"
    }
}

public enum E2EEPlatform: String, Codable, Sendable {
    case ios, macos, android, web
}

public struct E2EEPreKeyBatches: Codable, Equatable, Sendable {
    public let oneTimePreKeys: [E2EEOneTimeKey]
    public let kyberPreKeys: [E2EESignedKey]

    public init(oneTimePreKeys: [E2EEOneTimeKey], kyberPreKeys: [E2EESignedKey]) {
        self.oneTimePreKeys = oneTimePreKeys
        self.kyberPreKeys = kyberPreKeys
    }
}

public struct E2EEEnrollDeviceRequest: Encodable, Equatable, Sendable {
    public let registrationId: UInt32
    public let identityKey: String
    public let signedPreKey: E2EESignedKey
    public let kyberLastResort: E2EESignedKey
    public let platform: E2EEPlatform
    public let label: String?
    public let binding: E2EEDeviceBindingProof
    public let oneTimePreKeys: [E2EEOneTimeKey]
    public let kyberPreKeys: [E2EESignedKey]
}

public struct E2EEPublishKeysRequest: Encodable, Equatable, Sendable {
    public let signedPreKey: E2EESignedKey?
    public let kyberLastResort: E2EESignedKey?
    public let oneTimePreKeys: [E2EEOneTimeKey]?
    public let kyberPreKeys: [E2EESignedKey]?

    public init(
        signedPreKey: E2EESignedKey? = nil,
        kyberLastResort: E2EESignedKey? = nil,
        oneTimePreKeys: [E2EEOneTimeKey]? = nil,
        kyberPreKeys: [E2EESignedKey]? = nil
    ) {
        self.signedPreKey = signedPreKey
        self.kyberLastResort = kyberLastResort
        self.oneTimePreKeys = oneTimePreKeys
        self.kyberPreKeys = kyberPreKeys
    }
}

public struct E2EEEnrollment: Decodable, Equatable, Sendable {
    public let deviceId: UInt32
    public let created: Bool
}

public struct E2EEPreKeyStock: Decodable, Equatable, Sendable {
    public let deviceId: UInt32
    public let oneTimePreKeys: Int
    public let kyberPreKeys: Int
}

public struct E2EEKyberBundleKey: Decodable, Equatable, Sendable {
    public let keyId: UInt32
    public let publicKey: String
    public let signature: String
    public let lastResort: Bool
}

/// Le bundle d'UN appareil : PQXDH § 2.4, une pré-clé unique EC au plus, une Kyber toujours.
public struct E2EEDeviceBundle: Decodable, Equatable, Sendable {
    public let deviceId: UInt32
    public let registrationId: UInt32
    public let identityKey: String
    public let signedPreKey: E2EESignedKey
    public let kyberPreKey: E2EEKyberBundleKey
    public let preKey: E2EEOneTimeKey?
}

public struct E2EEUserBundles: Decodable, Equatable, Sendable {
    public let userId: String
    public let devices: [E2EEDeviceBundle]
}

public struct E2EEDeviceListing: Decodable, Equatable, Sendable {
    public let deviceId: UInt32
    public let registrationId: UInt32
}

public struct E2EEUserDevices: Decodable, Equatable, Sendable {
    public let userId: String
    public let devices: [E2EEDeviceListing]
}

public struct E2EEEnvelopePage: Decodable, Equatable, Sendable {
    public let envelopes: [E2EEServedEnvelope]
    public let nextCursor: String?
}

public struct E2EEAckResult: Decodable, Equatable, Sendable {
    public let deleted: Int
}

public struct E2EERetirement: Decodable, Equatable, Sendable {
    public let deviceId: UInt32
    public let retired: Bool
}
