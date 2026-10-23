import Foundation
import MeeshySDK

/// QUI peut activer le chiffrement d'une conversation (#12517, directive
/// porteur 2026-10-23) — miroir de `mayActivateConversationEncryption`
/// (`services/gateway/src/utils/encryption-activation-policy.ts`). Tant que
/// l'E2EE n'est pas opérationnel, seuls ADMIN et BIGBOSS de la plateforme
/// l'activent ; la passerelle fait foi par son 403. La relâcher se fait ici et
/// dans la passerelle, nulle part ailleurs. Fermée par défaut.
enum ConversationEncryptionActivationPolicy {
    static func mayActivate(platformRole: String?) -> Bool {
        PlatformRole(caseFolding: platformRole)?.administers ?? false
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
