import Foundation
import Combine
import MeeshySDK
import os

/// Ce que l'utilisateur LIT d'une réponse rapide qui attend son régime
/// (#14673, #9223 : pas de perte silencieuse). Aucun corps ne porte le texte
/// saisi : des libellés du catalogue, et la route vers la conversation.
struct NotificationReplyWaitNotices {
    /// La réponse attend que la conversation se relise.
    var waiting: @MainActor (_ conversationId: String, _ clientMessageId: String) -> Void
    /// Elle est partie, ou sa bulle scellée est née : l'annonce d'attente part.
    var settled: @MainActor (_ clientMessageId: String) -> Void
    /// Elle ne partira jamais (plus membre, conversation supprimée, échue,
    /// compte déconnecté, clair perdu) : l'utilisateur le lit.
    var dropped: @MainActor (_ conversationId: String, _ clientMessageId: String?) -> Void

    static let live = NotificationReplyWaitNotices(
        waiting: { NotificationReplyFailure.postReplyAwaitingRegime(conversationId: $0, clientMessageId: $1) },
        settled: { NotificationReplyFailure.withdrawReplyAwaitingRegime(clientMessageId: $0) },
        dropped: { NotificationReplyFailure.postReplyNeverSent(conversationId: $0, clientMessageId: $1) }
    )
}

/// **Une réponse rapide en attente de son régime ne se perd pas en silence, et
/// ne part pas des semaines plus tard** (#14673, suite de #14667 et #13165).
///
/// Le chemin `.unconfirmed` de `NotificationReplyRegime` range le clair au
/// coffre sous une fiche sans texte ; ce type tient la suite :
/// - l'attente se DIT (notification locale) et se retire quand elle se solde ;
/// - une passerelle qui refuse pour de bon (son enveloppe et un code de
///   conversation perdue, #14693) retire la réponse ;
/// - une fiche plus vieille que `maxAge` est retirée sans relecture ;
/// - un compte déconnecté (sa session n'est plus gardée au trousseau) voit ses
///   fiches retirées — un changement de compte, qui la garde, ne les touche pas ;
/// - retirer, c'est dire « non envoyée » puis effacer le clair du coffre ; un
///   coffre fermé (autre compte, session close) garde la fiche RETIRÉE, qui ne
///   part plus jamais et n'attend que l'effacement.
///
/// Une seule relecture à la fois (`confirming`) : les réveils de l'outbox se
/// chevauchent, et deux relectures d'une même fiche enverraient deux fois.
/// Seules les fiches du compte actif se relisent : la fiche de A relue sous B
/// écrirait une bulle de A dans la base de B.
///
/// Pourquoi aucune bulle « en attente » dans le fil : toute ligne y scelle le
/// fil (`e2ee`, mode inconnu) ou y pose le clair sur le disque (décision
/// « une réponse rapide confirme le régime avant tout clair ») — la
/// notification locale est le seul état visible sûr.
@MainActor
final class NotificationReplyRegimeWait {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466) → double-free au démontage
    // hors d'une tâche. Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    /// Au-delà, une réponse rapide n'a plus de contexte : elle ne part plus.
    static let maxAge: TimeInterval = 24 * 3600

    struct Rules {
        var notices: NotificationReplyWaitNotices
        /// La session du compte est-elle encore gardée au trousseau ? Non
        /// après une déconnexion ; oui pendant un changement de compte.
        var sessionIsPreserved: @MainActor (String) -> Bool
        var now: @MainActor () -> Date
        var maxAge: TimeInterval = NotificationReplyRegimeWait.maxAge

        static let live = Rules(
            notices: .live,
            sessionIsPreserved: { AuthManager.shared.hasPreservedSession(for: $0) },
            now: { Date() }
        )
    }

    private let store: any NotificationRepliesAwaitingRegimeStoring
    private let rules: Rules
    private let endToEnd: any EndToEndMessagingProviding
    private let currentUserId: @MainActor () -> String?
    private let destination: @MainActor (String) async -> NotificationReplyRegime.Destination
    private let offThreadReply: @MainActor () -> EndToEndOffThreadReply
    private let sendReadable: @MainActor (OfflineQueueItem, String) async -> Void
    private let notifyRefusedEndToEndReply: @MainActor (String, EndToEndSendRefusal) -> Void
    private var confirming = false
    private var signOutSubscription: AnyCancellable?

    init(
        store: any NotificationRepliesAwaitingRegimeStoring,
        rules: Rules,
        endToEnd: any EndToEndMessagingProviding,
        currentUserId: @escaping @MainActor () -> String?,
        destination: @escaping @MainActor (String) async -> NotificationReplyRegime.Destination,
        offThreadReply: @escaping @MainActor () -> EndToEndOffThreadReply,
        sendReadable: @escaping @MainActor (OfflineQueueItem, String) async -> Void,
        notifyRefusedEndToEndReply: @escaping @MainActor (String, EndToEndSendRefusal) -> Void
    ) {
        self.store = store
        self.rules = rules
        self.endToEnd = endToEnd
        self.currentUserId = currentUserId
        self.destination = destination
        self.offThreadReply = offThreadReply
        self.sendReadable = sendReadable
        self.notifyRefusedEndToEndReply = notifyRefusedEndToEndReply
    }

    /// Le geste dont le régime n'a pas pu être relu : le clair au coffre, la
    /// fiche, et l'attente annoncée. Faute de coffre, rien ne s'écrit et le
    /// refus se dit.
    func hold(_ item: OfflineQueueItem, senderId: String) async {
        guard await offThreadReply().vault(item, senderId: senderId) else {
            Logger.e2ee.warning("notification reply: regime not confirmed and the vault did not keep it, nothing written")
            notifyRefusedEndToEndReply(item.conversationId, .unkeptOutsideConversation)
            return
        }
        store.add(NotificationReplyAwaitingRegime(item, senderId: senderId, createdAt: rules.now()))
        rules.notices.waiting(item.conversationId, item.clientMessageId)
    }

    /// Le geste vers une conversation que la passerelle ne sert plus : rien
    /// ne s'écrit, et l'utilisateur le lit.
    func refuseInaccessible(_ conversationId: String) {
        rules.notices.dropped(conversationId, nil)
    }

    /// Relit chaque fiche : celles du compte actif se confirment, se retirent
    /// (échues, refusées) ou finissent d'effacer leur clair ; celles d'un
    /// compte déconnecté se retirent.
    func confirmAll() async {
        guard !confirming, let userId = currentUserId() else { return }
        confirming = true
        defer { confirming = false }
        for reply in store.awaiting {
            await settle(reply, activeUser: userId)
        }
    }

    /// À la sortie d'une session : les fiches des comptes dont la session
    /// n'est plus gardée sont retirées.
    func withdrawSignedOutAccounts() async {
        for reply in store.awaiting where reply.withdrawnAt == nil && !rules.sessionIsPreserved(reply.senderId) {
            await withdraw(reply)
        }
    }

    /// Chaque sortie de session (`isAuthenticated` repasse à faux) retire les
    /// fiches des comptes déconnectés. Un nouvel appel REMPLACE l'abonnement.
    func observeSignOuts(_ authenticated: AnyPublisher<Bool, Never>) {
        signOutSubscription = authenticated
            .removeDuplicates()
            .dropFirst()
            .filter { !$0 }
            .sink { [weak self] _ in self?.scheduleSignedOutWithdrawal() }
    }

    private func scheduleSignedOutWithdrawal() {
        Task { await withdrawSignedOutAccounts() }
    }

    private func settle(_ reply: NotificationReplyAwaitingRegime, activeUser: String) async {
        guard reply.senderId == activeUser else {
            if reply.withdrawnAt == nil, !rules.sessionIsPreserved(reply.senderId) { await withdraw(reply) }
            return
        }
        if reply.withdrawnAt != nil {
            await eraseWithdrawn(reply)
            return
        }
        guard rules.now().timeIntervalSince(reply.createdAt) <= rules.maxAge else {
            Logger.e2ee.warning("notification reply: awaiting regime past its age, withdrawn")
            await withdraw(reply)
            return
        }
        await confirm(reply)
    }

    /// Le régime relu l'a été sous le compte actif À CET INSTANT : changé
    /// pendant la relecture (#14706), son verdict ne dit rien de la fiche, qui
    /// attend son compte — ni retrait, ni bulle, ni envoi.
    private func confirm(_ reply: NotificationReplyAwaitingRegime) async {
        let regime = await destination(reply.conversationId)
        guard currentUserId() == reply.senderId else {
            Logger.e2ee.warning("notification reply: account switched while reading the regime, kept for its account")
            return
        }
        switch regime {
        case .unconfirmed:
            return
        case .inaccessible:
            await withdraw(reply)
        case .endToEnd:
            let refusal = await offThreadReply().bubble(reply.queueItem(content: ""), senderId: reply.senderId)
            store.remove(reply.clientMessageId)
            rules.notices.settled(reply.clientMessageId)
            notifyRefusedEndToEndReply(reply.conversationId, refusal)
        case .readableByServer:
            await sendFromVault(reply)
        }
    }

    /// Le coffre fermé fait attendre ; un clair absent du coffre ouvert ne
    /// reviendra plus : la fiche part, et l'utilisateur le lit. Un compte
    /// changé pendant la lecture du coffre fait attendre aussi : la réponse
    /// ne part que sous son compte.
    private func sendFromVault(_ reply: NotificationReplyAwaitingRegime) async {
        let id = reply.clientMessageId
        guard let stored = await endToEnd.storedMessageIds(as: reply.senderId) else { return }
        let entry = stored.contains(id) ? await endToEnd.plaintexts(for: [id], as: reply.senderId)[id] : nil
        guard currentUserId() == reply.senderId else {
            Logger.e2ee.warning("notification reply: account switched while reading the vault, kept for its account")
            return
        }
        guard case .readable(let content, _)? = entry, let text = content.text else {
            store.remove(id)
            rules.notices.dropped(reply.conversationId, id)
            return
        }
        await sendReadable(reply.queueItem(content: text), reply.senderId)
        store.remove(id)
        rules.notices.settled(id)
        _ = await endToEnd.erase([id], as: reply.senderId)
    }

    /// La réponse ne partira jamais : elle se dit, puis son clair quitte le
    /// coffre ; un coffre fermé garde la fiche RETIRÉE jusqu'à l'effacement.
    private func withdraw(_ reply: NotificationReplyAwaitingRegime) async {
        rules.notices.dropped(reply.conversationId, reply.clientMessageId)
        guard await endToEnd.erase([reply.clientMessageId], as: reply.senderId) else {
            store.withdraw(reply.clientMessageId, at: rules.now())
            return
        }
        store.remove(reply.clientMessageId)
    }

    private func eraseWithdrawn(_ reply: NotificationReplyAwaitingRegime) async {
        guard await endToEnd.erase([reply.clientMessageId], as: reply.senderId) else { return }
        store.remove(reply.clientMessageId)
    }
}
