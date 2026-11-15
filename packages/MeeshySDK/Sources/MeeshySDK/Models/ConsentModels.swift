import Foundation

/// Les cinq finalités d'un consentement — miroir de `CONSENT_PURPOSES`
/// (`packages/shared/types/consents.ts`), confronté à sa source par
/// `ConsentContractTests`.
public enum ConsentPurpose: String, CaseIterable, Codable, Sendable {
    case dataProcessing = "data-processing"
    case analytics
    case voiceData = "voice-data"
    case voiceProfile = "voice-profile"
    case voiceCloning = "voice-cloning"

    /// Le parent direct — miroir de `CONSENT_PARENT`. Un octroi par
    /// `PUT /me/consents/{purpose}` pose AUSSI, côté serveur, chaque ancêtre
    /// qui manque (`ancestorsOf`, `services/gateway/src/routes/me/consents.ts`).
    public var parent: ConsentPurpose? {
        switch self {
        case .dataProcessing: return nil
        case .analytics, .voiceData: return .dataProcessing
        case .voiceProfile: return .voiceData
        case .voiceCloning: return .voiceProfile
        }
    }

    /// La finalité suivie de ses ancêtres : ce qu'un octroi réussi rend accordé.
    public var lineage: [ConsentPurpose] {
        [self] + (parent?.lineage ?? [])
    }
}

public enum ConsentPolicy {
    /// Miroir de `CONSENT_POLICY_VERSION_DEFAULT`. La passerelle répond 409 à
    /// toute autre valeur : un client ne consent qu'à la politique en vigueur.
    public static let defaultVersion = "2026-08-30"
}

/// Une entrée servie par `GET /me/consents` ou rendue par
/// `PUT /me/consents/{purpose}`. `purpose` reste une chaîne : une finalité
/// qu'une passerelle plus récente ajouterait ne doit pas faire échouer le
/// décodage des cinq autres.
public struct ConsentEntry: Decodable, Equatable, Sendable {
    public let purpose: String
    public let granted: Bool
    public let grantedAt: String?
    public let policyVersion: String

    public init(purpose: String, granted: Bool, grantedAt: String?, policyVersion: String) {
        self.purpose = purpose
        self.granted = granted
        self.grantedAt = grantedAt
        self.policyVersion = policyVersion
    }

    public var consentPurpose: ConsentPurpose? { ConsentPurpose(rawValue: purpose) }
}

struct ConsentsSnapshot: Decodable, Sendable {
    let consents: [ConsentEntry]
}

/// Le corps entier de `PUT /me/consents/{purpose}` — la passerelle le borne
/// par `.strict()` : aucune date, le serveur horodate seul.
struct ConsentUpdateRequest: Encodable, Sendable {
    let granted: Bool
    let policyVersion: String
}
