import Foundation

/// La version de l'information sur ce qui part chez Meta que CE client montre
/// (#17120, chantier #17007). Miroir de `EXTERNAL_INTEROP_NOTICE_VERSION`
/// (`packages/shared/types/external-interop-compliance.ts`) : la passerelle
/// refuse tout consentement donné sous une autre version (409
/// `EXTERNAL_CONVERSATION_NOTICE_OUTDATED`), et un témoin compare les deux.
public enum ExternalInteropNotice {
    public static let version = "2026-11-10"
}

/// Ce qui PEUT partir chez Meta quand on écrit à un ami WhatsApp, dans l'ordre
/// où l'écran d'information le dit. Une clé inconnue de ce client s'ignore.
public enum ExternalInteropDisclosure: String, Sendable, CaseIterable {
    case phoneNumber = "phone-number"
    case profileName = "profile-name"
    case publicKeys = "public-keys"
    case encryptedContent = "encrypted-content"
    case deliveryMetadata = "delivery-metadata"
}

/// `GET /conversations/external/consent` : l'information en vigueur et le
/// consentement du compte. `disclosures` reste en chaînes : une entrée ajoutée
/// côté serveur ne doit pas faire échouer le décodage d'un ancien client.
public struct ExternalInteropConsentStatus: Decodable, Sendable, Equatable {
    public struct Consent: Decodable, Sendable, Equatable {
        public let grantedAt: String
        public let noticeVersion: String
    }

    public let network: String
    public let noticeVersion: String
    public let disclosures: [String]
    public let retentionDays: Int
    public let consent: Consent?
    public let current: Bool

    public var knownDisclosures: [ExternalInteropDisclosure] {
        disclosures.compactMap(ExternalInteropDisclosure.init(rawValue:))
    }
}

/// L'accusé d'un signalement de contenu externe : ce qui a été fait, et où
/// orienter la personne pour agir chez WhatsApp (`meta-reporting`).
public struct ExternalReportAcknowledgement: Decodable, Sendable, Equatable {
    public let reportId: String
    public let peerBlocked: Bool
    public let orientation: String
}
