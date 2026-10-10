import Foundation

// MARK: - La traduction qu'un membre PARTAGE aux autres (#9899)
//
// Décision porteur du 2026-10-10 : l'appareil de chaque membre traduit vers SA
// langue, puis partage sa traduction aux autres membres. La passerelle ne
// traduit pas et ne lit pas ce qu'on lui confie : elle garde et relaie une
// enveloppe SCELLÉE, comme si la conversation était chiffrée de bout en bout.
//
// Ce fichier est le miroir Swift de `packages/shared/types/shared-translation.ts`
// (le contrat). `SharedTranslationSeal` est celui de
// `packages/shared/utils/shared-translation-seal.ts`, et
// `packages/shared/fixtures/shared-translation/seal.vectors.json` les tient
// ensemble : sur divergence, c'est le TypeScript qui a raison.

/// La dérivation de la clé d'une enveloppe — ce que SEULS les lecteurs du
/// message détiennent.
public enum SharedTranslationKdf: String, Codable, Sendable, CaseIterable {
    /// Le texte original du message, en NFC. Refusée par la passerelle dans une
    /// conversation chiffrée de bout en bout : le serveur pourrait deviner un
    /// message court en essayant d'ouvrir l'enveloppe.
    case messageContent = "message-content"
    /// Un secret de 32 octets que le message chiffré porte dans son clair.
    case messageSecret = "message-secret"
}

/// Les constantes du protocole, telles que le contrat les écrit.
public enum SharedTranslationWire {
    /// Le sel de la dérivation et le premier champ des données associées.
    public static let protocolIdentifier = "meeshy-shared-translation/v1"
    public static let algorithm = "A256GCM"
    public static let version = 1
}

/// Les bornes que l'appareil respecte avant d'envoyer et que la passerelle fait
/// respecter (`SHARED_TRANSLATION_LIMITS`).
public enum SharedTranslationLimits {
    /// base64 de nonce (12) ‖ chiffré ‖ tag (16) : 28 octets au moins.
    public static let payloadMinLength = 40
    public static let payloadMaxLength = 131_072
    /// En unités UTF-16, comme le `.length` du JavaScript qui l'a écrite.
    public static let textMaxLength = 20_000
    public static let engineMaxLength = 64
    public static let messageIdsMaxCount = 100
    public static let languagesMaxCount = 8
    public static let secretLength = 32
    public static let nonceLength = 12
    public static let tagLength = 16
}

/// Les deux formes que le contrat valide par expression régulière — écrites à
/// la main pour ne dépendre d'aucun moteur d'expressions.
public enum SharedTranslationFormat {

    /// `^[0-9a-fA-F]{24}$` — un identifiant MongoDB.
    public static func isObjectId(_ value: String) -> Bool {
        let bytes = Array(value.utf8)
        return bytes.count == 24 && bytes.allSatisfy(isHexDigit)
    }

    /// `^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})?$` — un code de langue, avec une
    /// région ou un script facultatifs.
    public static func isLanguageCode(_ value: String) -> Bool {
        let bytes = Array(value.utf8)
        guard let separator = bytes.firstIndex(where: { $0 == 0x2D || $0 == 0x5F }) else {
            return (2...3).contains(bytes.count) && bytes.allSatisfy(isAsciiLetter)
        }
        let primary = bytes[..<separator]
        let subtag = bytes[(separator + 1)...]
        return (2...3).contains(primary.count) && primary.allSatisfy(isAsciiLetter)
            && (2...8).contains(subtag.count) && subtag.allSatisfy(isAsciiAlphanumeric)
    }

    private static func isAsciiLetter(_ byte: UInt8) -> Bool {
        (0x41...0x5A).contains(byte) || (0x61...0x7A).contains(byte)
    }

    private static func isAsciiAlphanumeric(_ byte: UInt8) -> Bool {
        isAsciiLetter(byte) || (0x30...0x39).contains(byte)
    }

    private static func isHexDigit(_ byte: UInt8) -> Bool {
        (0x30...0x39).contains(byte) || (0x41...0x46).contains(byte) || (0x61...0x66).contains(byte)
    }
}

/// L'enveloppe scellée — la seule chose que la passerelle voit d'une traduction
/// partagée : ni le texte, ni la langue source, ni le moteur.
public struct SharedTranslationEnvelope: Codable, Sendable, Equatable {
    public let v: Int
    public let alg: String
    public let kdf: SharedTranslationKdf
    /// base64 de nonce ‖ chiffré ‖ tag.
    public let payload: String

    public init(
        v: Int = SharedTranslationWire.version,
        alg: String = SharedTranslationWire.algorithm,
        kdf: SharedTranslationKdf,
        payload: String
    ) {
        self.v = v
        self.alg = alg
        self.kdf = kdf
        self.payload = payload
    }
}

/// Ce que l'enveloppe contient — jamais vu par le serveur. Le moteur reste chez
/// les membres.
public struct SharedTranslationInner: Codable, Sendable, Equatable {
    public let v: Int
    public let text: String
    public let sourceLanguage: String
    public let engine: String

    public init(text: String, sourceLanguage: String, engine: String, v: Int = SharedTranslationWire.version) {
        self.v = v
        self.text = text
        self.sourceLanguage = sourceLanguage
        self.engine = engine
    }

    /// `sharedTranslationInnerSchema` : ce que la passerelle accepterait de
    /// garder, et donc ce qu'un appareil accepte de sceller comme d'ouvrir.
    var isSealable: Bool {
        v == SharedTranslationWire.version
            && !text.isEmpty && text.utf16.count <= SharedTranslationLimits.textMaxLength
            && SharedTranslationFormat.isLanguageCode(sourceLanguage)
            && !engine.isEmpty && engine.utf16.count <= SharedTranslationLimits.engineMaxLength
    }
}

/// Une traduction partagée telle que la passerelle la sert (lecture REST) et la
/// relaie (`message:translation-shared`). `sharedBy` est le participant qui l'a
/// partagée — le même espace d'identifiants que `Message.senderId`.
public struct SharedTranslation: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let conversationId: String
    public let messageId: String
    public let targetLanguage: String
    public let envelope: SharedTranslationEnvelope
    public let sharedBy: String
    public let sharedAt: String

    public init(
        id: String,
        conversationId: String,
        messageId: String,
        targetLanguage: String,
        envelope: SharedTranslationEnvelope,
        sharedBy: String,
        sharedAt: String
    ) {
        self.id = id
        self.conversationId = conversationId
        self.messageId = messageId
        self.targetLanguage = targetLanguage
        self.envelope = envelope
        self.sharedBy = sharedBy
        self.sharedAt = sharedAt
    }
}

/// Le corps de `POST /conversations/:conversationId/shared-translations` — la
/// conversation est dans l'adresse.
public struct ShareTranslationBody: Encodable, Sendable, Equatable {
    public let messageId: String
    public let targetLanguage: String
    public let envelope: SharedTranslationEnvelope

    public init(messageId: String, targetLanguage: String, envelope: SharedTranslationEnvelope) {
        self.messageId = messageId
        self.targetLanguage = targetLanguage
        self.envelope = envelope
    }
}

/// La réponse du partage : `created == false` quand un autre membre l'avait déjà
/// partagée — la sienne est rendue.
public struct ShareTranslationResult: Decodable, Sendable, Equatable {
    public let sharedTranslation: SharedTranslation
    public let created: Bool

    public init(sharedTranslation: SharedTranslation, created: Bool) {
        self.sharedTranslation = sharedTranslation
        self.created = created
    }
}

/// Un partage que la passerelle refuse au COMPTE, quel que soit le message —
/// miroir de `SHARED_TRANSLATION_ERROR_CODES` (`packages/shared/types/
/// shared-translation.ts`). Un partage est un accusé de lecture : qui a coupé
/// les siens ne partage pas, et l'appareil garde ses traductions pour lui.
public enum SharedTranslationShareRefusal: Error, Equatable, Sendable {
    case readReceiptsOff

    /// Le code machine que la passerelle pose sur ce refus (403).
    public var code: String {
        switch self {
        case .readReceiptsOff: return "SHARED_TRANSLATION_READ_RECEIPTS_OFF"
        }
    }
}

/// La réponse de `GET /conversations/:conversationId/shared-translations`.
///
/// La liste se lit élément par élément : une enveloppe qu'une version future du
/// protocole écrirait d'une dérivation ou d'une forme inconnue est écartée, et
/// ne fait jamais perdre les autres.
public struct SharedTranslationsResult: Decodable, Sendable, Equatable {
    public let sharedTranslations: [SharedTranslation]

    public init(sharedTranslations: [SharedTranslation]) {
        self.sharedTranslations = sharedTranslations
    }

    private enum CodingKeys: String, CodingKey {
        case sharedTranslations
    }

    /// Un élément qui se décode ou s'efface — son décodage ne lève jamais, donc
    /// le curseur de la liste avance toujours.
    private struct Lenient: Decodable {
        let value: SharedTranslation?

        init(from decoder: Decoder) throws {
            value = try? SharedTranslation(from: decoder)
        }
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        sharedTranslations = try container.decode([Lenient].self, forKey: .sharedTranslations).compactMap(\.value)
    }
}
