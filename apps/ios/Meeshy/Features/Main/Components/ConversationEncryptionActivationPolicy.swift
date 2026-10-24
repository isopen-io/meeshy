import Foundation
import MeeshySDK

/// QUI peut activer le chiffrement d'une conversation (#12517, #12588,
/// directives du porteur) — miroir de `mayActivateConversationEncryption`
/// (`services/gateway/src/utils/encryption-activation-policy.ts`). Tant que
/// l'E2EE n'est pas opérationnel, l'activation est réservée à un rôle de
/// plateforme ANALYST ou supérieur (ANALYST, AUDIT, MODERATOR, ADMIN, BIGBOSS),
/// la casse repliée ; USER et AGENT ne l'ont pas. La passerelle fait foi par son
/// 403 et exige en plus l'appartenance à la conversation. La relâcher se fait
/// ici et dans la passerelle, nulle part ailleurs. Fermée par défaut : un rôle
/// absent ou illisible n'accorde rien.
enum ConversationEncryptionActivationPolicy {
    static let minimumPlatformRole: PlatformRole = .analyst

    static func mayActivate(platformRole: String?) -> Bool {
        guard let role = PlatformRole(caseFolding: platformRole) else { return false }
        return role >= minimumPlatformRole
    }
}

/// Ce que la rangée de sécurité de la fiche de conversation rend.
enum ConversationSecurityRowContent: Equatable {
    case hidden
    case directEntry(offersActivation: Bool)
    case safetyNumberEntry

    static func resolve(isDirect: Bool, isEncrypted: Bool, mayActivate: Bool) -> ConversationSecurityRowContent {
        guard isDirect else { return isEncrypted ? .safetyNumberEntry : .hidden }
        if isEncrypted { return .directEntry(offersActivation: false) }
        return mayActivate ? .directEntry(offersActivation: true) : .hidden
    }
}

/// Ce que la feuille de détail du chiffrement rend.
enum ConversationEncryptionDetailContent: Equatable {
    case loading
    case active
    case activation
    case inactiveReadOnly

    static func resolve(isLoading: Bool, isEncrypted: Bool, mayActivate: Bool) -> ConversationEncryptionDetailContent {
        if isLoading { return .loading }
        if isEncrypted { return .active }
        return mayActivate ? .activation : .inactiveReadOnly
    }
}
