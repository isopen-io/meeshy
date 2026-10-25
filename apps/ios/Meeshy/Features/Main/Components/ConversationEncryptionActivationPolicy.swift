import Foundation
import MeeshySDK

/// QUI peut activer ET désactiver (#12522) le chiffrement d'une conversation (#12517, #12588,
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

    /// Activer ET désactiver (#12522) : le droit SERVI par la passerelle
    /// (`canToggleEncryption`, appartenance et rang de groupe compris) fait foi ;
    /// une passerelle antérieure ne le sert pas, la politique de rôle le remplace.
    static func mayToggle(served: Bool?, platformRole: String?) -> Bool {
        served ?? mayActivate(platformRole: platformRole)
    }
}

/// Les modes qu'une activation propose — les valeurs que la passerelle accepte.
enum ConversationEncryptionModeChoice: String, CaseIterable, Sendable {
    case e2ee
    case server
    case hybrid
}

/// Ce que la rangée de sécurité de la fiche de conversation rend (#12880) :
/// tout membre voit l'état de chiffrement et peut ouvrir son explication ; seul
/// le rôle autorisé se voit proposer la bascule, en tête-à-tête seulement — un
/// groupe ne se bascule pas depuis iOS (#12844).
enum ConversationSecurityRowContent: Equatable {
    case directEntry(offersToggle: Bool)
    case groupEntry(showsSafetyNumber: Bool)

    static func resolve(isDirect: Bool, isEncrypted: Bool, mayToggle: Bool) -> ConversationSecurityRowContent {
        isDirect ? .directEntry(offersToggle: mayToggle) : .groupEntry(showsSafetyNumber: isEncrypted)
    }
}

/// Ce que la feuille de détail du chiffrement rend.
enum ConversationEncryptionDetailContent: Equatable {
    case loading
    case active(offersDeactivation: Bool)
    case activation
    case inactiveReadOnly

    static func resolve(isLoading: Bool, isEncrypted: Bool, mayToggle: Bool) -> ConversationEncryptionDetailContent {
        if isLoading { return .loading }
        if isEncrypted { return .active(offersDeactivation: mayToggle) }
        return mayToggle ? .activation : .inactiveReadOnly
    }
}

/// Ce que le fil OUVERT dit quand le régime bascule sous ses yeux (#12522) :
/// désactiver rend au serveur la traduction et la transcription des nouveaux
/// messages, et l'interface le dit.
enum EncryptionSwitchAnnouncement {
    static func text(for event: ConversationEncryptionChangedEvent) -> String {
        event.isEndToEnd
            ? String(localized: "conversation.encryption.switched.enabled",
                     defaultValue: "Chiffrement de bout en bout activé : les nouveaux messages sont chiffrés sur vos appareils.",
                     bundle: .main)
            : String(localized: "conversation.encryption.switched.disabled",
                     defaultValue: "Chiffrement de bout en bout désactivé : la traduction et la transcription par le serveur reviennent pour les nouveaux messages.",
                     bundle: .main)
    }
}
