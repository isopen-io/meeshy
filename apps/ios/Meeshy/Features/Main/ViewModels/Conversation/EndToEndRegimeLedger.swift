import Combine
import Foundation
import MeeshySDK

/// Le régime de chiffrement qu'un fil APPREND après son ouverture (#11379,
/// #12949).
///
/// `ConversationViewModel` lit le régime à la ligne qui a ouvert le fil et à
/// la conversation relue du cache : une activation faite depuis la fiche du fil
/// ouvert, annoncée par le socket (`conversation:encryption-changed`) ou
/// révélée par un refus de la passerelle n'atteignait jamais l'envoi suivant.
/// Le registre les apprend et les range dans la mémoire du compte
/// (`EndToEndRegimeMemoryProviding`), la MÊME que la lecture lit : l'envoi et
/// la lecture suivent une seule loi, et elle survit au redémarrage.
///
/// **Une conversation vue chiffrée de bout en bout le reste** (décision du
/// porteur, #12949) : le registre n'apprend que le bout en bout. Une
/// rétrogradation servie — statut ou événement socket sans mode, conversation
/// servie sans mode, avis de désactivation dans le fil — ne change rien : rien
/// ne part en clair là où cet appareil a vu le bout en bout, et rien ne s'y
/// lit comme lisible par le serveur. Hors du modèle : un appareil qui n'a
/// JAMAIS vu la conversation chiffrée croit le serveur sur sa première lecture
/// (#12520, bascule authentifiée par son auteur : #12866).
final class EndToEndRegimeLedger {
    static let shared = EndToEndRegimeLedger(memory: EndToEndRegimeMemory.shared)

    private let memory: any EndToEndRegimeMemoryProviding
    /// L'époque du régime chiffré connue, que l'envoi scellé déclare (#12522).
    private var epochs: [String: Int] = [:]
    /// Les conversations vues chiffrées que la passerelle a, en dernier, servies
    /// sans bout en bout (statut ou bascule annoncée) pendant cette session
    /// (#12987). Un régime chiffré servi de nouveau les en retire.
    private var servedWithoutEndToEnd: Set<String> = []

    init(memory: any EndToEndRegimeMemoryProviding = EndToEndRegimeMemory(defaults: nil)) {
        self.memory = memory
    }

    // Isolé au MainActor par défaut : une deinit isolée tue xctest au démontage
    // hors d'une tâche (iOS 18.4+/26, Swift #85663).
    // Garde : MainActorDeinitSourceGuardTests / check-ios-isolated-deinits.sh.
    nonisolated deinit {}

    func learn(mode: String?, for conversationId: String) {
        guard EndToEndSendGate.requiresSeal(conversationEncryptionModes: [mode]) else { return }
        servedWithoutEndToEnd.remove(conversationId)
        learnEndToEnd(for: conversationId)
    }

    /// Le bout en bout appris, daté de son activation quand la source la donne.
    func learnEndToEnd(for conversationId: String, enabledAt: Date? = nil, epoch: Int? = nil) {
        _ = memory.resolve(conversationId: conversationId, served: EndToEndRegime(encryptionMode: E2EEWire.mode, enabledAt: enabledAt))
        guard let epoch, epoch > epochs[conversationId] ?? Int.min else { return }
        epochs[conversationId] = epoch
    }

    /// Un statut servi par la passerelle : seul le bout en bout s'apprend. Un
    /// statut chiffré sans mode se lit comme le bout en bout (fail-closed).
    func learn(_ status: ConversationEncryptionStatus, for conversationId: String) {
        guard EndToEndSendGate.requiresSeal(conversationEncryptionModes: [status.mode])
                || (status.isEncrypted && status.mode == nil)
        else { return noteServedWithoutEndToEnd(conversationId) }
        servedWithoutEndToEnd.remove(conversationId)
        learnEndToEnd(for: conversationId, enabledAt: status.enabledAt, epoch: status.epoch)
    }

    /// Une bascule annoncée par la passerelle : seule une activation s'apprend.
    func learn(_ event: ConversationEncryptionChangedEvent) {
        guard EndToEndSendGate.requiresSeal(conversationEncryptionModes: [event.mode]) else {
            return noteServedWithoutEndToEnd(event.conversationId)
        }
        servedWithoutEndToEnd.remove(event.conversationId)
        learnEndToEnd(for: event.conversationId, enabledAt: event.changedAtDate, epoch: event.epoch)
    }

    /// Une conversation jamais vue chiffrée, servie en clair, n'est pas un écart.
    private func noteServedWithoutEndToEnd(_ conversationId: String) {
        guard remembersEndToEnd(conversationId) else { return }
        servedWithoutEndToEnd.insert(conversationId)
    }

    /// La session se ferme : l'époque apprise ne vaut pas pour le compte
    /// suivant. La mémoire, elle, est rangée par compte.
    func reset() {
        epochs = [:]
        servedWithoutEndToEnd = []
    }

    /// Apprend chaque bascule annoncée par la passerelle (`conversation:encryption-changed`).
    func listen(to changes: AnyPublisher<ConversationEncryptionChangedEvent, Never>) -> AnyCancellable {
        changes.sink { [weak self] event in self?.learn(event) }
    }

    /// L'époque du régime chiffré apprise, ou `nil`.
    func epoch(for conversationId: String) -> Int? { epochs[conversationId] }

    /// La mémoire est-elle liée au compte ? Un réveil à froid en arrière-plan
    /// (réponse depuis une bannière, file vidée par BGAppRefresh) précède la
    /// liaison de `DependencyContainer` : la mémoire se lie alors au compte
    /// actif que `account` rend. `false` ⇒ aucun compte connu.
    func ensureBound(to account: @MainActor () -> String?) -> Bool {
        if !memory.isBound, let account = account() { memory.bind(account: account) }
        return memory.isBound
    }

    /// Cet appareil a-t-il vu cette conversation chiffrée de bout en bout ?
    func remembersEndToEnd(_ conversationId: String) -> Bool {
        memory.resolve(conversationId: conversationId, served: .serverReadable).isEndToEnd
    }

    /// Le dernier statut que la passerelle a servi ne dit pas le bout en bout
    /// d'une conversation que cet appareil a vue chiffrée (#12987).
    func servesWithoutEndToEnd(_ conversationId: String) -> Bool {
        servedWithoutEndToEnd.contains(conversationId) && remembersEndToEnd(conversationId)
    }

    /// L'envoi suivant doit-il être scellé ? Oui dès qu'UNE source dit le bout
    /// en bout : la ligne qui a ouvert le fil, la conversation relue du cache,
    /// la mémoire du compte, ou l'avis d'activation affiché dans le fil
    /// (`activationShownAt`, daté par le serveur). Ce qui est vu ici est retenu.
    func seals(for conversationId: String, opening: String?, cached: String?, activationShownAt: Date? = nil) -> Bool {
        if let activationShownAt { learnEndToEnd(for: conversationId, enabledAt: activationShownAt) }
        if EndToEndSendGate.requiresSeal(conversationEncryptionModes: [opening, cached]) {
            learnEndToEnd(for: conversationId)
            return true
        }
        return remembersEndToEnd(conversationId)
    }
}
