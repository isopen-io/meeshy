import Foundation
import MeeshySDK

/// Le régime de chiffrement qu'un fil APPREND après son ouverture (#11379).
///
/// `ConversationViewModel` lit le régime à la ligne qui a ouvert le fil et à
/// la conversation relue UNE fois du cache : une activation faite depuis la
/// fiche du fil ouvert (`ConversationEncryptionDetailSheet`), ou un refus du
/// clair par la passerelle (`E2EE_PLAINTEXT_REFUSED`, #11216), n'atteignaient
/// jamais l'envoi suivant, qui repartait en clair. Ce registre les retient
/// pour la durée de vie de l'app ; le scelleur le lit au moment de sceller.
///
/// Il n'apprend que ce qui retire le clair au serveur : l'activation ne se
/// défait pas, et un mode lisible par le serveur n'efface rien.
final class EndToEndRegimeLedger {
    static let shared = EndToEndRegimeLedger()

    private var sealedConversationIds: Set<String> = []

    // Isolé au MainActor par défaut : une deinit isolée tue xctest au démontage
    // hors d'une tâche (iOS 18.4+/26, Swift #85663).
    // Garde : MainActorDeinitSourceGuardTests / check-ios-isolated-deinits.sh.
    nonisolated deinit {}

    func learn(mode: String?, for conversationId: String) {
        guard EndToEndSendGate.requiresSeal(conversationEncryptionModes: [mode]) else { return }
        sealedConversationIds.insert(conversationId)
    }

    func learnEndToEnd(for conversationId: String) {
        sealedConversationIds.insert(conversationId)
    }

    /// `"e2ee"` quand le fil a appris le chiffrement de bout en bout, sinon `nil`.
    func mode(for conversationId: String) -> String? {
        sealedConversationIds.contains(conversationId) ? "e2ee" : nil
    }
}
