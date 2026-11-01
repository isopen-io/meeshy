import Foundation
import MeeshySDK

/// QUI peut activer le chiffrement d'une conversation (#12517, #12588,
/// directives du porteur) — le bout en bout ne se désactive pas (#12949), le
/// chiffrement au repos non plus — miroir de `mayActivateConversationEncryption`
/// (`services/gateway/src/utils/encryption-activation-policy.ts`). Tant que
/// l'E2EE n'est pas opérationnel, l'activation est réservée à un rôle de
/// plateforme ANALYST ou supérieur (ANALYST, AUDIT, MODERATOR, ADMIN, BIGBOSS),
/// la casse repliée ; USER et AGENT ne l'ont pas. La passerelle fait foi par son
/// 403 et exige en plus l'appartenance à la conversation. La relâcher se fait
/// ici et dans la passerelle, nulle part ailleurs. Fermée par défaut : un rôle
/// absent ou illisible n'accorde rien.
/// La même règle choisit le bout en bout à la création
/// (`ConversationCreationEncryption.mayChooseEndToEnd`, SDK) : elle y est lue,
/// jamais réécrite.
enum ConversationEncryptionActivationPolicy {
    static let minimumPlatformRole: PlatformRole = ConversationCreationEncryption.endToEndMinimumPlatformRole

    /// Le rôle de plateforme de la session ouverte : la source par défaut des
    /// écrans qui proposent le bout en bout (écran de création compris).
    @MainActor static func currentPlatformRole() -> String? {
        AuthManager.shared.currentUser?.role
    }

    static func mayActivate(platformRole: String?) -> Bool {
        ConversationCreationEncryption.mayChooseEndToEnd(platformRole: platformRole)
    }

    /// Activer : le droit SERVI par la passerelle (`canToggleEncryption`,
    /// appartenance et rang de groupe compris) fait foi ; une passerelle
    /// antérieure ne le sert pas, la politique de rôle le remplace.
    static func mayToggle(served: Bool?, platformRole: String?) -> Bool {
        served ?? mayActivate(platformRole: platformRole)
    }
}

/// Les modes qu'une activation ou une bascule propose — les valeurs que la
/// passerelle accepte, celles de l'écran de création (une seule liste, SDK).
typealias ConversationEncryptionModeChoice = ConversationCreationEncryption.Mode

/// Ce que la rangée de sécurité de la fiche de conversation rend (#12880) :
/// tout membre voit l'état de chiffrement et peut ouvrir son explication ; seul
/// le rôle autorisé se voit proposer l'activation, en tête-à-tête seulement — un
/// groupe ne s'active pas depuis iOS (#12844).
enum ConversationSecurityRowContent: Equatable {
    case directEntry(offersToggle: Bool)
    case groupEntry(showsSafetyNumber: Bool)

    static func resolve(isDirect: Bool, isEncrypted: Bool, mayToggle: Bool) -> ConversationSecurityRowContent {
        isDirect ? .directEntry(offersToggle: mayToggle) : .groupEntry(showsSafetyNumber: isEncrypted)
    }
}

/// Ce que la feuille de détail du chiffrement rend (directive porteur) :
/// le chiffrement au repos ne se désactive plus
/// (`409 ENCRYPTION_AT_REST_PERMANENT`) ; une conversation `server` ou `hybrid`
/// passe directement à un autre mode, bout en bout compris, au rôle autorisé ;
/// le bout en bout ne se quitte jamais (#12949).
enum ConversationEncryptionDetailContent: Equatable {
    case loading
    case active(offersModeSwitch: Bool)
    case activation
    case inactiveReadOnly

    static func resolve(isLoading: Bool, isEncrypted: Bool, isEndToEnd: Bool, mayToggle: Bool) -> ConversationEncryptionDetailContent {
        if isLoading { return .loading }
        if isEncrypted { return .active(offersModeSwitch: mayToggle && !isEndToEnd) }
        return mayToggle ? .activation : .inactiveReadOnly
    }
}

/// Les modes vers lesquels une conversation chiffrée au repos peut passer :
/// tous sauf le sien ; aucun depuis le bout en bout (#12949). Passer au bout
/// en bout se confirme, parce qu'on n'en revient pas.
enum ConversationEncryptionModeSwitch {
    static func targets(from current: ConversationEncryptionModeChoice) -> [ConversationEncryptionModeChoice] {
        guard current != .e2ee else { return [] }
        return ConversationEncryptionModeChoice.allCases.filter { $0 != current }
    }

    static func requiresConfirmation(_ target: ConversationEncryptionModeChoice) -> Bool {
        target == .e2ee
    }
}

/// L'écart entre la conversation que cet appareil a vue chiffrée de bout en
/// bout et le régime que le serveur sert (#12949) : la fiche le dit, et ne
/// propose que de rétablir le bout en bout, au rôle qui peut l'activer.
enum ConversationEncryptionServedGap: Equatable {
    case shown
    case restorable

    static func resolve(remembersEndToEnd: Bool, servedEndToEnd: Bool?, mayRestore: Bool) -> ConversationEncryptionServedGap? {
        guard remembersEndToEnd, servedEndToEnd == false else { return nil }
        return mayRestore ? .restorable : .shown
    }
}

/// Le contact d'un tête-à-tête, que la fiche Chiffrement nomme (#12966).
struct ConversationEncryptionPeer: Equatable {
    let userId: String
    let name: String
}

/// L'autre tête-à-tête de la paire (#12966) : une paire a au plus un
/// tête-à-tête chiffré de bout en bout et au plus un que le serveur lit. Ouvrir
/// le lisible ne ramène JAMAIS dans un fil servi, ou déjà vu, chiffré de bout en
/// bout (#12949) — ni dans celui d'où l'on part (passerelle antérieure qui
/// ignore `plaintext`).
enum ReadableDirectOpening {
    static func destination(opened: String, from current: String, openedIsEndToEnd: Bool) -> String? {
        guard !opened.isEmpty, opened != current, !openedIsEndToEnd else { return nil }
        return opened
    }

    /// La passerelle rend comme « lisible » le fil d'où l'on part : elle le sert
    /// déjà sans bout en bout alors que cet appareil l'a vu chiffré (#12987). Il
    /// faut d'abord y rétablir le chiffrement ; l'échec le dit.
    static func returnsTheServedGap(opened: String, from current: String) -> Bool {
        !opened.isEmpty && opened == current
    }
}

/// Ce que le fil OUVERT dit quand le bout en bout s'active sous ses yeux
/// (#12522). Une annonce vers le clair ne se dit pas : le bout en bout ne se
/// désactive pas (#12949), et le fil vu chiffré le reste.
enum EncryptionSwitchAnnouncement {
    static func text(for event: ConversationEncryptionChangedEvent) -> String? {
        guard event.isEndToEnd else { return nil }
        return String(localized: "conversation.encryption.switched.enabled",
                      defaultValue: "Chiffrement de bout en bout activé : les nouveaux messages sont chiffrés sur vos appareils.",
                      bundle: .main)
    }
}
