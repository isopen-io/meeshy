import Foundation
import MeeshySDK

/// Relit le régime de chiffrement à la passerelle quand elle a refusé un envoi
/// scellé sous un régime périmé (`E2EE_REGIME_CHANGED`, #12522) : le registre
/// apprend le régime courant, daté de son époque, et le geste suivant de
/// l'utilisateur part selon lui. Rien n'est renvoyé de lui-même.
final class EndToEndRegimeRefresher {
    private let ledger: EndToEndRegimeLedger
    private let service: any ConversationEncryptionServiceProviding
    private var pending: Task<Void, Never>?

    // Isolé au MainActor par défaut : une deinit isolée tue xctest au démontage
    // hors d'une tâche (iOS 18.4+/26, Swift #85663).
    nonisolated deinit {}

    init(ledger: EndToEndRegimeLedger, service: any ConversationEncryptionServiceProviding) {
        self.ledger = ledger
        self.service = service
    }

    func refresh(conversationId: String) {
        pending = Task { @MainActor [ledger, service] in
            guard let status = try? await service.fetchStatus(conversationId: conversationId) else { return }
            ledger.learn(status, for: conversationId)
        }
    }

    /// La relecture en cours, attendue (tests, enchaînement d'un geste).
    func settle() async {
        await pending?.value
    }
}
