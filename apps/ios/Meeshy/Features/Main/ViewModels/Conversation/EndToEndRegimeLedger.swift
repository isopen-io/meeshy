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
///   événement socket) : elles disent le régime dans les deux sens. Seule une
///   époque STRICTEMENT plus récente change le régime ; à époque égale, seul
///   le bout en bout l'emporte (fermé par défaut) ;
/// - NON DATÉES (un mode lu ailleurs, un refus du clair) : elles ne font
///   qu'ajouter le bout en bout, en gardant l'époque connue — elles ne
///   rouvrent jamais le clair.
///
/// Toutes viennent du serveur. Une désactivation qu'il annonce ne s'applique
/// donc pas seule à l'envoi (#12846) : là où cet appareil a vu le bout en
/// bout — à l'ouverture, au cache, dans ce registre, ou par un message chiffré
/// présent dans le fil (ce qui survit au redémarrage de l'app) —, le clair
/// n'est rendu qu'une fois la bascule de CETTE époque VUE par l'utilisateur :
/// l'avis système affiché dans le fil, son propre geste de désactivation, ou
/// sa confirmation explicite dans la fiche du chiffrement. Jusque-là l'envoi
/// est suspendu, et l'interface le dit. Un avis de réactivation plus récent
/// que la désactivation connue scelle (sources divergentes ⇒ chiffré).
/// Ces signaux rendent la bascule VISIBLE ; aucun ne l'authentifie (#12866).
final class EndToEndRegimeLedger {
    static let shared = EndToEndRegimeLedger(memory: EndToEndRegimeMemory.shared)

    /// La lecture apprend les MÊMES bascules datées que l'envoi (#12883) :
    /// après une désactivation, les messages suivants retrouvent la traduction
    /// du serveur et perdent le marqueur « non chiffré ».
    private let memory: (any EndToEndRegimeMemoryProviding)?

    init(memory: (any EndToEndRegimeMemoryProviding)? = nil) {
        self.memory = memory
    }

    struct Regime: Equatable {
        let isEndToEnd: Bool
        let epoch: Int?
    }

    /// Ce que l'envoi suivant a le droit de faire.
    enum Sending: Equatable {
        /// Scellé de bout en bout.
        case sealed
        /// En clair : la conversation n'est pas chiffrée de bout en bout, ou la
        /// désactivation a été vue.
        case plaintext
        /// Le serveur annonce une désactivation que l'utilisateur n'a pas vue :
        /// rien ne part, l'interface le dit.
        /// `epoch` est nul quand seul le fil montre le bout en bout, sans
        /// régime daté : la fiche du chiffrement relit alors l'époque.
        case downgradeUnconfirmed(epoch: Int?)

        var awaitsConfirmation: Bool {
            if case .downgradeUnconfirmed = self { return true }
            return false
        }
    }

    private var regimes: [String: Regime] = [:]
    /// Les conversations où cet appareil a vu le bout en bout, de quelque source.
    private var witnessedEndToEnd: Set<String> = []
    /// L'époque de la dernière désactivation que l'utilisateur a confirmée.
    private var confirmedDowngrades: [String: Int] = [:]

    /// Ce que le fil OUVERT montre du régime (`EncryptionSwitchNoticeTrail`).
    struct ThreadEvidence: Equatable {
        /// Un signal de régime affiché dans le fil, daté par le serveur.
        enum Signal: Equatable {
            /// Un message chiffré de bout en bout.
            case endToEnd
            /// L'avis d'une activation du bout en bout, de cette époque.
            case enabled(epoch: Int)
            /// L'avis d'une désactivation du bout en bout, de cette époque.
            case disabled(epoch: Int)
        }

        /// Le signal le PLUS RÉCENT du fil : une désactivation n'est vue que si
        /// son avis vient après le dernier message chiffré et la dernière activation.
        var latest: Signal?
        /// Un message chiffré de bout en bout (supprimé compris) ou un avis
        /// d'activation est affiché, à quelque moment que ce soit.
        var endToEndShown = false

        static let none = ThreadEvidence()
    }

    /// La désactivation que la fiche du chiffrement fait confirmer.
    enum PendingDowngrade: Equatable {
        /// Datée par le serveur.
        case epoch(Int)
        /// Le fil montre le bout en bout, le serveur ne date rien (passerelle
        /// antérieure, anciens messages chiffrés d'une conversation en clair).
        case undated
    }

    /// Les conversations dont l'envoi attend une confirmation non datée.
    private var undatedPending: Set<String> = []
    /// Les confirmations non datées, effacées dès qu'un bout en bout est appris.
    private var undatedConfirmed: Set<String> = []

    // Isolé au MainActor par défaut : une deinit isolée tue xctest au démontage
    // hors d'une tâche (iOS 18.4+/26, Swift #85663).
    // Garde : MainActorDeinitSourceGuardTests / check-ios-isolated-deinits.sh.
    nonisolated deinit {}

    func learn(mode: String?, for conversationId: String) {
        guard EndToEndSendGate.requiresSeal(conversationEncryptionModes: [mode]) else { return }
        learnEndToEnd(for: conversationId)
    }

    /// Le bout en bout appris sans date : l'époque connue est gardée.
    func learnEndToEnd(for conversationId: String) {
        witnessedEndToEnd.insert(conversationId)
        undatedConfirmed.remove(conversationId)
        guard regimes[conversationId]?.isEndToEnd != true else { return }
        regimes[conversationId] = Regime(isEndToEnd: true, epoch: regimes[conversationId]?.epoch)
    }

    /// Un statut servi par la passerelle ; sans époque (passerelle antérieure), il ne fait qu'ajouter.
    func learn(_ status: ConversationEncryptionStatus, for conversationId: String) {
        let isEndToEnd = EndToEndSendGate.requiresSeal(conversationEncryptionModes: [status.mode])
        learn(Regime(isEndToEnd: isEndToEnd, epoch: status.epoch), for: conversationId)
        guard let epoch = status.epoch else { return }
        memory?.learn(isEndToEnd: isEndToEnd, epoch: epoch, changedAt: nil, enabledAt: status.enabledAt, for: conversationId)
    }

    func learn(_ event: ConversationEncryptionChangedEvent) {
        let isEndToEnd = EndToEndSendGate.requiresSeal(conversationEncryptionModes: [event.mode])
        learn(Regime(isEndToEnd: isEndToEnd, epoch: event.epoch), for: event.conversationId)
        memory?.learn(isEndToEnd: isEndToEnd, epoch: event.epoch, changedAt: event.changedAtDate, enabledAt: nil, for: event.conversationId)
    }

    private func learn(_ observed: Regime, for conversationId: String) {
        guard let epoch = observed.epoch else {
            if observed.isEndToEnd { learnEndToEnd(for: conversationId) }
            return
        }
        if let known = regimes[conversationId], let knownEpoch = known.epoch {
            let supersedes = epoch > knownEpoch || (epoch == knownEpoch && observed.isEndToEnd && !known.isEndToEnd)
            guard supersedes else { return }
        }
        regimes[conversationId] = observed
        guard observed.isEndToEnd else { return }
        witnessedEndToEnd.insert(conversationId)
        undatedConfirmed.remove(conversationId)
    }

    /// L'utilisateur a vu la désactivation de cette époque : son propre geste,
    /// ou sa confirmation dans la fiche du chiffrement.
    func confirmDowngrade(epoch: Int, for conversationId: String) {
        confirmedDowngrades[conversationId] = epoch
    }

    /// La confirmation donnée dans la fiche du chiffrement.
    func confirm(_ pending: PendingDowngrade, for conversationId: String) {
        undatedPending.remove(conversationId)
        switch pending {
        case .epoch(let epoch): confirmDowngrade(epoch: epoch, for: conversationId)
        case .undated: undatedConfirmed.insert(conversationId)
        }
    }

    /// La session se ferme : rien de ce compte ne vaut pour le suivant.
    func reset() {
        regimes = [:]
        witnessedEndToEnd = []
        confirmedDowngrades = [:]
        undatedPending = []
        undatedConfirmed = []
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

    /// Ce que l'envoi suivant a le droit de faire. `opening` et `cached` sont
    /// les modes lus à l'ouverture du fil et au cache ; `evidence`, ce que le
    /// fil affiche. Un bout en bout vu ici est retenu, pour que la fiche du
    /// chiffrement propose la confirmation que l'envoi attend.
    func sending(for conversationId: String, opening: String?, cached: String?, evidence: ThreadEvidence = .none) -> Sending {
        let locallyEndToEnd = EndToEndSendGate.requiresSeal(conversationEncryptionModes: [opening, cached])
        if locallyEndToEnd || evidence.endToEndShown { witnessedEndToEnd.insert(conversationId) }
        guard let learned = regimes[conversationId], let epoch = learned.epoch else {
            return undatedSending(for: conversationId, locallyEndToEnd: locallyEndToEnd, evidence: evidence)
        }
        if learned.isEndToEnd { return .sealed }
        if case .enabled(let enabled)? = evidence.latest, enabled > epoch { return .sealed }
        guard witnessedEndToEnd.contains(conversationId) else { return .plaintext }
        let seen = evidence.latest == .disabled(epoch: epoch) || confirmedDowngrades[conversationId] == epoch
        return seen ? .plaintext : .downgradeUnconfirmed(epoch: epoch)
    }

    /// Sans régime daté : une source locale ou le registre qui disent bout en
    /// bout scellent ; un fil dont le dernier signal est chiffré, contre un
    /// serveur qui ne dit rien, suspend l'envoi jusqu'à la confirmation.
    private func undatedSending(for conversationId: String, locallyEndToEnd: Bool, evidence: ThreadEvidence) -> Sending {
        if locallyEndToEnd || mode(for: conversationId) != nil { return .sealed }
        switch evidence.latest {
        case .endToEnd?, .enabled?:
            guard !undatedConfirmed.contains(conversationId) else { return .plaintext }
            undatedPending.insert(conversationId)
            return .downgradeUnconfirmed(epoch: nil)
        case .disabled?, nil:
            return .plaintext
        }
    }

    /// La désactivation que la fiche du chiffrement doit faire confirmer, ou
    /// `nil` : datée (le serveur annonce le clair à une époque, cet appareil
    /// avait vu le bout en bout, l'utilisateur ne l'a pas confirmée), ou non
    /// datée (un envoi l'attend déjà).
    func pendingDowngrade(for conversationId: String) -> PendingDowngrade? {
        if case .downgradeUnconfirmed(let epoch?) = sending(for: conversationId, opening: nil, cached: nil) { return .epoch(epoch) }
        return undatedPending.contains(conversationId) ? .undated : nil
    }
}
