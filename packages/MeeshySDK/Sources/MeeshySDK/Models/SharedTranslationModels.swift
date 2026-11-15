import Foundation

// MARK: - La traduction qu'un membre PARTAGE aux autres (#9899)
//
// Décision porteur du 2026-10-10 : l'appareil de chaque membre traduit vers SA
// langue, puis partage sa traduction aux autres membres. La passerelle ne
// traduit pas : elle garde et relaie une enveloppe SCELLÉE sur l'appareil, sans
// jamais tenter de l'ouvrir.
//
// Ce que le scellement protège, et ce qu'il ne protège pas. L'enveloppe est
// scellée pour ceux qui détiennent le texte du message. Elle n'apporte AUCUNE
// confidentialité contre le serveur dans une conversation qu'il lit déjà, ni
// contre un lecteur du message : le serveur ne l'ouvre pas, mais il le pourrait,
// puisqu'il détient le texte d'où la clé dérive. Elle garde la traduction hors de
// portée de qui ne lit pas le message (une copie de la table, un membre arrivé
// après le plancher d'historique). La confidentialité contre le serveur ne
// viendra qu'avec `message-secret`, dans une conversation chiffrée de bout en
// bout (#9959).
//
// Ce fichier est le miroir Swift de `packages/shared/types/shared-translation.ts`
// (le contrat). `SharedTranslationSeal` est celui de
// `packages/shared/utils/shared-translation-seal.ts`, et
// `packages/shared/fixtures/shared-translation/seal.vectors.json` les tient
// ensemble : sur divergence, c'est le TypeScript qui a raison.

/// La dérivation de la clé d'une enveloppe — la matière que détiennent ceux qui
/// lisent le message.
public enum SharedTranslationKdf: String, Codable, Sendable, CaseIterable {
    /// Le texte original du message, en NFC. Acceptée par la passerelle là
    /// seulement où elle lit déjà ce texte
    /// (`DeviceTranslationEligibility.serverReadsMessage`) : dans une
    /// conversation chiffrée de bout en bout, le serveur pourrait deviner un
    /// message court en essayant d'ouvrir l'enveloppe.
    case messageContent = "message-content"
    /// Un secret de 32 octets que le message chiffré porterait dans son clair.
    /// Le format le nomme ; la passerelle le REFUSE tant que le message chiffré
    /// qui le transporte n'existe pas (#9959).
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
    /// La plus longue enveloppe qu'un texte admis produit : 10 000 unités UTF-16
    /// de trois octets chacune en UTF-8 (une écriture CJK), plus le JSON et ses
    /// 28 octets de nonce et de tag, en base64. Un message en compte 4 000 au plus.
    public static let payloadMaxLength = 40_960
    /// En unités UTF-16, comme le `.length` du JavaScript qui l'a écrite.
    public static let textMaxLength = 10_000
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

/// L'enveloppe scellée — ce que la passerelle garde et relaie d'une traduction
/// partagée : ni le texte, ni la langue source, ni le moteur n'y figurent en
/// clair. Elle ne l'ouvre pas ; dans une conversation qu'elle lit déjà, elle le
/// pourrait (voir l'en-tête de ce fichier).
public struct SharedTranslationEnvelope: Codable, Sendable, Equatable {
    public let v: Int
    public let alg: String
    public let kdf: SharedTranslationKdf
    /// base64 CANONIQUE de nonce ‖ chiffré ‖ tag : remplissage présent, bits de
    /// remplissage nuls, aucun blanc. Une même enveloppe n'a qu'une écriture.
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

/// Ce que l'enveloppe contient — que le serveur n'ouvre pas, mais qu'il pourrait
/// ouvrir là où il lit déjà le message (voir l'en-tête de ce fichier). Le moteur
/// reste chez les membres.
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
/// conversation est dans l'adresse. `sourceVersion` est la version du texte que
/// l'appareil a traduite (`SharedTranslationSourceVersion`) : la passerelle
/// refuse (409) la traduction d'un message modifié depuis.
public struct ShareTranslationBody: Encodable, Sendable, Equatable {
    public let messageId: String
    public let targetLanguage: String
    public let sourceVersion: String
    public let envelope: SharedTranslationEnvelope

    public init(
        messageId: String,
        targetLanguage: String,
        sourceVersion: String,
        envelope: SharedTranslationEnvelope
    ) {
        self.messageId = messageId
        self.targetLanguage = targetLanguage
        self.sourceVersion = sourceVersion
        self.envelope = envelope
    }
}

/// La version du texte source qu'une traduction traduit — miroir de
/// `sharedTranslationSourceVersion`
/// (`packages/shared/utils/shared-translation-eligibility.ts`) : `original` pour
/// un message jamais modifié, sinon l'instant de sa dernière modification, en UTC
/// et à la milliseconde, écrit comme `toISOString` le fait
/// (`YYYY-MM-DDTHH:mm:ss.sssZ`).
///
/// `ISO8601DateFormatter` et `DateFormatter` ne servent pas ici : ils TRONQUENT
/// la fraction, si bien qu'une date décodée depuis `…30.123Z` peut s'écrire
/// `…30.122Z` — une version que la passerelle ne reconnaîtrait pas. La
/// milliseconde s'ARRONDIT donc d'abord, sur l'instant, puis seules les secondes
/// entières passent par le calendrier.
public enum SharedTranslationSourceVersion {
    /// La version d'un message jamais modifié.
    public static let original = "original"

    /// Une date qui ne se lit pas (non finie) ne devient jamais « original » :
    /// cet instant, qu'aucune modification réelle n'a, ne s'accorde avec aucune
    /// version que la passerelle connaisse. Le partage est alors refusé (409), et
    /// l'appareil garde sa traduction — comme le `null` du miroir TypeScript.
    static let unreadable = "1970-01-01T00:00:00.000Z"

    public static func of(editedAt: Date?) -> String {
        guard let editedAt else { return original }
        guard let milliseconds = Int64(exactly: (editedAt.timeIntervalSince1970 * 1000).rounded()) else {
            return unreadable
        }
        var wholeSeconds = milliseconds / 1000
        var fraction = milliseconds % 1000
        if fraction < 0 {
            fraction += 1000
            wholeSeconds -= 1
        }
        let parts = utc.dateComponents(
            [.year, .month, .day, .hour, .minute, .second],
            from: Date(timeIntervalSince1970: TimeInterval(wholeSeconds))
        )
        return String(
            format: "%04ld-%02ld-%02ldT%02ld:%02ld:%02ld.%03ldZ",
            parts.year ?? 0, parts.month ?? 0, parts.day ?? 0,
            parts.hour ?? 0, parts.minute ?? 0, parts.second ?? 0,
            Int(fraction)
        )
    }

    private static var utc: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
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

/// Un partage que la passerelle refuse — miroir de
/// `SHARED_TRANSLATION_ERROR_CODES` (`packages/shared/types/
/// shared-translation.ts`). Deux refus, de portées différentes :
/// - `readReceiptsOff` (403) vise le COMPTE, quel que soit le message : un partage
///   est un accusé de lecture, et qui a coupé les siens ne partage pas ;
/// - `staleSource` (409) vise CE message : son texte a été modifié depuis que
///   l'appareil l'a traduit, la traduction ne dit plus ce que le message dit.
///
/// Dans les deux cas l'appareil garde sa traduction pour lui. Le premier se
/// retient (plus aucun partage de ce compte), le second non (le message suivant
/// peut se partager).
public enum SharedTranslationShareRefusal: Error, Equatable, Sendable, CaseIterable {
    case readReceiptsOff
    case staleSource

    /// Le code machine que la passerelle pose sur ce refus (403 ou 409).
    public var code: String {
        switch self {
        case .readReceiptsOff: return "SHARED_TRANSLATION_READ_RECEIPTS_OFF"
        case .staleSource: return "SHARED_TRANSLATION_STALE_SOURCE"
        }
    }

    /// Le refus qu'un code machine désigne ; `nil` pour tout autre code, ou
    /// pour une réponse qui n'en porte pas.
    public init?(code: String?) {
        guard let code, let refusal = Self.allCases.first(where: { $0.code == code }) else { return nil }
        self = refusal
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
