import Combine
import Foundation
import MeeshySDK

/// Le régime de chiffrement qu'un fil APPREND après son ouverture (#11379,
/// commutable depuis #12522).
///
/// `ConversationViewModel` lit le régime à la ligne qui a ouvert le fil et à
/// la conversation relue UNE fois du cache : une bascule faite depuis la
/// fiche du fil ouvert, annoncée par le socket (`conversation:encryption-changed`)
/// ou révélée par un refus de la passerelle n'atteignait jamais l'envoi
/// suivant. Ce registre les retient pour la durée de vie de l'app ; le
/// scelleur le lit au moment de sceller.
///
/// Deux sortes d'observations :
/// - DATÉES par l'époque du régime (statut servi, réponse d'une bascule,
///   événement socket) : elles disent le régime dans les deux sens, et une
///   époque plus ancienne n'efface jamais une plus récente ;
/// - NON DATÉES (un mode lu ailleurs, un refus du clair) : elles ne font
///   qu'ajouter le bout en bout — fermé par défaut, elles ne rouvrent jamais
///   le clair.
final class EndToEndRegimeLedger {
    static let shared = EndToEndRegimeLedger()

    struct Regime: Equatable {
        let isEndToEnd: Bool
        let epoch: Int?
    }

    private var regimes: [String: Regime] = [:]

    // Isolé au MainActor par défaut : une deinit isolée tue xctest au démontage
    // hors d'une tâche (iOS 18.4+/26, Swift #85663).
    // Garde : MainActorDeinitSourceGuardTests / check-ios-isolated-deinits.sh.
    nonisolated deinit {}

    func learn(mode: String?, for conversationId: String) {
        guard EndToEndSendGate.requiresSeal(conversationEncryptionModes: [mode]) else { return }
        learnEndToEnd(for: conversationId)
    }

    func learnEndToEnd(for conversationId: String) {
        guard regimes[conversationId]?.isEndToEnd != true else { return }
        regimes[conversationId] = Regime(isEndToEnd: true, epoch: nil)
    }

    /// Un statut servi par la passerelle ; sans époque (passerelle antérieure), il ne fait qu'ajouter.
    func learn(_ status: ConversationEncryptionStatus, for conversationId: String) {
        learn(Regime(isEndToEnd: EndToEndSendGate.requiresSeal(conversationEncryptionModes: [status.mode]), epoch: status.epoch), for: conversationId)
    }

    func learn(_ event: ConversationEncryptionChangedEvent) {
        learn(Regime(isEndToEnd: EndToEndSendGate.requiresSeal(conversationEncryptionModes: [event.mode]), epoch: event.epoch), for: event.conversationId)
    }

    private func learn(_ observed: Regime, for conversationId: String) {
        guard let epoch = observed.epoch else {
            if observed.isEndToEnd { learnEndToEnd(for: conversationId) }
            return
        }
        if let known = regimes[conversationId]?.epoch, known > epoch { return }
        regimes[conversationId] = observed
    }

    /// Apprend chaque bascule annoncée par la passerelle (`conversation:encryption-changed`).
    func listen(to changes: AnyPublisher<ConversationEncryptionChangedEvent, Never>) -> AnyCancellable {
        changes.sink { [weak self] event in self?.learn(event) }
    }

    /// Ce que le fil a appris de ce régime, ou `nil` s'il n'a rien appris.
    func regime(for conversationId: String) -> Regime? { regimes[conversationId] }

    /// `"e2ee"` quand le fil a appris le chiffrement de bout en bout, sinon `nil`.
    func mode(for conversationId: String) -> String? {
        regimes[conversationId]?.isEndToEnd == true ? E2EEWire.mode : nil
    }

    /// Les modes que le scelleur juge. Un régime DATÉ appris après l'ouverture
    /// fait foi seul ; sinon il suffit qu'une source dise bout en bout.
    func sealingModes(for conversationId: String, opening: String?, cached: String?) -> [String?] {
        guard let learned = regimes[conversationId], learned.epoch != nil else {
            return [opening, cached, mode(for: conversationId)]
        }
        return [learned.isEndToEnd ? E2EEWire.mode : nil]
    }
}
